"""Gateway calls from task handlers: spend cap, cost estimate, llm_calls rows (TRD §10.1, I-12).

Call records are written on their own connection, so they survive the handler's rollback.
When the global daily cap is reached the task is deferred to the next UTC day; there is never a
fallback to another provider.
"""

import uuid
from datetime import UTC, datetime, timedelta

from pydantic import BaseModel
from sqlalchemy import func, insert, select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.db.models import LlmCall
from app.llm.gateway import TASKS, CallRecord, ErrorClass, Gateway, LLMError, LLMResult, build_gateway
from app.tasks.queue import Claimed, Deferred, TaskError

GATEWAY: Gateway | None = None  # tests assign a Gateway(FakeLLM(...)); the worker builds the real one lazily


def gateway() -> Gateway:
    global GATEWAY
    if GATEWAY is None:
        GATEWAY = build_gateway()
    return GATEWAY


def cost_usd(record: CallRecord) -> float:
    if record.cache_hit:
        return 0.0
    s, tier = get_settings(), TASKS[record.task].tier.value
    price_in, price_out = getattr(s, f"llm_price_{tier}_in"), getattr(s, f"llm_price_{tier}_out")
    return (record.tokens_in * price_in + record.tokens_out * price_out) / 1_000_000


def spent_today(db: Session) -> float:
    day = datetime.now(UTC).replace(hour=0, minute=0, second=0, microsecond=0)
    with db.get_bind().connect() as conn:
        return float(conn.scalar(select(func.coalesce(func.sum(LlmCall.cost), 0)).where(LlmCall.created_at >= day)))


def _seconds_to_next_utc_day() -> float:
    now = datetime.now(UTC)
    return ((now + timedelta(days=1)).replace(hour=0, minute=0, second=0, microsecond=0) - now).total_seconds()


def _persist(db: Session, task: Claimed, records: list[CallRecord]) -> None:
    if not records:
        return
    rows = [
        {
            "id": uuid.uuid4(), "trace_id": str(task.id), "user_id": task.user_id, "purpose": r.task,
            "model": r.model, "prompt_version": r.prompt_version, "tokens_in": r.tokens_in,
            "tokens_out": r.tokens_out, "cost": cost_usd(r), "latency_ms": r.latency_ms,
            "cache_hit": r.cache_hit, "error_class": r.error_class.value if r.error_class else None,
        }
        for r in records
    ]
    with db.get_bind().begin() as conn:
        conn.execute(insert(LlmCall), rows)


# error class -> (operation error code, user-facing message, retry)
_FAILURES = {
    ErrorClass.MODEL_REFUSED: ("MODEL_REFUSED", "The AI model declined this request. Nothing was saved or counted.", False),
    ErrorClass.VALIDATION: ("INTERNAL_ERROR", "The AI reply didn't pass our checks. Nothing was saved or counted.", False),
    ErrorClass.PII_BLOCKED: ("INTERNAL_ERROR", "Contact details were found in model input, so nothing was sent.", False),
}
_UNAVAILABLE = ("DEPENDENCY_UNAVAILABLE", "The AI service is busy. We'll retry automatically.", True)


def run(db: Session, task: Claimed, name: str, data: dict | BaseModel, untrusted_text: str | None = None) -> LLMResult:
    """Gateway.run behind the daily spend cap. LLMError becomes a TaskError with a user-facing message."""
    cap = get_settings().llm_daily_spend_cap_usd
    if spent_today(db) >= cap:
        raise Deferred("DEPENDENCY_UNAVAILABLE",
                       "Today's AI budget is used up. This will run automatically after 00:00 UTC.",
                       _seconds_to_next_utc_day())
    try:
        result = gateway().run(name, data, untrusted_text)
    except LLMError as e:
        _persist(db, task, e.calls)
        code, message, retry = _FAILURES.get(e.error_class, _UNAVAILABLE)
        raise TaskError(code, message, retry) from e
    _persist(db, task, result.calls)
    return result
