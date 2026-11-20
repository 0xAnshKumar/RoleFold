"""Account: /v1/me, export (TRD §5.5), deletion request (TRD §12.4)."""

import io
import json
import logging
import zipfile
from datetime import UTC, datetime, timedelta
from typing import Literal

from fastapi import APIRouter, Response
from fastapi.encoders import jsonable_encoder
from pydantic import BaseModel, Field
from sqlalchemy import event, func, select

from app import render
from app.core import secretbox, storage
from app.core.auth import CtxDep
from app.core.errors import ApiError
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
    UserAiKey,
)
from app.llm.gateway import check_key
from app.tasks.deletion import pseudonym
from app.tasks.exports import resume_doc
from app.tasks.queue import enqueue, operation

router = APIRouter(tags=["account"])
log = logging.getLogger(__name__)

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


class AiKeyPut(BaseModel):
    provider: Literal["gemini", "anthropic", "openai"]
    api_key: str = Field(min_length=20, max_length=300, pattern=r"^[A-Za-z0-9_\-]+$")


def _ai_key(ctx) -> dict:
    if not secretbox.enabled():
        return {"available": False, "set": False, "last4": None}
    row = ctx.db.scalars(select(UserAiKey).where(UserAiKey.user_id == ctx.user.id)).one_or_none()
    return {"available": True, "set": row is not None, "last4": row.last4 if row else None,
            "provider": row.provider if row else None,
            "added_at": row.created_at if row else None}


@router.get("/me/ai-key")
def get_ai_key(ctx: CtxDep):
    """Never returns the key: only whether one is saved and its last 4 characters."""
    return _ai_key(ctx)


@router.put("/me/ai-key")
def put_ai_key(body: AiKeyPut, ctx: WriteCtxDep):
    """Checked with the provider against every model RoleFold runs before it is stored (model lookups, no tokens)."""
    if not secretbox.enabled():
        raise ApiError(404, "NOT_FOUND", "Using your own AI key isn't available on this server.")
    if reason := check_key(body.api_key, body.provider):
        raise ApiError(422, "VALIDATION_ERROR", reason)
    uid = ctx.user.id
    ctx.db.execute(UserAiKey.__table__.delete().where(UserAiKey.user_id == uid))
    ctx.db.add_all([UserAiKey(user_id=uid, provider=body.provider, key_enc=secretbox.seal(body.api_key, uid), last4=body.api_key[-4:]),
                    AuditLog(actor_id=uid, action="ai_key.saved", target=body.provider)])
    ctx.db.flush()
    return ctx.respond(200, _ai_key(ctx))


@router.delete("/me/ai-key")
def delete_ai_key(ctx: WriteCtxDep):
    uid = ctx.user.id
    ctx.db.execute(UserAiKey.__table__.delete().where(UserAiKey.user_id == uid))
    ctx.db.add(AuditLog(actor_id=uid, action="ai_key.removed"))
    ctx.db.flush()
    return ctx.respond(200, _ai_key(ctx))


def _tombstone(user_hash: str) -> None:
    try:
        storage.write_tombstone(user_hash)
    except OSError:
        log.exception("request-time tombstone failed; the delete_user task writes it")


@router.post("/me/delete", status_code=202)
def delete_me(ctx: WriteCtxDep):
    uid = ctx.user.id
    ctx.user.deleted_at = func.now()
    req = DeletionRequest(user_id=uid, user_hash=pseudonym(uid))
    ctx.db.add_all([req, AuditLog(actor_id=uid, action="account.delete_requested")])
    ctx.db.flush()
    # Tombstone once the request commits (never for a rolled-back one), so a backup restored before the worker
    # runs still re-applies the deletion. The delete_user task writes it again, so a failure here only logs.
    event.listen(ctx.db, "after_commit", lambda _db: _tombstone(req.user_hash), once=True)
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
