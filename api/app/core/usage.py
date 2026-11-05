"""Usage reservation (TRD §11.1) with CEO D19 deep-match accounting.

reserve -> (task) convert on success | release on failure or insufficient detail.
Reservations not settled within RESERVATION_TTL_SECONDS are released lazily on the next
reserve/read for that user, unless their task is still queued or running: a task waiting on the
daily spend cap (or a retry backoff) keeps its reservation until it settles it.
"""

import uuid
from datetime import UTC, date, datetime

from sqlalchemy import delete, select, text
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.errors import ApiError
from app.db.models import USAGE_METRICS, UsageCounter, UsageReservation


def current_period(now: datetime | None = None) -> str:
    return (now or datetime.now(UTC)).strftime("%Y-%m")


def limit_for(metric: str) -> int:
    s = get_settings()
    return {"tailored_resume": s.free_tailored_per_month, "deep_match": s.free_deep_matches_per_month}[metric]


def expire_stale(db: Session, user_id: uuid.UUID) -> None:
    db.execute(
        text("""
        WITH r AS (
          UPDATE usage_reservations SET state = 'released'
          WHERE user_id = :u AND state = 'reserved' AND created_at < now() - make_interval(secs => :ttl)
            AND NOT EXISTS (
              SELECT 1 FROM tasks t WHERE t.user_id = :u AND t.status IN ('queued', 'running')
                AND t.payload->>'reservation_id' = usage_reservations.id::text
            )
          RETURNING metric, period
        )
        UPDATE usage_counters c SET reserved = c.reserved - x.n
        FROM (SELECT metric, period, count(*) AS n FROM r GROUP BY metric, period) x
        WHERE c.user_id = :u AND c.metric = x.metric AND c.period = x.period
        """),
        {"u": user_id, "ttl": get_settings().reservation_ttl_seconds},
    )


def reserve(db: Session, user_id: uuid.UUID, metric: str, subject: str | None = None) -> uuid.UUID | None:
    """Returns the reservation id, or None when `subject` was already charged (free repeat).

    Raises PLAN_LIMIT_REACHED. Must run in the same transaction as the work it pays for.
    """
    period = current_period()
    expire_stale(db, user_id)
    reservation_id = db.scalar(
        insert(UsageReservation)
        .values(user_id=user_id, metric=metric, period=period, subject=subject)
        .on_conflict_do_nothing(
            index_elements=["user_id", "metric", "subject"], index_where=text("state <> 'released'")
        )
        .returning(UsageReservation.id)
    )
    if reservation_id is None:
        return None
    db.execute(
        insert(UsageCounter)
        .values(user_id=user_id, metric=metric, period=period)
        .on_conflict_do_nothing(index_elements=["user_id", "metric", "period"])
    )
    ok = db.scalar(
        text("""
        UPDATE usage_counters SET reserved = reserved + 1
        WHERE user_id = :u AND metric = :m AND period = :p AND used + reserved < :limit
        RETURNING id
        """),
        {"u": user_id, "m": metric, "p": period, "limit": limit_for(metric)},
    )
    if ok is None:
        # Leave no trace even if the caller catches this and commits.
        db.execute(delete(UsageReservation).where(UsageReservation.id == reservation_id))
        raise ApiError(402, "PLAN_LIMIT_REACHED", "You have used this month's free allowance.", {"metric": metric})
    return reservation_id


def _settle(db: Session, reservation_id: uuid.UUID, state: str, used_delta: int) -> bool:
    return (
        db.scalar(
            text("""
            WITH r AS (
              UPDATE usage_reservations SET state = :state
              WHERE id = :id AND state = 'reserved'
              RETURNING user_id, metric, period
            )
            UPDATE usage_counters c SET reserved = c.reserved - 1, used = c.used + :d
            FROM r WHERE c.user_id = r.user_id AND c.metric = r.metric AND c.period = r.period
            RETURNING c.id
            """),
            {"id": reservation_id, "state": state, "d": used_delta},
        )
        is not None
    )


def convert(db: Session, reservation_id: uuid.UUID) -> bool:
    """Idempotent: False if already settled or expired."""
    return _settle(db, reservation_id, "converted", 1)


def release(db: Session, reservation_id: uuid.UUID) -> bool:
    return _settle(db, reservation_id, "released", 0)


def summary(db: Session, user_id: uuid.UUID) -> dict:
    expire_stale(db, user_id)
    period = current_period()
    rows = {
        c.metric: c
        for c in db.scalars(
            select(UsageCounter).where(UsageCounter.user_id == user_id, UsageCounter.period == period)
        )
    }
    metrics = {
        m: {
            "used": rows[m].used if m in rows else 0,
            "reserved": rows[m].reserved if m in rows else 0,
            "limit": limit_for(m),
        }
        for m in USAGE_METRICS
    }
    y, mo = map(int, period.split("-"))
    resets = date(y + mo // 12, mo % 12 + 1, 1)
    tailoring = get_settings().tailoring_enabled
    if not tailoring:  # no tailored-resume meter while tailoring is off
        del metrics["tailored_resume"]
    # src/lib/mock.ts `usage` shape first; `period` and `metrics` add reserved counts.
    return {
        "tailoring": tailoring,
        **({"tailored": {k: metrics["tailored_resume"][k] for k in ("used", "limit")}} if tailoring else {}),
        "matches": {k: metrics["deep_match"][k] for k in ("used", "limit")},
        "resetsOn": f"{resets.day} {resets.strftime('%b %Y')}",
        "period": period,
        "metrics": metrics,
    }
