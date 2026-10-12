"""Profile, experiences and facts (TRD §5.2). Confirmed changes bump profile_version in the same transaction."""

import base64
import hashlib
import json
import re
import uuid
from datetime import date, datetime
from typing import Annotated, Literal

from fastapi import APIRouter, Query
from pydantic import BaseModel, Field, StringConstraints, field_validator, model_validator
from sqlalchemy import Select, and_, delete, func, select, tuple_, update
from sqlalchemy.orm import Session

from app.core import display
from app.core.auth import CtxDep
from app.core.errors import ApiError
from app.core.idempotency import WriteCtxDep
from app.db.models import (
    RESPONSIBILITY_LEVELS,
    CareerGap,
    CareerGoal,
    Education,
    Experience,
    Fact,
    FactVersion,
    PreferenceVersion,
    Profile,
    Project,
    UserSkill,
)

router = APIRouter(tags=["profile"])


# ---------------------------------------------------------------- helpers


def bump_profile_version(db: Session, user_id: uuid.UUID) -> int:
    return db.scalar(
        update(Profile)
        .where(Profile.user_id == user_id)
        .values(profile_version=Profile.profile_version + 1, updated_at=func.now())
        .returning(Profile.profile_version)
    )


def profile_version(db: Session, user_id: uuid.UUID) -> int:
    return db.scalar(select(Profile.profile_version).where(Profile.user_id == user_id))


def locked(db: Session, model, entity_id: uuid.UUID, version: int):
    """Row for update, or NOT_FOUND / VERSION_CONFLICT. RLS hides other users' rows (-> 404)."""
    row = db.scalars(select(model).where(model.id == entity_id).with_for_update()).first()
    if row is None:
        raise ApiError(404, "NOT_FOUND", "Not found.")
    if row.version != version:
        raise ApiError(409, "VERSION_CONFLICT", "This entry changed since you loaded it.", {"version": row.version})
    return row


def page(db: Session, stmt: Select, model, cursor: str | None, limit: int) -> tuple[list, str | None]:
    if cursor:
        try:
            created, last_id = base64.urlsafe_b64decode(cursor).decode().split("|")
            key = (datetime.fromisoformat(created), uuid.UUID(last_id))
        except ValueError:
            raise ApiError(400, "VALIDATION_ERROR", "Invalid cursor.") from None
        stmt = stmt.where(tuple_(model.created_at, model.id) > key)
    rows = db.execute(stmt.order_by(model.created_at, model.id).limit(limit + 1)).all()
    if len(rows) <= limit:
        return rows, None
    last = rows[limit - 1][0]
    return rows[:limit], base64.urlsafe_b64encode(f"{last.created_at.isoformat()}|{last.id}".encode()).decode()


def month(v: date | None) -> date | None:
    return v.replace(day=1) if v else None


class Dated(BaseModel):
    start_month: date | None = None
    end_month: date | None = None

    _months = field_validator("start_month", "end_month")(lambda cls, v: month(v))

    @model_validator(mode="after")
    def ordered(self):
        if self.start_month and self.end_month and self.end_month < self.start_month:
            raise ValueError("end_month is before start_month")
        return self


class VersionIn(BaseModel):
    version: int


# ---------------------------------------------------------------- profile


