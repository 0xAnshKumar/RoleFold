"""Postgres task queue (TRD §11.1, eng review: partial index + FOR NO KEY UPDATE SKIP LOCKED + lease).

State machine: queued -> running -> succeeded | queued (retry) | failed (non-retryable) | dead (DLQ).
A running task whose lease expires goes back to queued (or dead if out of attempts).
"""

import json
import random
import uuid
from dataclasses import dataclass

from sqlalchemy import Connection, select, text
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.db.models import Task

DB = Session | Connection


class TaskError(Exception):
    def __init__(self, code: str, message: str, retry: bool = True):
        super().__init__(message)
        self.code, self.retry = code, retry


class Deferred(TaskError):
    """Wait without using an attempt (spend cap hit, TRD §10.1): the task stays queued until `delay_s`."""

    def __init__(self, code: str, message: str, delay_s: float):
        super().__init__(code, message)
        self.delay_s = delay_s


class LeaseLost(Exception):
    """Another worker re-claimed the task after our lease expired; our effects must roll back."""


@dataclass
class Claimed:
    id: uuid.UUID
    user_id: uuid.UUID | None
    type: str
    payload: dict
    attempts: int
    idempotency_key: str


def enqueue(db: Session, *, user_id: uuid.UUID | None, type: str, payload: dict, key: str) -> Task:
    """Call inside the transaction that writes the record the task works on. Same key -> same task."""
    task = db.scalars(
        insert(Task)
        .values(
            user_id=user_id, type=type, payload=payload, idempotency_key=key,
            max_attempts=get_settings().task_max_attempts,
        )
        .on_conflict_do_nothing(index_elements=["idempotency_key"])
        .returning(Task)
    ).first()
    return task or db.scalars(select(Task).where(Task.idempotency_key == key)).one()


# A dead task never runs again, so its last error ("We'll retry automatically") would mislead.
DEAD_MESSAGE = "This didn't finish after several tries and won't retry on its own. Nothing was counted against your limit; try again in a few minutes."


def operation(task: Task) -> dict:
    """Operation object for 202 responses and GET /v1/tasks/{id} (TRD §11.2)."""
    message = DEAD_MESSAGE if task.status == "dead" else task.error_message
    return {
        "id": task.id,
        "type": task.type,
        "state": "failed" if task.status == "dead" else task.status,
        "basis": task.payload.get("basis"),
        "result": task.result,
        "error": {"code": task.error_code, "message": message} if task.error_code else None,
        "created_at": task.created_at,
        "updated_at": task.updated_at,
    }


def requeue_expired(db: DB) -> int:
    return db.execute(
        text("""
        UPDATE tasks SET
          status = CASE WHEN attempts >= max_attempts THEN 'dead' ELSE 'queued' END,
          error_code = 'INTERNAL_ERROR', error_message = 'lease expired',
          lease_until = NULL, updated_at = now()
        WHERE id IN (
          SELECT id FROM tasks WHERE status = 'running' AND lease_until < now()
          FOR NO KEY UPDATE SKIP LOCKED
        )
        """)
    ).rowcount


def claim(db: DB, types: list[str]) -> Claimed | None:
    row = db.execute(
        text("""
        UPDATE tasks SET status = 'running', attempts = attempts + 1, updated_at = now(),
          lease_until = now() + make_interval(secs => :lease)
        WHERE id = (
          SELECT id FROM tasks
          WHERE status = 'queued' AND run_after <= now() AND type = ANY(:types)
          ORDER BY run_after
          LIMIT 1
          FOR NO KEY UPDATE SKIP LOCKED
        )
        RETURNING id, user_id, type, payload, attempts, idempotency_key
        """),
        {"lease": get_settings().task_lease_seconds, "types": types},
    ).first()
    return Claimed(*row) if row else None


def complete(db: DB, task: Claimed, result: dict | None) -> None:
    """Run in the handler's transaction so effects and completion commit together (I-15)."""
    done = db.execute(
        text("""
        UPDATE tasks SET status = 'succeeded', result = CAST(:r AS jsonb), lease_until = NULL,
          error_code = NULL, error_message = NULL, updated_at = now()
        WHERE id = :id AND status = 'running' AND attempts = :a
        """),
        {"id": task.id, "a": task.attempts, "r": _json(result)},
    ).rowcount
    if not done:
        raise LeaseLost(str(task.id))


def backoff_seconds(attempts: int) -> float:
    """Exponential backoff with jitter: 30 s, 1, 2, 4 min... capped at 10 minutes. Five attempts span ~4-7 minutes,
    enough to ride out an AI-provider busy spell (503s) instead of failing the user's import in half a minute."""
    return min(30.0 * 2.0 ** (attempts - 1), 600.0) * random.uniform(0.5, 1.0)


def fail(db: DB, task: Claimed, code: str, message: str, retry: bool = True) -> str | None:
    """Returns the new status (queued, failed or dead), or None if the lease was lost."""
    return db.scalar(
        text("""
        UPDATE tasks SET
          status = CASE WHEN NOT :retry THEN 'failed' WHEN attempts >= max_attempts THEN 'dead' ELSE 'queued' END,
          run_after = now() + make_interval(secs => :delay),
          error_code = :code, error_message = :msg, lease_until = NULL, updated_at = now()
        WHERE id = :id AND status = 'running' AND attempts = :a
        RETURNING status
        """),
        {
            "id": task.id, "a": task.attempts, "retry": retry, "code": code, "msg": message[:500],
            "delay": backoff_seconds(task.attempts),
        },
    )


def defer(db: DB, task: Claimed, code: str, message: str, delay_s: float) -> None:
    """Back to queued with the attempt given back; the operation shows the message meanwhile."""
    db.execute(
        text("""
        UPDATE tasks SET status = 'queued', attempts = attempts - 1,
          run_after = now() + make_interval(secs => :delay),
          error_code = :code, error_message = :msg, lease_until = NULL, updated_at = now()
        WHERE id = :id AND status = 'running' AND attempts = :a
        """),
        {"id": task.id, "a": task.attempts, "code": code, "msg": message[:500], "delay": delay_s},
    )


def _json(value: dict | None) -> str | None:
    return None if value is None else json.dumps(value, default=str)
