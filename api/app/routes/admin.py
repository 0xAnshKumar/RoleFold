"""Admin console API (/v1/admin/*): audited support access, dead-letter replay, taxonomy curator queue, ops stats.

Who: app/core/auth.py `is_admin` (ADMIN_SUBJECTS or the ADMIN_ROLE_CLAIM role); everyone else gets 403.
DB: cross-user reads and admin writes run as hunt_admin (ADMIN_DATABASE_URL, BYPASSRLS, table grants from
migration 0008). Reading one user's data never uses that role: a support session reads as hunt_app with
app.user_id set to that user, in a READ ONLY transaction, so RLS still scopes every row.
Audit: every action writes audit_log (actor = the admin's users.id, the reason they typed); so does every
support-session read.
"""

import re
import uuid
from collections.abc import Iterator
from dataclasses import dataclass
from typing import Annotated

from fastapi import APIRouter, Depends, Header
from pydantic import BaseModel, Field, StringConstraints
from sqlalchemy import func, select, text
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from app.core.auth import CtxDep, is_admin, resolve_identity
from app.core.config import get_settings
from app.core.errors import ApiError
from app.db.models import RLS_TABLES, AuditLog, Base, SkillAlias, User
from app.db.session import app_engine, engine_for, set_user
from app.tasks.llm import spent_today
from app.truth.aliases import norm

router = APIRouter(prefix="/admin", tags=["admin"])

Reason = Annotated[str, StringConstraints(strip_whitespace=True, min_length=10, max_length=500)]
SKIP_TABLES = {"idempotency_keys"}  # replayable API responses, duplicates of the rows themselves


@dataclass
class Admin:
    user: User  # the admin's own users row (resolved under RLS by current_ctx)
    db: Session  # hunt_admin transaction

    def audit(self, action: str, target: str | None, reason: str) -> None:
        self.db.add(AuditLog(actor_id=self.user.id, action=f"admin.{action}", target=target, reason=reason))


def admin_ctx(
    ctx: CtxDep,
    authorization: Annotated[str | None, Header()] = None,
    x_dev_user: Annotated[str | None, Header()] = None,
) -> Iterator[Admin]:
    subject, claims = resolve_identity(authorization, x_dev_user)
    if not is_admin(subject, claims):
        raise ApiError(403, "FORBIDDEN", "This page is for Hunt admins.")
    url = get_settings().admin_database_url
    if not url:
        raise ApiError(503, "DEPENDENCY_UNAVAILABLE", "The admin console is off (ADMIN_DATABASE_URL is not set).")
    with Session(engine_for(url)) as db, db.begin():
        yield Admin(ctx.user, db)


AdminDep = Annotated[Admin, Depends(admin_ctx, scope="function")]



# ---------------------------------------------------------------- ops


@router.get("/stats")
def stats(a: AdminDep):
    queues = a.db.execute(text("""
        SELECT type,
          count(*) FILTER (WHERE status = 'queued') AS queued,
          count(*) FILTER (WHERE status = 'running') AS running,
          count(*) FILTER (WHERE status IN ('dead', 'failed')) AS failed,
          extract(epoch FROM now() - min(run_after) FILTER (WHERE status = 'queued' AND run_after <= now()))
            AS oldest_queued_seconds
        FROM tasks GROUP BY type ORDER BY type
    """)).mappings().all()
    return {
        "queues": [{**q, "oldest_queued_seconds": round(q["oldest_queued_seconds"] or 0)} for q in queues],
        "llm_spend_today_usd": round(spent_today(a.db), 4),
        "llm_daily_cap_usd": get_settings().llm_daily_spend_cap_usd,
    }


@router.get("/tasks")
def failed_tasks(a: AdminDep):
    """Dead-lettered (out of attempts) and failed (not retryable) tasks, newest first."""
    rows = a.db.execute(text("""
        SELECT id, type, status, user_id, attempts, max_attempts, error_code, error_message, created_at, updated_at
        FROM tasks WHERE status IN ('dead', 'failed') ORDER BY updated_at DESC LIMIT 200
    """)).mappings().all()
    return {"items": [dict(r) for r in rows]}


class ReplayIn(BaseModel):
    reason: Reason


@router.post("/tasks/{task_id}/replay")
def replay(task_id: uuid.UUID, body: ReplayIn, a: AdminDep):
    """Back to queued with fresh attempts. Handlers are idempotent; a usage reservation released on failure
    stays released, so a replayed run is not charged again (usage.convert is a no-op)."""
    row = a.db.execute(text("""
        UPDATE tasks SET status = 'queued', attempts = 0, run_after = now(), lease_until = NULL,
          error_code = NULL, error_message = NULL, updated_at = now()
        WHERE id = :id AND status IN ('dead', 'failed') RETURNING id, type
    """), {"id": task_id}).first()
    if row is None:
        raise ApiError(404, "NOT_FOUND", "No failed task with that id (it may have been replayed already).")
    a.audit("task.replay", f"task:{task_id}", body.reason)
    return {"id": row.id, "type": row.type, "status": "queued"}


@router.get("/audit")
def audit_log(a: AdminDep):
    rows = a.db.execute(text("""
        SELECT id, actor_id, actor_hash, action, target, reason, created_at
        FROM audit_log ORDER BY created_at DESC LIMIT 200
    """)).mappings().all()
    return {"items": [dict(r) for r in rows]}


# ---------------------------------------------------------------- taxonomy curator queue (TRD §6)


