"""Jobs (paste-a-job is the only source at beta, CEO R1), match page, feedback, tailoring (TRD §11.3).

Response shapes follow src/lib/mock.ts (`savedJobs`, `Match`).
"""

import hashlib
import re
import uuid
from typing import Literal

from fastapi import APIRouter
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core import usage
from app.core.auth import CtxDep
from app.core.config import get_settings
from app.core.display import short_day
from app.core.errors import ApiError
from app.core.idempotency import WriteCtxDep
from app.db.models import Job, JobFeedback, JobRequirement, JobVersion, SkillAssertion, Task
from app.routes.resumes import TEMPLATE_IDS, freeze_basis
from app.tasks.match import assess, latest_analysis
from app.tasks.queue import enqueue, operation
from app.truth.url_paste import is_url_only

router = APIRouter(tags=["jobs"])
MIN_PASTE_CHARS = 200


class PasteIn(BaseModel):
    text: str = Field(min_length=1)
    apply_url: str | None = Field(None, max_length=2000)


def description_hash(text: str) -> str:
    return hashlib.sha256(re.sub(r"\s+", " ", text).strip().lower().encode()).hexdigest()


@router.post("/jobs/paste", status_code=202)
def paste_job(body: PasteIn, ctx: WriteCtxDep):
    text = body.text.strip()
    max_chars = get_settings().job_paste_max_chars
    if not text or len(text) > max_chars:
        raise ApiError(422, "VALIDATION_ERROR", f"Paste between 1 and {max_chars} characters.")
    # Before any quota is reserved; the link is never fetched (CEO D28).
    if is_url_only(text):
        raise ApiError(422, "URL_ONLY_PASTE", "We don't open links. Copy the job description text and paste it here.")
    if len(text) < MIN_PASTE_CHARS:  # same floor as the paste box (src/app/(app)/jobs/PasteJob.tsx)
        raise ApiError(422, "PASTE_TOO_SHORT", "That looks too short to be a full job description. Paste the whole "
                       "posting, including the requirements. This didn't use any of your monthly checks.",
                       {"min_chars": MIN_PASTE_CHARS})
    job = Job(owner_user_id=ctx.user.id, apply_url=body.apply_url)
    return ctx.respond(202, start_match(ctx.db, job, text))


def start_match(db: Session, job: Job, text: str) -> dict:
    """Store the job and its text, reserve one deep_match (402 PLAN_LIMIT_REACHED) and queue the match task."""
    uid = job.owner_user_id
    db.add(job)
    db.flush()
    jv = JobVersion(job_id=job.id, owner_user_id=uid, version=1, raw_text=text, description_hash=description_hash(text))
    db.add(jv)
    db.flush()
    reservation_id = usage.reserve(db, uid, "deep_match", subject=str(jv.id))
    task = enqueue(
        db, user_id=uid, type="match", key=f"match:{jv.id}",
        payload={"job_version_id": str(jv.id), "reservation_id": str(reservation_id) if reservation_id else None},
    )
    return {"job_id": job.id, "job_version_id": jv.id, "operation": operation(task)}


# ---------------------------------------------------------------- reads

FEEDBACK_STATUS = {"save": "saved", "applied": "applied", "not_interested": "not_interested", "dismiss": "dismissed"}


def _job(db: Session, job_id: uuid.UUID) -> tuple[Job, JobVersion]:
    job = db.get(Job, job_id)  # RLS: other users' jobs are invisible -> 404
    if job is None:
        raise ApiError(404, "NOT_FOUND", "Not found.")
    jv = db.scalars(select(JobVersion).where(JobVersion.job_id == job.id).order_by(JobVersion.version.desc())).first()
    return job, jv


def _public(view: dict) -> dict:
    return {k: v for k, v in view.items() if not k.startswith("_")}


def _list_item(db: Session, job: Job, jv: JobVersion) -> dict:
    """`savedJobs` item. verdict is null while the analysis runs; `state` says which."""
    # ponytail: assess() per job is a few queries each; store a summary row if job lists grow large.
    analysis = latest_analysis(db, jv.id)
    view = assess(db, job, jv, analysis) if analysis else None
    task = db.scalars(select(Task).where(Task.idempotency_key == f"match:{jv.id}")).first()
    last = db.scalars(select(JobFeedback.action).where(JobFeedback.job_id == job.id,
                                                     JobFeedback.action.in_(list(FEEDBACK_STATUS)))
                      .order_by(JobFeedback.created_at.desc()).limit(1)).first()
    gaps = sum(r["importance"] == "required" and r["status"] in ("no_evidence", "gap")
               for r in view["requirements"]) if view else 0
    return {
        "id": str(job.id), "title": job.title or "Untitled role", "company": job.company or "",
        "verdict": view["verdict"] if view else None, "status": FEEDBACK_STATUS.get(last, "saved"),
        "gaps": gaps, "added": short_day(job.created_at),
        "state": "ready" if view else (operation(task)["state"] if task else "queued"),
        "operation": operation(task) if task else None,
    }


@router.get("/jobs")
def list_jobs(ctx: CtxDep):
    jobs = ctx.db.scalars(select(Job).order_by(Job.created_at.desc(), Job.id)).all()
    return {"items": [_list_item(ctx.db, *_job(ctx.db, j.id)) for j in jobs], "next_cursor": None}


@router.get("/jobs/{job_id}")
def get_job(job_id: uuid.UUID, ctx: CtxDep):
    job, jv = _job(ctx.db, job_id)
    return {**_list_item(ctx.db, job, jv), "text": jv.raw_text, "applyUrl": job.apply_url, "jobVersionId": str(jv.id)}


