"""Resumes and templates (TRD §7, §11.3). Shapes follow src/lib/mock.ts (`Resume`, `ResumeListItem`).

Generation runs in the tailor task. Statement edits change the working draft (CEO D16) and are
re-checked in code synchronously; the verifier model is not called on edits (status
code_checked_only). Export snapshots the draft into a resume version and renders it in the
`render` task (app/tasks/exports.py); exports never use plan limits or the model (I-12).
"""

import re
import uuid
from datetime import date
from typing import Literal

from fastapi import APIRouter, Response
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app import render
from app.core import storage
from app.core.auth import CtxDep
from app.core.display import day, span
from app.core.errors import ApiError
from app.core.idempotency import WriteCtxDep
from app.db.models import (
    Experience,
    FactVersion,
    Job,
    JobVersion,
    Project,
    Resume,
    ResumeDraft,
    ResumeExport,
    ResumeVersion,
    User,
)
from app.tasks.exports import career_breaks, resume_doc
from app.tasks.match import basis, current_facts
from app.tasks.queue import enqueue, operation
from app.tasks.tailor import check_fact, code_check, skill_terms

router = APIRouter(tags=["resumes"])

TEMPLATES = [{"id": t.id, "name": t.name, "bestFor": t.best_for} for t in render.TEMPLATES.values()]
TEMPLATE_IDS = set(render.TEMPLATES)
TEMPLATE_NAMES = {t.id: t.name for t in render.TEMPLATES.values()}


@router.get("/templates")
def list_templates():
    return {"items": TEMPLATES}


def freeze_basis(db: Session, user_id: uuid.UUID, **extra) -> dict:
    """TRD §11.1 tailoring sequence: the basis is frozen at request time, before the task runs."""
    facts = current_facts(db)
    if not facts:
        raise ApiError(422, "UNCONFIRMED_ENTRY", "Confirm at least one fact in your profile first.")
    return basis(db, user_id, [str(f.version.id) for f in facts], **extra)


# ---------------------------------------------------------------- views


def _resume(db: Session, resume_id: uuid.UUID) -> tuple[Resume, ResumeDraft]:
    r = db.get(Resume, resume_id)  # RLS -> 404 for other users
    if r is None:
        raise ApiError(404, "NOT_FOUND", "Not found.")
    return r, db.scalars(select(ResumeDraft).where(ResumeDraft.resume_id == r.id)).one()


def _names(db: Session, r: Resume) -> tuple[str, str]:
    """(list name, target line)."""
    if r.target_job_version_id:
        job = db.scalars(select(Job).join(JobVersion, JobVersion.job_id == Job.id)
                         .where(JobVersion.id == r.target_job_version_id)).first()
        title, company = (job.title, job.company) if job else (None, None)
        name = " · ".join(x for x in (company, title) if x) or "Tailored resume"
        return name, f"Tailored for {' · '.join(x for x in (title, company) if x) or 'a pasted job'}"
    return r.target_occupation_id or "Master resume", r.target_occupation_id or ""


def freshness(db: Session, draft: ResumeDraft) -> tuple[str, str | None]:
    """TRD §16.2: outdated when a cited fact version is no longer confirmed and current."""
    cited = {i for s in draft.statements for i in s["cited_fact_version_ids"]}
    if not cited:
        return "current", None
    current = {str(f.version.id) for f in current_facts(db)}
    changed = len(cited - current)
    if not changed:
        return "current", None
    return "outdated", f"{changed} fact{'s' if changed > 1 else ''} changed since this version"


def list_item(db: Session, r: Resume, draft: ResumeDraft) -> dict:
    name, target = _names(db, r)
    state, reason = freshness(db, draft)
    item = {"id": str(r.id), "kind": r.kind, "name": name, "target": target,
            "template": TEMPLATE_NAMES.get(r.template_id, r.template_id), "updated": day(draft.updated_at),
            "freshness": state}
    if reason:
        item["outdatedReason"] = reason
    if r.parent_resume_id:
        item["parent"] = str(r.parent_resume_id)
    return item


def resume_view(db: Session, r: Resume, draft: ResumeDraft) -> dict:
    """`Resume`: name is empty because names are not stored yet; it is inserted at render time (I-10)."""
    cited = {i for s in draft.statements for i in s["cited_fact_version_ids"]}
    fact_of = {str(k): str(v) for k, v in db.execute(
        select(FactVersion.id, FactVersion.fact_id).where(FactVersion.id.in_([uuid.UUID(i) for i in cited]))
    ).all()} if cited else {}
    sections: dict[str, dict] = {}
    starts: dict[str, date | None] = {}
    withheld = []
    for s in draft.statements:
        if s["status"] == "blocked":
            withheld.append({"id": s["id"], "text": s["text"], "reasons": s["reasons"]})
            continue
        key = "summary" if s["type"] == "summary" or not s.get("owner_id") else s["owner_id"]
        if key not in sections:
            sections[key], starts[key] = _section(db, key)
        sections[key]["lines"].append({"id": s["id"], "text": s["text"], "status": s["status"],
                                       "factId": fact_of.get(next(iter(s["cited_fact_version_ids"]), ""), "")})
    for g in career_breaks(db):  # placed in the timeline, as the export does (app/tasks/exports.py)
        sections[str(g.id)] = {"title": "Career break", "org": g.reason_text or "",
                               "dates": span(g.start_month, g.end_month), "lines": []}
        starts[str(g.id)] = g.start_month
    summary = [sections.pop("summary")] if "summary" in sections else []
    ordered = summary + [sections[k] for k in sorted(sections, key=lambda k: starts.get(k) or date.min, reverse=True)]
    _, target = _names(db, r)
    state, reason = freshness(db, draft)
    return {"id": str(r.id), "name": "", "target": target, "template": TEMPLATE_NAMES.get(r.template_id, r.template_id),
            "templateId": r.template_id, "kind": r.kind, "version": draft.version, "freshness": state,
            "outdatedReason": reason, "sections": ordered, "withheld": withheld,
            "extras": preview_extras(db, r, draft)}