@router.get("/profile")
def get_profile(ctx: CtxDep):
    """Shaped like src/lib/mock.ts `profile`, plus `facts`, `draftGroups` (with ids and versions) and `profileVersion`.

    `name`, `headline` and `location` come from PATCH /v1/me (names never go to models, I-10).
    """
    db, uid = ctx.db, ctx.user.id
    prof = db.scalars(select(Profile).where(Profile.user_id == uid)).one()
    exps = db.scalars(select(Experience).where(Experience.status != "rejected")
                      .order_by(Experience.start_month.desc().nulls_last(), Experience.created_at)).all()
    projs = db.scalars(select(Project).where(Project.status != "rejected")
                       .order_by(Project.start_month.desc().nulls_last(), Project.created_at)).all()
    rows = db.execute(_facts_query().where(Fact.status != "rejected").order_by(Fact.created_at)).all()
    by_exp, by_proj = {e.id: e for e in exps}, {p.id: p for p in projs}
    confirmed = [(f, v) for f, v in rows if f.status == "confirmed"]
    prefs = prefs_out(_latest(db, PreferenceVersion))

    def role_of(f: Fact) -> str:
        if e := by_exp.get(f.experience_id):
            return display.role(e.title, e.employer, e.location)
        return (by_proj[f.project_id].name or "Project") if f.project_id in by_proj else ""

    def drafts_of(col: str, owner_id) -> list[dict]:
        return [{"id": str(f.id), "text": v.description, "numbers": _NUM_RE.findall(v.description),
                 "suggested": RESPONSIBILITY_LEVELS.get(v.responsibility_level), "version": f.version}
                for f, v in rows if f.status == "draft" and getattr(f, col) == owner_id]

    tools = [t.get("raw", "").lower() for _, v in confirmed for t in v.tools]
    edus = db.scalars(select(Education).where(Education.status != "rejected")
                      .order_by(Education.start_month.desc().nulls_last(), Education.created_at)).all()
    return {
        "name": ctx.user.name or "",
        "email": ctx.user.email or "",
        "phone": ctx.user.phone or "",
        "headline": prof.headline or "",
        "location": ctx.user.location or (prefs["locations"] or [next((e.location for e in exps if e.location), "")])[0],
        "confirmed": len(confirmed),
        "drafts": sum(f.status == "draft" for f, _ in rows) + sum(e.status == "draft" for e in edus),
        "roles": [{"id": str(e.id), "title": e.title or "", "org": ", ".join(x for x in (e.employer, e.location) if x),
                   "dates": display.span(e.start_month, e.end_month), "status": e.status, "version": e.version,
                   "factIds": [str(f.id) for f, _ in confirmed if f.experience_id == e.id]} for e in exps],
        "skills": [{"name": s.raw_label, "evidence": tools.count(s.raw_label.lower())}
                   for s in db.scalars(select(UserSkill).order_by(UserSkill.created_at))],
        "education": [{"id": str(e.id), "degree": ", ".join(x for x in (e.degree, e.field_of_study) if x),
                       "org": e.institution or "", "dates": display.years(e.start_month, e.end_month),
                       "status": e.status, "version": e.version} for e in edus],
        "gaps": [{"dates": display.span(g.start_month, g.end_month), "reason": g.reason_text or g.reason or ""}
                 for g in db.scalars(select(CareerGap).where(CareerGap.show_on_resume).order_by(CareerGap.start_month))],
        "goals": goals_out(_latest(db, CareerGoal)),
        "prefs": prefs,
        "facts": [{"id": str(f.id), "role": role_of(f), "text": v.description,
                   "responsibility": RESPONSIBILITY_LEVELS.get(v.responsibility_level),
                   "confirmedOn": display.day(f.updated_at), "version": f.version, "factVersionId": str(v.id)}
                  for f, v in confirmed],
        # Roles first, then projects; `kind` says which id/version keys are present.
        "draftGroups": [
            {"kind": "experience", "role": display.role(e.title, e.employer, e.location),
             "dates": display.span(e.start_month, e.end_month), "experienceId": str(e.id),
             "experienceVersion": e.version, "status": e.status, "drafts": d}
            for e in exps if (d := drafts_of("experience_id", e.id))
        ] + [
            {"kind": "project", "role": p.name or "Project", "dates": display.span(p.start_month, p.end_month),
             "projectId": str(p.id), "projectVersion": p.version, "status": p.status, "drafts": d}
            for p in projs if (d := drafts_of("project_id", p.id))
        ],
        "profileVersion": prof.profile_version,
    }


_NUM_RE = re.compile(r"\d+(?:[.,]\d+)*")


# ---------------------------------------------------------------- preferences and goals (versioned, TRD §9.5)