@router.get("/jobs/{job_id}/match")
def get_match(job_id: uuid.UUID, ctx: CtxDep):
    """Recomputed in code on every view under the current preferences (TRD §9.5)."""
    job, jv = _job(ctx.db, job_id)
    analysis = latest_analysis(ctx.db, jv.id)
    if analysis is None:
        task = ctx.db.scalars(select(Task).where(Task.idempotency_key == f"match:{jv.id}")).first()
        raise ApiError(404, "NOT_FOUND", "This job's analysis isn't ready yet.",
                       {"operation": operation(task) if task else None})
    return _public(assess(ctx.db, job, jv, analysis))


# ---------------------------------------------------------------- writes


class FeedbackIn(BaseModel):
    # assessment_right / assessment_wrong are the match-page thumbs (CEO D26).
    action: Literal["assessment_right", "assessment_wrong", "save", "dismiss", "applied", "not_interested"]
    reasons: list[str] = Field(default_factory=list, max_length=10)


@router.post("/jobs/{job_id}/feedback", status_code=201)
def post_feedback(job_id: uuid.UUID, body: FeedbackIn, ctx: WriteCtxDep):
    job, jv = _job(ctx.db, job_id)
    analysis = latest_analysis(ctx.db, jv.id)
    reasons = [r.strip()[:50] for r in body.reasons if r.strip()]
    fb = JobFeedback(user_id=ctx.user.id, job_id=job.id, match_analysis_id=analysis.id if analysis else None,
                     action=body.action, reason_code=",".join(reasons) or None)
    ctx.db.add(fb)
    ctx.db.flush()
    return ctx.respond(201, {"id": fb.id, "action": fb.action, "reasons": reasons})


STATUS_ACTION = {"saved": "save", "applied": "applied", "not_interested": "not_interested"}


class JobPatch(BaseModel):
    status: Literal["saved", "applied", "not_interested"]


@router.patch("/jobs/{job_id}")
def patch_job(job_id: uuid.UUID, body: JobPatch, ctx: WriteCtxDep):
    """List status is the latest save/applied/not_interested feedback row (history is kept)."""
    job, jv = _job(ctx.db, job_id)
    analysis = latest_analysis(ctx.db, jv.id)
    ctx.db.add(JobFeedback(user_id=ctx.user.id, job_id=job.id, match_analysis_id=analysis.id if analysis else None,
                           action=STATUS_ACTION[body.status]))
    ctx.db.flush()
    return ctx.respond(200, _list_item(ctx.db, job, jv))


class GapIn(BaseModel):
    confirmed: bool


@router.post("/jobs/{job_id}/requirements/{requirement_id}/gap")
def confirm_gap(job_id: uuid.UUID, requirement_id: uuid.UUID, body: GapIn, ctx: WriteCtxDep):
    """The user says they don't have this (confirmed_gap comes only from the user, TRD §9.4); false withdraws it.

    Stored as a does_not_have skill assertion keyed by the requirement text, so it applies to every job
    asking for the same thing. The verdict is recomputed in code.
    """
    job, jv = _job(ctx.db, job_id)
    req = ctx.db.get(JobRequirement, requirement_id)
    if req is None or req.job_version_id != jv.id:
        raise ApiError(404, "NOT_FOUND", "Not found.")
    analysis = latest_analysis(ctx.db, jv.id)
    if analysis is None:
        raise ApiError(404, "NOT_FOUND", "This job's analysis isn't ready yet.")
    keys = {k.lower() for k in (req.value, req.quote) if k}
    active = [a for a in ctx.db.scalars(select(SkillAssertion).where(
        SkillAssertion.assertion == "does_not_have", SkillAssertion.withdrawn_at.is_(None)))
        if (a.requirement_text or a.skill_id or "").lower() in keys]
    if body.confirmed and not active:
        ctx.db.add(SkillAssertion(user_id=ctx.user.id, skill_id=req.skill_id, requirement_text=req.value or req.quote,
                                  assertion="does_not_have"))
    if not body.confirmed:
        for a in active:
            a.withdrawn_at = func.now()
    ctx.db.flush()
    return ctx.respond(200, _public(assess(ctx.db, job, jv, analysis)))


class TailorIn(BaseModel):
    template: str = "classic"


@router.post("/jobs/{job_id}/tailored-resume", status_code=202)
def tailor_for_job(job_id: uuid.UUID, ctx: WriteCtxDep, body: TailorIn | None = None):
    if not get_settings().tailoring_enabled:  # checked first: nothing is reserved or enqueued
        raise ApiError(404, "NOT_FOUND", "Tailoring resumes for a job is turned off.", {"reason": "tailoring_off"})
    body = body or TailorIn()  # the match page posts no body: default template
    if body.template not in TEMPLATE_IDS:
        raise ApiError(422, "VALIDATION_ERROR", "Unknown template.", {"templates": sorted(TEMPLATE_IDS)})
    job, jv = _job(ctx.db, job_id)
    uid = ctx.user.id
    analysis = latest_analysis(ctx.db, jv.id)
    frozen = freeze_basis(ctx.db, uid, job_version_id=str(jv.id),
                          match_analysis_id=str(analysis.id) if analysis else None)
    reservation_id = usage.reserve(ctx.db, uid, "tailored_resume")  # 402 PLAN_LIMIT_REACHED
    resume_id = uuid.uuid4()
    task = enqueue(ctx.db, user_id=uid, type="tailor", key=f"tailor:{uid}:{ctx.key}", payload={
        "resume_id": str(resume_id), "kind": "tailored", "template_id": body.template,
        "job_version_id": str(jv.id), "target": job.title, "reservation_id": str(reservation_id), "basis": frozen,
    })
    return ctx.respond(202, {"resume_id": resume_id, "operation": operation(task)})