@router.get("/taxonomy/queue")
def taxonomy_queue(a: AdminDep):
    """Unmapped skill terms (user skills, current fact tools, skill requirements) not yet decided, most users first.
    Counts only: no user ids or surrounding text leave this query."""
    items = a.db.execute(text(r"""
        WITH terms AS (
          SELECT raw_label AS term, user_id FROM user_skills WHERE skill_id IS NULL
          UNION ALL
          SELECT t->>'raw', fv.user_id FROM fact_versions fv
            JOIN facts f ON f.id = fv.fact_id AND f.current_version = fv.version AND f.status <> 'rejected'
            CROSS JOIN jsonb_array_elements(fv.tools) t
          WHERE jsonb_typeof(t) = 'object' AND t->>'skill_id' IS NULL
          UNION ALL
          SELECT value, owner_user_id FROM job_requirements WHERE category = 'skill' AND skill_id IS NULL
        ), normed AS (
          SELECT lower(regexp_replace(btrim(term), '\s+', ' ', 'g')) AS term_norm, btrim(term) AS term, user_id
          FROM terms WHERE btrim(coalesce(term, '')) <> ''
        )
        SELECT term_norm, min(term) AS example, count(*) AS uses, count(DISTINCT user_id) AS users
        FROM normed n WHERE NOT EXISTS (SELECT 1 FROM skill_aliases s WHERE s.alias_norm = n.term_norm)
        GROUP BY term_norm ORDER BY users DESC, uses DESC, term_norm LIMIT 200
    """)).mappings().all()
    decided = a.db.scalars(select(SkillAlias).order_by(SkillAlias.updated_at.desc()).limit(50))
    return {"items": [dict(r) for r in items], "decided": [d.as_dict() for d in decided]}


class DecisionIn(BaseModel):
    term: str = Field(min_length=1, max_length=200)
    skill_id: str | None = Field(None, min_length=1, max_length=200)  # None = reject: not a skill
    reason: Reason


@router.post("/taxonomy/decisions")
def decide(body: DecisionIn, a: AdminDep):
    """Approve the term as an alias of skill_id, or reject it. Deciding the same term again overwrites."""
    key, status = norm(body.term), "approved" if body.skill_id else "rejected"
    if not key:
        raise ApiError(422, "VALIDATION_ERROR", "Enter a term.")
    values = {"alias": body.term.strip(), "skill_id": body.skill_id and body.skill_id.strip(), "status": status}
    a.db.execute(insert(SkillAlias).values(alias_norm=key, **values).on_conflict_do_update(
        index_elements=["alias_norm"], set_={**values, "updated_at": text("now()")}))
    a.audit("taxonomy.approve" if body.skill_id else "taxonomy.reject",
            f"alias:{key}->{values['skill_id']}" if body.skill_id else f"alias:{key}", body.reason)
    return {"alias_norm": key, **values}


# ---------------------------------------------------------------- support access (TRD §2: reason, time-boxed, audited)


class SupportIn(BaseModel):
    user: str = Field(min_length=1, max_length=320)  # user id, email, or auth subject
    reason: Reason


def _session(a: Admin, session_id: uuid.UUID) -> tuple[uuid.UUID, object]:
    """A support session is its admin.support.open audit row: (user id, expiry) while it is open."""
    row = a.db.execute(text("""
        SELECT target, created_at + make_interval(mins => :m) AS expires_at FROM audit_log
        WHERE id = :id AND action = 'admin.support.open' AND actor_id = :me
          AND created_at > now() - make_interval(mins => :m)
    """), {"id": session_id, "me": a.user.id, "m": get_settings().admin_support_minutes}).first()
    if row is None:
        raise ApiError(404, "NOT_FOUND", "This support session has ended or isn't yours. Open a new one with a reason.")
    return uuid.UUID(row.target.removeprefix("user:")), row.expires_at


@router.post("/support")
def open_support(body: SupportIn, a: AdminDep):
    who = body.user.strip()
    if re.fullmatch(r"[0-9a-fA-F-]{36}", who):
        cond = User.id == uuid.UUID(who)
    else:
        cond = User.auth_subject == who if "|" in who else func.lower(User.email) == who.lower()
    users = a.db.scalars(select(User).where(cond).limit(2)).all()
    if len(users) != 1:
        raise ApiError(404, "NOT_FOUND", "No single user matches. Use their user id.")
    session_id = uuid.uuid4()
    a.db.add(AuditLog(id=session_id, actor_id=a.user.id, action="admin.support.open", target=f"user:{users[0].id}",
                      reason=body.reason))
    a.db.flush()
    return {"session_id": session_id, "user_id": users[0].id, "expires_at": _session(a, session_id)[1]}


@router.get("/support/{session_id}")
def read_support(session_id: uuid.UUID, a: AdminDep):
    uid, expires_at = _session(a, session_id)
    a.audit("support.view", f"user:{uid}", f"support session {session_id}")
    with Session(app_engine()) as db, db.begin():
        db.execute(text("SET TRANSACTION READ ONLY"))
        set_user(db, uid)
        user = db.get(User, uid)
        user = user and user.as_dict()
        data = {}
        for mapper in Base.registry.mappers:
            model = mapper.class_
            col = RLS_TABLES.get(model.__tablename__)
            if col and model.__tablename__ not in SKIP_TABLES | {"users"}:
                rows = db.scalars(select(model).where(getattr(model, col) == uid))
                data[model.__tablename__] = [r.as_dict() for r in rows]
    return {"session_id": session_id, "expires_at": expires_at, "user": user,
            "data": {k: v for k, v in sorted(data.items()) if v}}