Short = Annotated[str, StringConstraints(max_length=100)]


class PrefsIn(BaseModel):
    """src/lib/mock.ts `profile.prefs`. Stored as typed columns for matching plus `raw` (the body as sent)."""

    locations: list[Short] = Field(max_length=20)
    modes: list[Short] = Field(max_length=5)
    type: Short
    visa: Short
    notice: Short


class GoalsIn(BaseModel):
    roles: list[Short] = Field(max_length=20)
    industries: list[Short] = Field(max_length=20)
    seniority: Short


EMPTY_PREFS = {"locations": [], "modes": [], "type": "", "visa": "", "notice": ""}
EMPTY_GOALS = {"roles": [], "industries": [], "seniority": ""}
NO_VISA = {"", "not needed", "no", "none"}


def _latest(db: Session, model):
    return db.scalars(select(model).order_by(model.version.desc()).limit(1)).first()


def prefs_out(row: PreferenceVersion | None) -> dict:
    return {**EMPTY_PREFS, **((row.raw or {}) if row else {})}


def goals_out(row: CareerGoal | None) -> dict:
    return {**EMPTY_GOALS, **((row.raw or {}) if row else {})}


def _next_version(db: Session, uid: uuid.UUID, model) -> int:
    # Serialize concurrent PUTs on the profile row so (user_id, version) never collides.
    db.scalars(select(Profile).where(Profile.user_id == uid).with_for_update()).one()
    return (db.scalar(select(func.max(model.version))) or 0) + 1


def _clean(items: list[str]) -> list[str]:
    return list(dict.fromkeys(x.strip() for x in items if x.strip()))


@router.get("/preferences")
def get_preferences(ctx: CtxDep):
    return prefs_out(_latest(ctx.db, PreferenceVersion))


@router.put("/preferences")
def put_preferences(body: PrefsIn, ctx: WriteCtxDep):
    """A new version; match pages recompute eligibility against it on the next view (code only)."""
    from app.tasks.match import _days  # app.tasks.match imports this module

    raw = {"locations": _clean(body.locations), "modes": _clean(body.modes), "type": body.type.strip(),
           "visa": body.visa.strip(), "notice": body.notice.strip()}
    ctx.db.add(PreferenceVersion(
        user_id=ctx.user.id, version=_next_version(ctx.db, ctx.user.id, PreferenceVersion), raw=raw,
        locations=raw["locations"], work_modes=raw["modes"], employment_types=[raw["type"]] if raw["type"] else [],
        visa_needs=[] if raw["visa"].lower() in NO_VISA else [raw["visa"]],
        notice_period_days=_days(raw["notice"].lower()) if raw["notice"] else None,
    ))
    ctx.db.flush()
    return ctx.respond(200, prefs_out(_latest(ctx.db, PreferenceVersion)))


@router.get("/goals")
def get_goals(ctx: CtxDep):
    return goals_out(_latest(ctx.db, CareerGoal))


@router.put("/goals")
def put_goals(body: GoalsIn, ctx: WriteCtxDep):
    raw = {"roles": _clean(body.roles), "industries": _clean(body.industries), "seniority": body.seniority.strip()}
    ctx.db.add(CareerGoal(user_id=ctx.user.id, version=_next_version(ctx.db, ctx.user.id, CareerGoal), raw=raw,
                          target_occupations=raw["roles"], industries=raw["industries"]))
    ctx.db.flush()
    return ctx.respond(200, goals_out(_latest(ctx.db, CareerGoal)))


# ---------------------------------------------------------------- experiences


class ExperienceIn(Dated):
    employer: str | None = Field(None, max_length=200)
    title: str | None = Field(None, max_length=200)
    location: str | None = Field(None, max_length=200)
    employment_type: str | None = Field(None, max_length=50)


class ExperiencePatch(ExperienceIn):
    version: int


def _experience_out(db: Session, e: Experience, pv: int | None = None) -> dict:
    return {**e.as_dict(), "profile_version": pv if pv is not None else profile_version(db, e.user_id)}


