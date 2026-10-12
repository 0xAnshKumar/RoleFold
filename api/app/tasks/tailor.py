"""tailor task: resume generation, TRD §7 and the §11.1 tailoring sequence.

The API reserved usage and froze the basis (payload). Here: select facts (code) -> resume_write
(no names or contact, I-10; requirement values only, never job text, I-4) -> code checks on every
statement -> statement_verify -> one rewrite of blocked lines -> commit resume, draft and version
and convert the reservation in one transaction. Any failure rolls all of it back; the worker then
releases the reservation, so nothing is visible or counted.
"""

import uuid
from datetime import date

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core import usage
from app.db.models import JobRequirement, Resume, ResumeDraft, ResumeVersion, UserSkill
from app.tasks import llm
from app.tasks.match import FactRow, current_facts, fact_text, tokens, user_names
from app.tasks.queue import Claimed, Deferred, TaskError
from app.truth import checks
from app.truth.redact import redact

SELECTION_VERSION = "selection-1"
MAX_PER_ROLE, MAX_FACTS = 5, 16  # ponytail: fixed budget; derive from the template's measured layout (TRD §7.2)
STYLE = {"first_person": False, "max_bullet_chars": 220, "summary_statements": 1,
         "banned": ["responsible for", "various", "synergy", "team player"]}


def select_facts(rows: list[FactRow], wanted: str) -> list[FactRow]:
    """TRD §7.1 without embeddings: word overlap with the target, outcome present, recency; chronology kept."""
    want = tokens(wanted)

    def score(r: FactRow):
        text = r.version.description + " " + " ".join(t.get("raw", "") for t in r.version.tools)
        return (-(len(tokens(text) & want) + (r.version.outcome_value is not None)),
                -(r.start or date.min).toordinal())

    per_owner: dict = {}
    chosen: list[FactRow] = []
    for r in sorted(rows, key=score):
        owner = r.fact.experience_id or r.fact.project_id or r.fact.education_id
        if per_owner.get(owner, 0) < MAX_PER_ROLE and len(chosen) < MAX_FACTS:
            per_owner[owner] = per_owner.get(owner, 0) + 1
            chosen.append(r)
    return sorted(chosen, key=lambda r: (-(r.start or date.min).toordinal(), r.fact.created_at))


def check_fact(r: FactRow) -> checks.FactVersion:
    e = r.experience
    return checks.FactVersion(
        id=str(r.version.id), label=f"“{r.version.description[:40]}…”" if len(r.version.description) > 40
        else f"“{r.version.description}”",
        text=r.version.description, responsibility_level=r.version.responsibility_level or 1,
        completion=r.version.completion or "completed", employer=e.employer if e else None,
        title=e.title if e else (r.project.name if r.project else None),
        start=(e or r.project).start_month if (e or r.project) else None,
        end=(e or r.project).end_month if (e or r.project) else None,
        tools=tuple(t.get("skill_id") or t.get("raw") for t in r.version.tools),
    )


def model_fact(r: FactRow, names: list[str] = ()) -> dict:
    f = check_fact(r)
    return {"id": f.id, "text": fact_text(r, names), "tools": list(f.tools), "responsibility_level": f.responsibility_level,
            "completion": f.completion, "employer": f.employer, "title": f.title,
            "start": f.start.isoformat()[:7] if f.start else None, "end": f.end.isoformat()[:7] if f.end else None}


def code_check(text: str, type_: str, cited: list[str], facts: dict[str, checks.FactVersion],
               terms: list[str] = ()) -> list[str]:
    results = checks.check_statement(checks.Statement(type_, text, tuple(cited)), facts, terms=terms)
    return [reason for r in results for reason in r.reasons]


def _verify(db: Session, task: Claimed, stmts: list[dict], facts: dict, model_facts: dict[str, dict]) -> bool:
    """Semantic support (TRD §7.4). Returns False when the verifier is unavailable (lines stay code_checked_only)."""
    todo = [s for s in stmts if s["status"] == "code_checked_only"]
    if not todo:
        return True
    cited = {i for s in todo for i in s["cited_fact_version_ids"] if i in model_facts}
    try:
        res = llm.run(db, task, "statement_verify", {
            "statements": [{"index": n, "type": s["type"], "text": s["text"]} for n, s in enumerate(todo)],
            "facts": [model_facts[i] for i in sorted(cited)],
        })
    except Deferred:
        raise
    except TaskError:
        return False
    for v in res.output.results:
        if 0 <= v.statement_index < len(todo):
            s = todo[v.statement_index]
            if v.supported:
                s["status"] = "passed"
            else:
                s["status"] = "blocked"
                s["reasons"] = [f"Not in your facts: {c}" for c in v.unsupported_claims] or [
                    "The checker found a claim your facts don't support."]
    return True


