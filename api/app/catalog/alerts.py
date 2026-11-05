"""Email alerts (PRD §6.2, §7): a digest of new strong matches, weekly on the free plan (daily is for paid plans).

Cost: no model call per alert. A digest is one feed build in code (feed.build) limited to jobs first seen since
the last digest, keeping only feed.is_strong items. Nothing is sent when there are none.
Email goes out over SMTP when SMTP_HOST is set; otherwise it is logged only (development).

Scheduling: `python -m app.catalog.cli tick` from cron (hourly) enqueues due catalog_ingest and alert_digest tasks
with time-slot idempotency keys, so running it twice in a slot does nothing.
"""

import hashlib
import hmac
import logging
import smtplib
import ssl
import uuid
from datetime import UTC, datetime, timedelta
from email.message import EmailMessage

from sqlalchemy import select, text
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from app.catalog import feed
from app.catalog.ingest import enabled_sources
from app.core.config import get_settings
from app.db.models import FeedSettings, User
from app.tasks.queue import Claimed, enqueue

log = logging.getLogger("alerts")
MAX_JOBS = 5
PERIOD = {"daily": timedelta(days=1), "weekly": timedelta(days=7)}
SLACK = timedelta(hours=1)  # an hourly tick shouldn't push a weekly digest to the next week
FIT_WORDS = {"strong": "Many of your skills appear", "some": "Some of your skills appear",
             "little": "Few of your skills appear"}


def unsubscribe_token(user_id: uuid.UUID) -> str:
    """Signed, no expiry, valid only for turning alerts off (the link in every email)."""
    mac = hmac.new(get_settings().pseudonym_salt.encode(), f"alerts-unsubscribe:{user_id}".encode(), hashlib.sha256)
    return f"{user_id}.{mac.hexdigest()[:32]}"


def verify_token(token: str) -> uuid.UUID | None:
    uid, _, _ = token.partition(".")
    try:
        user_id = uuid.UUID(uid)
    except ValueError:
        return None
    return user_id if hmac.compare_digest(unsubscribe_token(user_id), token) else None


def settings_row(db: Session, uid: uuid.UUID) -> FeedSettings:
    db.execute(insert(FeedSettings).values(user_id=uid).on_conflict_do_nothing(index_elements=["user_id"]))
    return db.scalars(select(FeedSettings).where(FeedSettings.user_id == uid)).one()


def compose(user: User, items: list[dict]) -> EmailMessage:
    s = get_settings()
    app = s.app_url.rstrip("/")
    unsub = f"{app}/unsubscribe?token={unsubscribe_token(user.id)}"
    lines = [f"{len(items)} new job{'s' if len(items) > 1 else ''} where many of your confirmed skills appear:", ""]
    for it in items:
        where = ", ".join(x for x in (it["company"], it["location"], "remote" if it["remote"] else None) if x)
        lines += [f"{it['title']} · {where}", f"  {FIT_WORDS[it['fit']]}: {', '.join(it['skills'])}"]
        if it["goal"]:
            lines.append(f"  {it['goal']}")
        lines.append("")
    lines += [
        "This is an early read from the posting text, not a verdict. Open a job in Hunt to check every requirement",
        f"against your confirmed facts: {app}/feed",
        "",
        f"Stop these emails: {unsub}",
    ]
    msg = EmailMessage()
    msg["Subject"] = f"{len(items)} new job{'s' if len(items) > 1 else ''} that fit your skills"
    msg["From"], msg["To"] = s.smtp_from, user.email
    # RFC 8058 one-click unsubscribe: mail clients POST to this URL.
    msg["List-Unsubscribe"] = f"<{app}/v1/alerts/unsubscribe?token={unsubscribe_token(user.id)}>"
    msg["List-Unsubscribe-Post"] = "List-Unsubscribe=One-Click"
    msg.set_content("\n".join(lines))
    return msg


def send(msg: EmailMessage) -> bool:
    """True when handed to SMTP; False when SMTP isn't configured (logged instead)."""
    s = get_settings()
    if not s.smtp_host:
        log.info("SMTP_HOST unset; alert email not sent (subject=%r, jobs listed)", msg["Subject"])
        return False
    with smtplib.SMTP(s.smtp_host, s.smtp_port, timeout=20) as smtp:
        if s.smtp_port != 25:
            smtp.starttls(context=ssl.create_default_context())  # verifies the server certificate and host name
        if s.smtp_user:
            smtp.login(s.smtp_user, s.smtp_password or "")
        smtp.send_message(msg)
    return True


def digest_items(db: Session, uid: uuid.UUID, since: datetime | None, now: datetime | None = None,
                 frequency: str = "weekly") -> list[dict]:
    """New strong matches: first seen after the last digest (or within one period for the first one)."""
    now = now or datetime.now(UTC)
    items = feed.build(db, uid, since=since or now - PERIOD[frequency], now=now)
    return [it for it in items if feed.is_strong(it) and not it["saved"]][:MAX_JOBS]


def alert_digest(db: Session, task: Claimed) -> dict:
    """Worker task, run with app.user_id = the subscriber. Sends at most one email."""
    uid, now = task.user_id, datetime.now(UTC)
    row = settings_row(db, uid)
    user = db.get(User, uid)
    if row.alert_frequency == "off" or user is None or user.deleted_at or not user.email:
        return {"sent": False, "reason": "off or no email"}
    if row.last_alert_at and row.last_alert_at > now - PERIOD[row.alert_frequency] + SLACK:
        return {"sent": False, "reason": "not due"}
    items = digest_items(db, uid, row.last_alert_at, now, row.alert_frequency)
    row.last_alert_at = now  # also when empty: the next digest looks only at jobs newer than this one
    if not items:
        return {"sent": False, "jobs": 0}
    # Sent before commit: a failed commit could resend once on retry, never lose the user's setting.
    return {"sent": send(compose(user, [feed.public(i) for i in items])), "jobs": len(items)}


def tick(db: Session, now: datetime | None = None) -> dict:
    """Enqueue what is due (hunt_worker connection; reads every feed_settings row via its worker policy)."""
    s, now = get_settings(), now or datetime.now(UTC)
    slot = int(now.timestamp() // (s.catalog_ingest_hours * 3600))
    sources = list(enabled_sources())
    for key in sources:
        enqueue(db, user_id=None, type="catalog_ingest", payload={"source": key}, key=f"catalog_ingest:{key}:{slot}")
    due = db.execute(text("""
        SELECT user_id, alert_frequency FROM feed_settings
        WHERE alert_frequency <> 'off'
          AND (last_alert_at IS NULL OR last_alert_at <= :now - CASE alert_frequency
               WHEN 'daily' THEN interval '1 day' ELSE interval '7 days' END + interval '1 hour')
    """), {"now": now}).all()
    for uid, freq in due:
        period = now.strftime("%Y-%m-%d") if freq == "daily" else now.strftime("%G-W%V")
        enqueue(db, user_id=uid, type="alert_digest", payload={}, key=f"alert_digest:{uid}:{period}")
    return {"sources": sources, "digests": len(due)}