def preview_extras(db: Session, r: Resume, draft: ResumeDraft) -> dict:
    """Everything but the lines, for the HTML preview (mock `resumeExtras`), from the data the export renders."""
    doc = resume_doc(db, db.get(User, r.user_id), draft)
    secs = doc["sections"]
    skills = secs["skills"]["lines"]
    return {
        "contact": " · ".join(doc["contact"]), "summary": "",  # the summary is the Summary section's lines
        "skillsSummary": [{"area": "Skills", "proof": x} for x in skills],
        "projects": [{"name": e["title"], "stack": "", "line": " ".join(e["bullets"])}
                     for e in secs["projects"]["entries"]],
        "education": [{"degree": e["title"], "org": e["org"], "dates": e["dates"], "detail": ""}
                      for e in secs["education"]["entries"]],
        "skills": [{"group": "", "items": x} for x in skills],  # one plain line, as exported
        "achievements": secs["achievements"]["lines"], "publications": secs["publications"]["lines"],
        "languages": secs["languages"]["lines"],
    }


def _section(db: Session, key: str) -> tuple[dict, date | None]:
    """(section, start month for timeline order)."""
    if key == "summary":
        return {"title": "Summary", "lines": []}, None
    owner_id = uuid.UUID(key)
    if e := db.get(Experience, owner_id):
        return {"title": e.title or "", "org": ", ".join(x for x in (e.employer, e.location) if x),
                "dates": span(e.start_month, e.end_month), "lines": []}, e.start_month
    if p := db.get(Project, owner_id):
        return {"title": p.name or "Project", "dates": span(p.start_month, p.end_month), "lines": []}, p.start_month
    return {"title": "", "lines": []}, None


@router.get("/resumes")
def list_resumes(ctx: CtxDep):
    rows = ctx.db.execute(select(Resume, ResumeDraft).join(ResumeDraft, ResumeDraft.resume_id == Resume.id)
                          .order_by(ResumeDraft.updated_at.desc(), Resume.id)).all()
    return {"items": [list_item(ctx.db, r, d) for r, d in rows], "next_cursor": None}


@router.get("/resumes/{resume_id}")
def get_resume(resume_id: uuid.UUID, ctx: CtxDep):
    return resume_view(ctx.db, *_resume(ctx.db, resume_id))


# ---------------------------------------------------------------- writes


class ResumeIn(BaseModel):
    template: str = "classic"
    target: str = Field(min_length=1, max_length=200)  # target role, free text until the taxonomy exists


@router.post("/resumes", status_code=202)
def create_resume(body: ResumeIn, ctx: WriteCtxDep):
    """A master resume: unlimited on every plan (PRD §7), generated by the tailor task."""
    if body.template not in TEMPLATE_IDS:
        raise ApiError(422, "VALIDATION_ERROR", "Unknown template.", {"templates": sorted(TEMPLATE_IDS)})
    uid, resume_id = ctx.user.id, uuid.uuid4()
    task = enqueue(ctx.db, user_id=uid, type="tailor", key=f"tailor:{uid}:{ctx.key}", payload={
        "resume_id": str(resume_id), "kind": "master", "template_id": body.template, "target": body.target,
        "basis": freeze_basis(ctx.db, uid),
    })
    return ctx.respond(202, {"resume_id": resume_id, "operation": operation(task)})


@router.post("/resumes/{resume_id}/regenerate", status_code=202)
def regenerate_resume(resume_id: uuid.UUID, ctx: WriteCtxDep):
    """"Update with new facts" (TRD §16.3: never automatic; the user chooses). The master resume is written again
    from the current confirmed facts and saved as its next version, same id and template. Free, like every master."""
    r, _ = _resume(ctx.db, resume_id)
    if r.kind != "master":
        raise ApiError(422, "VALIDATION_ERROR", "A tailored resume is made again from its job page.")
    uid = ctx.user.id
    task = enqueue(ctx.db, user_id=uid, type="regenerate", key=f"regenerate:{uid}:{ctx.key}", payload={
        "resume_id": str(r.id), "scratch_id": str(uuid.uuid4()), "kind": "master", "template_id": r.template_id,
        "target": r.target_occupation_id, "basis": freeze_basis(ctx.db, uid),
    })
    return ctx.respond(202, {"resume_id": r.id, "operation": operation(task)})