@router.get("/experiences")
def list_experiences(ctx: CtxDep, cursor: str | None = None, limit: int = Query(50, ge=1, le=200)):
    rows, nxt = page(ctx.db, select(Experience), Experience, cursor, limit)
    return {"items": [r[0].as_dict() for r in rows], "next_cursor": nxt}


@router.post("/experiences", status_code=201)
def create_experience(body: ExperienceIn, ctx: WriteCtxDep):
    e = Experience(user_id=ctx.user.id, **body.model_dump())
    ctx.db.add(e)
    ctx.db.flush()
    ctx.db.refresh(e)
    return ctx.respond(201, _experience_out(ctx.db, e))


@router.get("/experiences/{experience_id}")
def get_experience(experience_id: uuid.UUID, ctx: CtxDep):
    e = ctx.db.get(Experience, experience_id)
    if e is None:
        raise ApiError(404, "NOT_FOUND", "Not found.")
    return e.as_dict()


@router.patch("/experiences/{experience_id}")
def patch_experience(experience_id: uuid.UUID, body: ExperiencePatch, ctx: WriteCtxDep):
    e = locked(ctx.db, Experience, experience_id, body.version)
    for k, v in body.model_dump(exclude_unset=True, exclude={"version"}).items():
        setattr(e, k, v)
    e.version += 1
    e.updated_at = func.now()
    pv = bump_profile_version(ctx.db, ctx.user.id) if e.status == "confirmed" else None
    ctx.db.flush()
    ctx.db.refresh(e)
    return ctx.respond(200, _experience_out(ctx.db, e, pv))


@router.delete("/experiences/{experience_id}")
def delete_experience(experience_id: uuid.UUID, body: VersionIn, ctx: WriteCtxDep):
    e = locked(ctx.db, Experience, experience_id, body.version)
    was_confirmed = e.status == "confirmed" or ctx.db.scalar(
        select(func.count()).where(Fact.experience_id == e.id, Fact.status == "confirmed")
    )
    ctx.db.delete(e)  # facts cascade
    pv = bump_profile_version(ctx.db, ctx.user.id) if was_confirmed else profile_version(ctx.db, ctx.user.id)
    return ctx.respond(200, {"deleted": True, "profile_version": pv})


def _set_status(model, entity_id: uuid.UUID, body: VersionIn, ctx, status: str):
    """Confirm or reject an experience or education row; crossing "confirmed" bumps profile_version."""
    e = locked(ctx.db, model, entity_id, body.version)
    pv = None
    if e.status != status:
        if "confirmed" in (e.status, status):
            pv = bump_profile_version(ctx.db, ctx.user.id)
        e.status, e.version, e.updated_at = status, e.version + 1, func.now()
        ctx.db.flush()
        ctx.db.refresh(e)
    return ctx.respond(200, _experience_out(ctx.db, e, pv))


@router.post("/experiences/{experience_id}/confirm")
def confirm_experience(experience_id: uuid.UUID, body: VersionIn, ctx: WriteCtxDep):
    return _set_status(Experience, experience_id, body, ctx, "confirmed")


@router.post("/experiences/{experience_id}/reject")
def reject_experience(experience_id: uuid.UUID, body: VersionIn, ctx: WriteCtxDep):
    return _set_status(Experience, experience_id, body, ctx, "rejected")


@router.post("/education/{education_id}/confirm")
def confirm_education(education_id: uuid.UUID, body: VersionIn, ctx: WriteCtxDep):
    """A confirmed degree is evidence for degree requirements in job checks and goes on resumes."""
    return _set_status(Education, education_id, body, ctx, "confirmed")


@router.post("/education/{education_id}/reject")
def reject_education(education_id: uuid.UUID, body: VersionIn, ctx: WriteCtxDep):
    return _set_status(Education, education_id, body, ctx, "rejected")


# ---------------------------------------------------------------- facts