def skill_terms(db: Session) -> list[str]:
    return list(db.scalars(select(UserSkill.raw_label)))


def _validate(db, task, written, facts, model_facts) -> tuple[list[dict], bool]:
    stmts, terms = [], skill_terms(db)
    for w in written:
        reasons = code_check(w.text, w.type, w.cited_fact_version_ids, facts, terms)
        stmts.append({"type": w.type, "text": w.text, "cited_fact_version_ids": list(w.cited_fact_version_ids),
                      "status": "blocked" if reasons else "code_checked_only", "reasons": reasons})
    return stmts, _verify(db, task, stmts, facts, model_facts)


def tailor_resume(db: Session, task: Claimed) -> dict:
    p = task.payload
    b = p["basis"]
    rows = current_facts(db, b["fact_version_ids"])
    if not rows:
        raise TaskError("UNCONFIRMED_ENTRY", "Confirm at least one fact in your profile first. Nothing was counted.",
                        retry=False)
    targets = []
    if p.get("job_version_id"):
        targets = [v for v in db.scalars(select(JobRequirement.value).where(
            JobRequirement.job_version_id == uuid.UUID(p["job_version_id"]))) if v]
    selected = select_facts(rows, " ".join(targets) or (p.get("target") or ""))
    by_id = {str(r.version.id): r for r in selected}
    facts = {i: check_fact(r) for i, r in by_id.items()}
    names = user_names(db, task.user_id)
    model_facts = {i: model_fact(r, names) for i, r in by_id.items()}
    data = {"facts": list(model_facts.values()), "target_requirements": targets,
            "target_role": p.get("target"), "style": STYLE}

    first = llm.run(db, task, "resume_write", data)
    stmts, verifier_ok = _validate(db, task, first.output.statements, facts, model_facts)
    blocked = [s for s in stmts if s["status"] == "blocked"]
    if blocked:  # one rewrite with the reasons, then withheld (TRD §7.4)
        retry = llm.run(db, task, "resume_write", {**data, "rewrite": [
            # Reasons quote the fact text, so they are redacted like the facts (I-10).
            {"text": s["text"], "cited_fact_version_ids": s["cited_fact_version_ids"],
             "problems": [redact(x, names).text for x in s["reasons"]]}
            for s in blocked]})
        fixed, ok = _validate(db, task, retry.output.statements[:len(blocked)], facts, model_facts)
        verifier_ok = verifier_ok and ok
        for old, new in zip(blocked, fixed, strict=False):
            if new["status"] != "blocked":
                old.update(new)
    if not any(s["status"] != "blocked" for s in stmts):
        raise TaskError("INTERNAL_ERROR", "No line passed the truth checks, so nothing was saved or counted.",
                        retry=False)
    for n, s in enumerate(stmts, 1):
        s["id"] = f"s{n}"
        owner = by_id.get(next(iter(s["cited_fact_version_ids"]), ""))
        s["owner_id"] = str(owner.fact.experience_id or owner.fact.project_id or owner.fact.education_id) if owner else None

    resume_id = uuid.UUID(p["resume_id"])
    uid = task.user_id
    db.add(Resume(id=resume_id, user_id=uid, kind=p["kind"], template_id=p["template_id"],
                  target_occupation_id=p.get("target"),
                  target_job_version_id=uuid.UUID(p["job_version_id"]) if p.get("job_version_id") else None,
                  parent_resume_id=uuid.UUID(p["parent_resume_id"]) if p.get("parent_resume_id") else None))
    db.flush()
    selected_ids = sorted(by_id)
    summary = {k: sum(s["status"] == k for s in stmts) for k in ("passed", "code_checked_only", "blocked")}
    summary["verifier"] = "ok" if verifier_ok else "unavailable"
    db.add(ResumeDraft(resume_id=resume_id, user_id=uid, profile_version=b["profile_version"], statements=stmts))
    db.add(ResumeVersion(
        resume_id=resume_id, user_id=uid, version=1, profile_version=b["profile_version"],
        selected_fact_version_ids=selected_ids, statements=stmts, check_summary=summary,
        basis={**b, "selected_fact_version_ids": selected_ids, "model": first.model,
               "prompt_version": first.prompt_version, "template_id": p["template_id"],
               "rules": {"selection": SELECTION_VERSION, "verbs": "verb_classes-1"}},
    ))
    if p.get("reservation_id"):
        usage.convert(db, uuid.UUID(p["reservation_id"]))
    return {"resume_id": str(resume_id), "checks": summary}
