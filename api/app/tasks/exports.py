"""render task (TRD §7.5): resume version -> PDF or DOCX in storage -> resume_exports row.

Code only: no model call, no spend cap, no plan usage (I-12). Name and contact come from the user
record here, at render time (I-10). Only statements that passed the code checks are rendered (I-2).
"""

import uuid
from datetime import date

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core import storage
from app.core.display import span, years
from app.db.models import (
    Achievement,
    CareerGap,
    Education,
    Experience,
    Language,
    Profile,
    Project,
    ResumeExport,
    ResumeVersion,
    User,
    UserSkill,
)
from app.render import render
from app.tasks.queue import Claimed, TaskError


def _entry(title: str | None, org: str | None, dates: str) -> dict:
    return {"title": title or "", "org": org or "", "dates": dates, "bullets": []}


def _education(ed: Education) -> dict:
    return _entry(", ".join(x for x in (ed.degree, ed.field_of_study) if x), ed.institution,
                  years(ed.start_month, ed.end_month))


def career_breaks(db: Session) -> list[CareerGap]:
    return list(db.scalars(select(CareerGap).where(CareerGap.show_on_resume, CareerGap.status == "confirmed")
                        .order_by(CareerGap.start_month.desc())))


def resume_doc(db: Session, user: User, rv: ResumeVersion) -> dict:
    stmts = [s for s in rv.statements if s["status"] != "blocked"]
    summary = [s["text"] for s in stmts if s["type"] == "summary" or not s.get("owner_id")]
    groups: dict[str, list] = {"experience": [], "projects": [], "education": []}
    entries: dict[str, dict] = {}
    starts: dict[int, date | None] = {}  # id(entry) -> start month, to place career breaks in the timeline
    for s in stmts:
        oid = s.get("owner_id")
        if not oid or s["type"] == "summary":
            continue
        if oid not in entries:
            owner = uuid.UUID(oid)
            if e := db.get(Experience, owner):
                group, entries[oid] = "experience", _entry(e.title, ", ".join(x for x in (e.employer, e.location) if x),
                                                           span(e.start_month, e.end_month))
                starts[id(entries[oid])] = e.start_month
            elif p := db.get(Project, owner):
                group, entries[oid] = "projects", _entry(p.name or "Project", None, span(p.start_month, p.end_month))
            elif ed := db.get(Education, owner):
                group, entries[oid] = "education", _education(ed)
            else:
                continue
            groups[group].append(entries[oid])
        entries[oid]["bullets"].append(s["text"])
    # Only education the user confirmed goes on a resume, like every other entry.
    for ed in db.scalars(select(Education).where(Education.status == "confirmed")
                         .order_by(Education.start_month.desc().nulls_last())):
        if str(ed.id) not in entries:
            groups["education"].append(_education(ed))
    # Breaks the user chose to show (CEO D25): a dated entry in the timeline, with their own words if any.
    for g in career_breaks(db):
        groups["experience"].append(b := _entry("Career break", g.reason_text, span(g.start_month, g.end_month)))
        starts[id(b)] = g.start_month
    groups["experience"].sort(key=lambda x: starts.get(id(x)) or date.min, reverse=True)
    lines = {"achievement": [], "publication": []}
    for a in db.scalars(select(Achievement).where(Achievement.status == "confirmed").order_by(Achievement.created_at)):
        lines[a.kind].append(a.description)
    langs = ", ".join(f"{x.name} ({x.proficiency})" if x.proficiency else x.name for x in db.scalars(
        select(Language).where(Language.status == "confirmed").order_by(Language.created_at)))
    skills = ", ".join(s.raw_label for s in db.scalars(select(UserSkill).order_by(UserSkill.created_at)))
    headline = db.scalar(select(Profile.headline).where(Profile.user_id == user.id))
    return {
        "name": user.name or "", "headline": headline or "",
        "contact": [x for x in (user.location, user.email, user.phone) if x],
        "sections": {
            "summary": {"lines": summary},
            "skillsSummary": {"lines": ([f"Skills: {skills}"] if skills else []) + summary},
            "experience": {"entries": groups["experience"]},
            "projects": {"entries": groups["projects"]},
            "education": {"entries": groups["education"]},
            "skills": {"lines": [skills] if skills else []},
            "achievements": {"lines": lines["achievement"]},
            "publications": {"lines": lines["publication"]},
            "languages": {"lines": [langs] if langs else []},
        },
    }


def render_export(db: Session, task: Claimed) -> dict:
    p = task.payload
    export_id, fmt = uuid.UUID(p["export_id"]), p["format"]
    if db.get(ResumeExport, export_id):  # I-15: a repeated delivery renders nothing twice
        return {"export_id": str(export_id)}
    rv = db.get(ResumeVersion, uuid.UUID(p["resume_version_id"]))
    if rv is None:
        raise TaskError("NOT_FOUND", "This resume no longer exists.", retry=False)
    user = db.get(User, task.user_id)
    key = f"{user.id}/exports/{export_id}/resume.{fmt}"
    storage.put(key, render(resume_doc(db, user, rv), p["template_id"], fmt))
    db.add(ResumeExport(id=export_id, user_id=user.id, resume_version_id=rv.id, format=fmt, object_key=key,
                        basis=p["basis"]))
    return {"export_id": str(export_id)}