OWNER_COLUMNS = {"experience": ("experience_id", Experience), "project": ("project_id", Project),
                 "education": ("education_id", Education)}


class ToolRef(BaseModel):
    skill_id: str | None = None
    raw: str = Field(max_length=100)


class FactContent(BaseModel):
    description: str | None = Field(None, min_length=1, max_length=2000)
    tools: list[ToolRef] | None = None
    responsibility_level: int | None = Field(None, ge=1, le=4)  # 1 Contributed, 2 Owned, 3 Led, 4 Managed
    outcome_value: float | None = None
    outcome_unit: str | None = Field(None, max_length=50)
    outcome_method: str | None = Field(None, max_length=200)
    completion: Literal["planned", "in_progress", "completed"] | None = None
    artifact_refs: list[str] | None = None


class FactIn(FactContent):
    owner_type: Literal["experience", "project", "education"]
    owner_id: uuid.UUID
    description: str = Field(min_length=1, max_length=2000)


class FactPatch(FactContent):
    version: int
    change_kind: Literal["update", "correction"] | None = None  # TRD §16.4


class FactConfirm(VersionIn):
    responsibility_level: int | None = Field(None, ge=1, le=4)


CONTENT_FIELDS = tuple(FactContent.model_fields)


def content_hash(content: dict) -> str:
    return hashlib.sha256(json.dumps({k: content.get(k) for k in CONTENT_FIELDS}, sort_keys=True, default=str).encode()).hexdigest()


def _facts_query() -> Select:
    return select(Fact, FactVersion).join(
        FactVersion, and_(FactVersion.fact_id == Fact.id, FactVersion.version == Fact.current_version)
    )


def _fact_out(f: Fact, v: FactVersion, pv: int | None = None) -> dict:
    content = {k: getattr(v, k) for k in CONTENT_FIELDS}
    out = {**f.as_dict(), **content, "fact_version_id": v.id, "change_kind": v.change_kind, "content_hash": v.content_hash}
    if pv is not None:
        out["profile_version"] = pv
    return out


def _add_version(db: Session, f: Fact, content: dict, change_kind: str | None = None) -> FactVersion:
    content = {k: content.get(k) for k in CONTENT_FIELDS}
    content["tools"] = content["tools"] or []
    content["artifact_refs"] = content["artifact_refs"] or []
    v = FactVersion(fact_id=f.id, user_id=f.user_id, version=f.current_version, change_kind=change_kind,
                    content_hash=content_hash(content), **content)
    db.add(v)
    db.flush()
    return v


def _current(db: Session, fact_id: uuid.UUID) -> tuple[Fact, FactVersion]:
    row = db.execute(_facts_query().where(Fact.id == fact_id)).first()
    if row is None:
        raise ApiError(404, "NOT_FOUND", "Not found.")
    return row[0], row[1]


@router.get("/facts")
def list_facts(
    ctx: CtxDep,
    experience_id: uuid.UUID | None = None,
    status: Literal["draft", "confirmed", "rejected"] | None = None,
    cursor: str | None = None,
    limit: int = Query(50, ge=1, le=200),
):
    stmt = _facts_query()
    if experience_id:
        stmt = stmt.where(Fact.experience_id == experience_id)
    if status:
        stmt = stmt.where(Fact.status == status)
    rows, nxt = page(ctx.db, stmt, Fact, cursor, limit)
    return {"items": [_fact_out(f, v) for f, v in rows], "next_cursor": nxt}


@router.post("/facts", status_code=201)
def create_fact(body: FactIn, ctx: WriteCtxDep):
    column, owner_model = OWNER_COLUMNS[body.owner_type]
    if ctx.db.get(owner_model, body.owner_id) is None:
        raise ApiError(404, "NOT_FOUND", f"{body.owner_type} not found.")
    f = Fact(user_id=ctx.user.id, **{column: body.owner_id})
    ctx.db.add(f)
    ctx.db.flush()
    ctx.db.refresh(f)
    v = _add_version(ctx.db, f, body.model_dump(mode="json"))
    return ctx.respond(201, _fact_out(f, v, profile_version(ctx.db, ctx.user.id)))


