"""Skills insight (PRD §6.4): the gaps that recur across the user's analysed jobs, as counts, never percentages.

Each job is re-read with the match page's own code (assess) under the current profile, so a gap the user closes
drops out at once. `learn`: things the user confirmed they lack (learning gaps). `record`: asked for, nothing
recorded yet (evidence gaps: maybe they have it). Jobs marked not interested are left out. Shape: src/lib/mock.ts
`SkillsInsight`.
"""

from fastapi import APIRouter
from sqlalchemy import select

from app.core.auth import CtxDep
from app.db.models import Job, JobFeedback
from app.routes.jobs import FEEDBACK_STATUS, _job
from app.tasks.match import assess, latest_analysis

router = APIRouter(tags=["insights"])

MIN_JOBS = 3  # fewer analysed jobs show no pattern yet
MIN_REPEATS = 2  # a gap is listed once it recurs


@router.get("/insights/skills")
def skills_insight(ctx: CtxDep):
    db = ctx.db
    jobs, gaps = 0, {}
    # shortcut: assess() per job, like GET /v1/jobs; store a per-analysis gap summary if job counts grow large.
    for row in db.scalars(select(Job).order_by(Job.created_at, Job.id)):
        job, jv = _job(db, row.id)
        analysis = latest_analysis(db, jv.id)
        last = db.scalars(select(JobFeedback.action).where(JobFeedback.job_id == job.id,
                                                           JobFeedback.action.in_(list(FEEDBACK_STATUS)))
                          .order_by(JobFeedback.created_at.desc()).limit(1)).first()
        if analysis is None or last in ("not_interested", "dismiss"):
            continue
        jobs += 1
        seen = set()
        for r in assess(db, job, jv, analysis)["requirements"]:
            key = " ".join(r["text"].lower().split())
            if r["status"] not in ("gap", "no_evidence") or key in seen:
                continue
            seen.add(key)
            g = gaps.setdefault(key, {"label": r["text"], "jobs": 0, "required": 0, "confirmed": False})
            g["jobs"] += 1
            g["required"] += r["importance"] == "required"
            g["confirmed"] |= r["status"] == "gap"
    shown = sorted((g for g in gaps.values() if g["jobs"] >= MIN_REPEATS and jobs >= MIN_JOBS),
                   key=lambda g: (-g["jobs"], -g["required"], g["label"].lower()))

    def items(confirmed: bool) -> list[dict]:
        return [{k: g[k] for k in ("label", "jobs", "required")} for g in shown if g["confirmed"] == confirmed]

    return {"jobs": jobs, "minJobs": MIN_JOBS, "learn": items(True), "record": items(False)}
