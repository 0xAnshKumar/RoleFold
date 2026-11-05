"""regenerate task: "Update with new facts" on a master resume (TRD §16.3: the user chooses to regenerate).

The tailor task writes into a scratch resume (same selection, writing and truth checks); its lines then
become the next version of the existing resume, which keeps its id, template and tailored children.
One transaction: on any failure the old version stays as it was.
"""

import uuid
from dataclasses import replace

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db.models import Resume, ResumeDraft, ResumeVersion
from app.routes.resumes import snapshot
from app.tasks.queue import Claimed, TaskError
from app.tasks.tailor import tailor_resume


def regenerate_resume(db: Session, task: Claimed) -> dict:
    p = task.payload
    rid, scratch = uuid.UUID(p["resume_id"]), uuid.UUID(p["scratch_id"])
    if db.scalar(select(ResumeDraft.resume_id).where(ResumeDraft.resume_id == rid)) is None:
        raise TaskError("NOT_FOUND", "This resume no longer exists.", retry=False)
    # Model calls first, without a lock, so line edits and exports on this resume don't wait minutes.
    result = tailor_resume(db, replace(task, payload={**p, "resume_id": str(scratch)}))
    new = db.scalars(select(ResumeVersion).where(ResumeVersion.resume_id == scratch)).one()
    draft = db.scalars(select(ResumeDraft).where(ResumeDraft.resume_id == rid).with_for_update()).first()
    if draft is None:
        raise TaskError("NOT_FOUND", "This resume no longer exists.", retry=False)
    snapshot(db, draft)  # keep the user's unexported line edits as their own version before replacing them
    latest = db.scalar(select(func.max(ResumeVersion.version)).where(ResumeVersion.resume_id == rid))
    db.add(ResumeVersion(
        resume_id=rid, user_id=new.user_id, version=latest + 1, profile_version=new.profile_version,
        selected_fact_version_ids=new.selected_fact_version_ids, statements=new.statements,
        layout_options=draft.layout_options, check_summary=new.check_summary, basis=new.basis,
    ))
    draft.statements, draft.profile_version = new.statements, new.profile_version
    draft.version, draft.updated_at = draft.version + 1, func.now()
    db.delete(db.get(Resume, scratch))  # its draft and version cascade
    return {**result, "resume_id": str(rid)}