@router.get("/facts/{fact_id}")
def get_fact(fact_id: uuid.UUID, ctx: CtxDep):
    return _fact_out(*_current(ctx.db, fact_id))


@router.patch("/facts/{fact_id}")
def patch_fact(fact_id: uuid.UUID, body: FactPatch, ctx: WriteCtxDep):
    """Edits never mutate a fact version; they append a new one (TRD §16.1)."""
    f = locked(ctx.db, Fact, fact_id, body.version)
    _, prev = _current(ctx.db, fact_id)
    content = {k: getattr(prev, k) for k in CONTENT_FIELDS}
    changes = body.model_dump(mode="json", exclude_unset=True, exclude={"version", "change_kind"})
    if f.status == "confirmed" and "responsibility_level" in changes and changes["responsibility_level"] is None:
        raise ApiError(422, "RESPONSIBILITY_LEVEL_REQUIRED", "A confirmed fact needs a responsibility level.")
    content.update(changes)
    f.version, f.current_version, f.updated_at = f.version + 1, f.current_version + 1, func.now()
    v = _add_version(ctx.db, f, content, body.change_kind)
    pv = bump_profile_version(ctx.db, ctx.user.id) if f.status == "confirmed" else profile_version(ctx.db, ctx.user.id)
    return ctx.respond(200, _fact_out(f, v, pv))


@router.delete("/facts/{fact_id}")
def delete_fact(fact_id: uuid.UUID, body: VersionIn, ctx: WriteCtxDep):
    f = locked(ctx.db, Fact, fact_id, body.version)
    was_confirmed = f.status == "confirmed"
    ctx.db.execute(delete(Fact).where(Fact.id == f.id))
    pv = bump_profile_version(ctx.db, ctx.user.id) if was_confirmed else profile_version(ctx.db, ctx.user.id)
    return ctx.respond(200, {"deleted": True, "profile_version": pv})


@router.post("/facts/{fact_id}/confirm")
def confirm_fact(fact_id: uuid.UUID, body: FactConfirm, ctx: WriteCtxDep):
    """The user must accept or change the suggested responsibility level (TRD §5.2)."""
    if body.responsibility_level is None:
        raise ApiError(422, "RESPONSIBILITY_LEVEL_REQUIRED", "Choose a responsibility level to confirm this fact.")
    f = locked(ctx.db, Fact, fact_id, body.version)
    _, v = _current(ctx.db, fact_id)
    level_changed = v.responsibility_level != body.responsibility_level
    if f.status == "confirmed" and not level_changed:
        return ctx.respond(200, _fact_out(f, v, profile_version(ctx.db, ctx.user.id)))
    if level_changed:
        f.current_version += 1
        content = {k: getattr(v, k) for k in CONTENT_FIELDS} | {"responsibility_level": body.responsibility_level}
        v = _add_version(ctx.db, f, content, "update")
    f.status, f.version, f.updated_at = "confirmed", f.version + 1, func.now()
    pv = bump_profile_version(ctx.db, ctx.user.id)
    ctx.db.flush()
    ctx.db.refresh(f)
    return ctx.respond(200, _fact_out(f, v, pv))


@router.post("/facts/{fact_id}/reject")
def reject_fact(fact_id: uuid.UUID, body: VersionIn, ctx: WriteCtxDep):
    f = locked(ctx.db, Fact, fact_id, body.version)
    _, v = _current(ctx.db, fact_id)
    pv = None
    if f.status != "rejected":
        if f.status == "confirmed":
            pv = bump_profile_version(ctx.db, ctx.user.id)
        f.status, f.version, f.updated_at = "rejected", f.version + 1, func.now()
        ctx.db.flush()
        ctx.db.refresh(f)
    return ctx.respond(200, _fact_out(f, v, pv if pv is not None else profile_version(ctx.db, ctx.user.id)))
