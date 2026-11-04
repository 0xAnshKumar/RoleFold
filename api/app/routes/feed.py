"""Recommendations feed, card feedback, opening a full check, alert settings (PRD §6.2; app/catalog/).

Plan accounting: browsing the feed is free and uncounted (code only). "Check this job" copies the posting into the
user's jobs and runs the same match pipeline as a paste, reserving one deep_match only then (CEO D19: re-opening is
free). Response shapes follow src/lib/mock.ts `Feed`.
"""

import uuid
from datetime import UTC, datetime
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field
from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from app.catalog import feed
from app.catalog.alerts import settings_row, verify_token
from app.core.auth import CtxDep
from app.core.config import get_settings
from app.core.errors import ApiError
from app.core.idempotency import WriteCtxDep
from app.db.models import CatalogFeedback, CatalogJob, FeedSettings, Job, Task
from app.db.session import get_db, set_user
from app.routes.jobs import _job, _list_item, start_match
from app.tasks.queue import operation

router = APIRouter(tags=["feed"])


def _alerts(db: Session, user) -> dict:
    row = settings_row(db, user.id)
    # PRD §7: weekly alerts on the free plan, daily on paid plans (none exist yet).
    return {"frequency": row.alert_frequency, "hasEmail": bool(user.email), "dailyAllowed": user.plan != "free"}


@router.get("/feed")
def get_feed(ctx: CtxDep, q: str | None = Query(None, max_length=100), remote: bool = False,
             days: int | None = Query(None, ge=1, le=90), saved: bool = False):
    db = ctx.db
    items = feed.build(db, ctx.user.id, q=q, remote=remote, days=days, saved_only=saved)
    ids = [uuid.UUID(i["id"]) for i in items]
    mine = {j.catalog_job_id: j for j in db.scalars(select(Job).where(Job.catalog_job_id.in_(ids)))} if ids else {}
    for it in items:
        job = mine.get(uuid.UUID(it["id"]))
        if job:
            row = _list_item(db, *_job(db, job.id))
            it["check"] = {"jobId": str(job.id), "verdict": row["verdict"], "gaps": row["gaps"], "state": row["state"]}
    return {
        "items": [feed.public(i) for i in items],
        "learned": feed.learned_summary(feed.affinity(db, ctx.user.id, datetime.now(UTC))),
        "alerts": _alerts(db, ctx.user),
        "catalogSize": db.scalar(select(func.count()).select_from(CatalogJob).where(CatalogJob.lifecycle == "active")),
        "rankVersion": feed.RANK_VERSION,
    }


def _catalog_job(db: Session, catalog_job_id: uuid.UUID) -> CatalogJob:
    cj = db.get(CatalogJob, catalog_job_id)
    if cj is None:
        raise ApiError(404, "NOT_FOUND", "Not found.")
    return cj


class FeedbackIn(BaseModel):
    action: Literal["save", "dismiss", "clear"]
    reasons: list[str] = Field(default_factory=list, max_length=5)


@router.post("/feed/{catalog_job_id}/feedback", status_code=201)
def post_feedback(catalog_job_id: uuid.UUID, body: FeedbackIn, ctx: WriteCtxDep):
    """Save, dismiss (optional one-tap reasons) or clear (undo). The latest row is the card's state."""
    cj = _catalog_job(ctx.db, catalog_job_id)
    reasons = [r.strip()[:50] for r in body.reasons if r.strip()]
    ctx.db.add(CatalogFeedback(user_id=ctx.user.id, catalog_job_id=cj.id, action=body.action,
                               reason_code=",".join(reasons) or None))
    ctx.db.flush()
    return ctx.respond(201, {"id": str(cj.id), "action": body.action, "reasons": reasons})


def posting_text(cj: CatalogJob) -> str:
    head = "\n".join(x for x in (cj.title, " · ".join(y for y in (cj.company, cj.location) if y)) if x)
    return f"{head}\n\n{cj.description}"[: get_settings().job_paste_max_chars]


@router.post("/feed/{catalog_job_id}/check", status_code=202)
def check_job(catalog_job_id: uuid.UUID, ctx: WriteCtxDep):
    """Open the full check: 202 with the match operation, or 200 with the existing one (free, D19)."""
    db = ctx.db
    cj = _catalog_job(db, catalog_job_id)
    existing = db.scalars(select(Job).where(Job.catalog_job_id == cj.id)).first()
    if existing:
        _, jv = _job(db, existing.id)
        task = db.scalars(select(Task).where(Task.idempotency_key == f"match:{jv.id}")).first()
        return ctx.respond(200, {"job_id": existing.id, "job_version_id": jv.id,
                                 "operation": operation(task) if task else None})
    if cj.lifecycle != "active" or cj.scam_state in ("suspected", "confirmed"):
        raise ApiError(404, "NOT_FOUND", "This job is no longer listed.")
    job = Job(owner_user_id=ctx.user.id, company=cj.company, title=cj.title, apply_url=cj.apply_url,
              catalog_job_id=cj.id, lifecycle="active")
    return ctx.respond(202, start_match(db, job, posting_text(cj)))


class SettingsIn(BaseModel):
    frequency: Literal["off", "weekly", "daily"]


@router.put("/feed/settings")
def put_settings(body: SettingsIn, ctx: WriteCtxDep):
    if body.frequency == "daily" and ctx.user.plan == "free":
        raise ApiError(402, "PLAN_LIMIT_REACHED", "Daily alerts come with paid plans. Weekly alerts are free.",
                       {"metric": "alerts"})
    row = settings_row(ctx.db, ctx.user.id)
    row.alert_frequency, row.updated_at = body.frequency, func.now()
    ctx.db.flush()
    return ctx.respond(200, _alerts(ctx.db, ctx.user))


@router.post("/feed/signals/reset")
def reset_signals(ctx: WriteCtxDep):
    """Forget what the feed learned from feedback so far (PRD §6.5). The feedback rows stay as history."""
    row = settings_row(ctx.db, ctx.user.id)
    row.signals_reset_at = func.now()
    ctx.db.flush()
    return ctx.respond(200, {"learned": []})


@router.post("/alerts/unsubscribe")
def unsubscribe(db: Annotated[Session, Depends(get_db, scope="function")], token: str = Query(max_length=100)):
    """No sign-in: the signed token in the email is the credential, and it can only turn alerts off.
    Also the RFC 8058 one-click target (List-Unsubscribe-Post)."""
    uid = verify_token(token)
    if uid is None:
        raise ApiError(400, "VALIDATION_ERROR", "This unsubscribe link isn't valid.")
    set_user(db, uid)
    db.execute(update(FeedSettings).where(FeedSettings.user_id == uid)
               .values(alert_frequency="off", updated_at=func.now()))
    return {"frequency": "off"}
