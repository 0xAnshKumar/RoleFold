"""Account: /v1/me, export (TRD §5.5), deletion request (TRD §12.4)."""

import io
import json
import zipfile
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Response
from fastapi.encoders import jsonable_encoder
from pydantic import BaseModel, Field
from sqlalchemy import func, select

from app import render
from app.core import storage
from app.core.auth import CtxDep
from app.core.idempotency import WriteCtxDep
from app.db.models import (
    RLS_TABLES,
    AuditLog,
    Base,
    DeletionRequest,
    Import,
    Profile,
    Resume,
    ResumeDraft,
    ResumeExport,
    ResumeVersion,
)
from app.tasks.deletion import pseudonym
from app.tasks.exports import resume_doc
from app.tasks.queue import enqueue, operation

router = APIRouter(tags=["account"])

BACKUP_RETENTION_DAYS = 30  # TRD §12.3 (proposed); shown to the user as the full-purge date.


class MePatch(BaseModel):
    locale: str | None = Field(None, max_length=20)
    country: str | None = Field(None, min_length=2, max_length=2)
    # Name and location stay on the user row; they go into resumes at render time, never to models (I-10).
    name: str | None = Field(None, max_length=120)
    headline: str | None = Field(None, max_length=200)
    location: str | None = Field(None, max_length=120)
    # Contact lines for exports only; never sent to a model (I-10).
    email: str | None = Field(None, max_length=254, pattern=r"^$|^[^@\s]+@[^@\s]+\.[^@\s]+$")
    phone: str | None = Field(None, max_length=40, pattern=r"^$|^[+\d][\d\s().-]{6,38}$")


def _profile(ctx) -> Profile:
    return ctx.db.scalars(select(Profile).where(Profile.user_id == ctx.user.id)).one()


def _me(ctx) -> dict:
    user = {k: v for k, v in ctx.user.as_dict().items() if k != "deleted_at"}
    return {**user, "headline": _profile(ctx).headline}


@router.get("/me")
def get_me(ctx: CtxDep):
    return _me(ctx)


@router.patch("/me")
def patch_me(body: MePatch, ctx: WriteCtxDep):
    changes = {k: v.strip() if isinstance(v, str) else v for k, v in body.model_dump(exclude_unset=True).items()}
    if "headline" in changes:
        _profile(ctx).headline = changes.pop("headline") or None
    for k, v in changes.items():
        setattr(ctx.user, k, v or None)
    ctx.db.flush()
    return ctx.respond(200, _me(ctx))


@router.get("/me/export")
def export_me(ctx: CtxDep):
    """A zip (TRD §5.5): data.json with every user-owned row (RLS-scoped, filtered by owner, binary columns
    excluded), the files the user uploaded, every resume file they exported, and a PDF of each resume as it is
    now. Code only (I-12). Zip paths are built from ids, never from user-typed filenames."""
    db, uid = ctx.db, ctx.user.id
    out = {}
    for mapper in Base.registry.mappers:
        model = mapper.class_
        col = RLS_TABLES.get(model.__tablename__)
        if col:
            rows = db.scalars(select(model).where(getattr(model, col) == uid))
            out[model.__tablename__] = [r.as_dict() for r in rows]
    data = {"exported_at": datetime.now(UTC), "user_id": uid, "data": out}
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("data.json", json.dumps(jsonable_encoder(data), ensure_ascii=False, indent=1))

        def add(name: str, key: str) -> None:
            try:
                z.writestr(name, storage.get(key))
            except FileNotFoundError:
                pass  # pasted text has no file, or it is gone; the row is still in data.json

        for imp in db.scalars(select(Import).where(Import.user_id == uid)):
            add(f"uploads/{imp.id}.{imp.format}", imp.source_file_key)
        for ex, rid, version in db.execute(select(ResumeExport, ResumeVersion.resume_id, ResumeVersion.version)
                                           .join(ResumeVersion, ResumeVersion.id == ResumeExport.resume_version_id)
                                           .where(ResumeExport.user_id == uid)):
            add(f"resumes/{rid}/exported-v{version}-{ex.id}.{ex.format}", ex.object_key)
        for r, draft in db.execute(select(Resume, ResumeDraft).join(ResumeDraft, ResumeDraft.resume_id == Resume.id)
                                   .where(Resume.user_id == uid)):
            z.writestr(f"resumes/{r.id}/current-{r.template_id}.pdf",
                       render.render(resume_doc(db, ctx.user, draft), r.template_id, "pdf"))
    return Response(buf.getvalue(), media_type="application/zip",
                    headers={"Content-Disposition": 'attachment; filename="hunt-export.zip"'})


@router.post("/me/delete", status_code=202)
def delete_me(ctx: WriteCtxDep):
    uid = ctx.user.id
    ctx.user.deleted_at = func.now()
    req = DeletionRequest(user_id=uid, user_hash=pseudonym(uid))
    ctx.db.add_all([req, AuditLog(actor_id=uid, action="account.delete_requested")])
    ctx.db.flush()
    # Tombstone at request time too, so a backup restored before the worker runs still re-applies the deletion.
    storage.write_tombstone(req.user_hash)
    task = enqueue(ctx.db, user_id=uid, type="delete_user", payload={"deletion_request_id": str(req.id)},
                   key=f"delete_user:{uid}")
    now = datetime.now(UTC)
    return ctx.respond(202, {
        "deletion_request_id": req.id,
        "operation": operation(task),
        # Access ends now and the delete task is queued; backups age out on their own schedule.
        "removed_on": now.date(),
        "backups_purged_by": (now + timedelta(days=BACKUP_RETENTION_DAYS)).date(),
    })
