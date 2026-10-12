"""Account: /v1/me, export (TRD §5.5), deletion request (TRD §12.4)."""

from datetime import UTC, datetime, timedelta

from fastapi import APIRouter
from pydantic import BaseModel, Field
from sqlalchemy import func, select

from app.core.auth import CtxDep
from app.core.idempotency import WriteCtxDep
from app.db.models import RLS_TABLES, AuditLog, Base, DeletionRequest, Profile
from app.tasks.deletion import pseudonym
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
    """Every user-owned row, RLS-scoped and filtered by owner. Binary columns are excluded."""
    out = {}
    for mapper in Base.registry.mappers:
        model = mapper.class_
        col = RLS_TABLES.get(model.__tablename__)
        if col:
            rows = ctx.db.scalars(select(model).where(getattr(model, col) == ctx.user.id))
            out[model.__tablename__] = [r.as_dict() for r in rows]
    return {"exported_at": datetime.now(UTC), "user_id": ctx.user.id, "data": out}


@router.post("/me/delete", status_code=202)
def delete_me(ctx: WriteCtxDep):
    uid = ctx.user.id
    ctx.user.deleted_at = func.now()
    req = DeletionRequest(user_id=uid, user_hash=pseudonym(uid))
    ctx.db.add_all([req, AuditLog(actor_id=uid, action="account.delete_requested")])
    ctx.db.flush()
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