class ResumePatch(BaseModel):
    template_id: str = Field(alias="templateId")  # the frontend's name (src/lib/mock.ts `Resume.templateId`)


@router.patch("/resumes/{resume_id}")
def patch_resume(resume_id: uuid.UUID, body: ResumePatch, ctx: WriteCtxDep):
    """The template picked in the editor; exports and the resume list use it from then on."""
    if body.template_id not in TEMPLATE_IDS:
        raise ApiError(422, "VALIDATION_ERROR", "Unknown template.", {"templates": sorted(TEMPLATE_IDS)})
    r, draft = _resume(ctx.db, resume_id)
    r.template_id = body.template_id
    ctx.db.flush()
    return ctx.respond(200, resume_view(ctx.db, r, draft))


class StatementPatch(BaseModel):
    text: str = Field(min_length=1, max_length=500)
    version: int  # the draft's version


@router.patch("/resumes/{resume_id}/statements/{sid}")
def patch_statement(resume_id: uuid.UUID, sid: str, body: StatementPatch, ctx: WriteCtxDep):
    """User edits are re-validated the same way (TRD §7.4), in code; a failing edit is kept but withheld."""
    r, draft = _resume(ctx.db, resume_id)
    ctx.db.refresh(draft, with_for_update=True)
    if draft.version != body.version:
        raise ApiError(409, "VERSION_CONFLICT", "This resume changed since you loaded it.", {"version": draft.version})
    stmts = [dict(s) for s in draft.statements]
    stmt = next((s for s in stmts if s["id"] == sid), None)
    if stmt is None:
        raise ApiError(404, "NOT_FOUND", "Not found.")
    facts = {str(f.version.id): check_fact(f) for f in current_facts(ctx.db)}
    reasons = code_check(body.text, stmt["type"], stmt["cited_fact_version_ids"], facts, skill_terms(ctx.db))
    stmt.update(text=body.text, reasons=reasons, status="blocked" if reasons else "code_checked_only", edited=True)
    draft.statements, draft.version, draft.updated_at = stmts, draft.version + 1, func.now()
    ctx.db.flush()
    ctx.db.refresh(draft)
    return ctx.respond(200, {"statement": stmt, "resume": resume_view(ctx.db, r, draft)})


# ---------------------------------------------------------------- export (TRD §7.5)


class ExportIn(BaseModel):
    format: Literal["pdf", "docx"]
    template: Literal["classic", "tech", "modern", "campus", "combination", "academic"]


def snapshot(db: Session, draft: ResumeDraft) -> ResumeVersion:
    """The resume version that matches the working draft; a new immutable one if the draft was edited."""
    latest = db.scalars(select(ResumeVersion).where(ResumeVersion.resume_id == draft.resume_id)
                        .order_by(ResumeVersion.version.desc()).limit(1)).one()
    if latest.statements == draft.statements:
        return latest
    summary = {k: sum(s["status"] == k for s in draft.statements) for k in ("passed", "code_checked_only", "blocked")}
    rv = ResumeVersion(
        resume_id=draft.resume_id, user_id=draft.user_id, version=latest.version + 1,
        profile_version=draft.profile_version, selected_fact_version_ids=latest.selected_fact_version_ids,
        statements=draft.statements, layout_options=draft.layout_options,
        check_summary={**latest.check_summary, **summary},
        basis={**latest.basis, "draft_version": draft.version},
    )
    db.add(rv)
    db.flush()
    return rv


@router.post("/resumes/{resume_id}/export", status_code=202)
def export_resume(resume_id: uuid.UUID, body: ExportIn, ctx: WriteCtxDep):
    _, draft = _resume(ctx.db, resume_id)
    ctx.db.refresh(draft, with_for_update=True)  # one snapshot per draft version under concurrent exports
    rv = snapshot(ctx.db, draft)
    frozen = {**rv.basis, "resume_version_id": str(rv.id), "template_id": body.template, "format": body.format,
              "renderer": render.RENDERER_VERSION}
    task = enqueue(ctx.db, user_id=ctx.user.id, type="render", key=f"render:{ctx.user.id}:{ctx.key}", payload={
        "export_id": str(uuid.uuid4()), "resume_version_id": str(rv.id), "format": body.format,
        "template_id": body.template, "basis": frozen,
    })
    return ctx.respond(202, {"operation": operation(task)})


@router.get("/exports/{export_id}/download")
def download_export(export_id: uuid.UUID, ctx: CtxDep):
    """Never blocked by plan limits or the spend cap (I-12)."""
    ex = ctx.db.get(ResumeExport, export_id)  # RLS -> 404 for other users
    if ex is None:
        raise ApiError(404, "NOT_FOUND", "Not found.")
    stem = "-".join(filter(None, [re.sub(r"[^A-Za-z0-9]+", "-", ctx.user.name or "").strip("-"), "Resume"]))
    return Response(storage.get(ex.object_key), media_type=render.CONTENT_TYPES[ex.format],
                    headers={"Content-Disposition": f'attachment; filename="{stem}.{ex.format}"'})
