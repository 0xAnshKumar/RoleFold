"""import task (TRD §5.1): redact -> resume_extract -> code validation -> drafts the user confirms.

Nothing here confirms anything: every row is status=draft, origin=import. Responsibility level is
only a suggestion from the source verb (TRD §5.2). Text comes from the task payload (extracted by
POST /v1/imports, or sent by the client) and is scrubbed from the payload on success.
"""

import re
import uuid
from datetime import date

from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.db.models import (
    Achievement,
    CareerGap,
    Certification,
    Education,
    Experience,
    Fact,
    FactVersion,
    Import,
    Language,
    Project,
    Task,
    UserSkill,
)
from app.llm.schemas import DraftFact, ResumeExtract
from app.routes.profile import _add_version
from app.tasks import llm
from app.tasks.match import user_names
from app.tasks.queue import Claimed, TaskError
from app.truth import numbers
from app.truth.aliases import approved_aliases
from app.truth.aliases import norm as alias_norm
from app.truth.checks import _verb_lexicon
from app.truth.redact import redact, restore

PARSER_VERSION = "plain-text-1"
_NAME_LINE_RE = re.compile(r"[A-Z][A-Za-z.'-]*(?: [A-Z][A-Za-z.'-]*){1,3}")
_MONTH_RE = re.compile(r"(\d{4})-(\d{2})")
_YEAR_RE = re.compile(r"\d{4}")


def header_name(text: str) -> list[str]:
    """The parsed header name: the first non-empty line when it looks like a name (2-4 capitalized words)."""
    first = next((line.strip() for line in text.splitlines() if line.strip()), "")
    return [first] if _NAME_LINE_RE.fullmatch(first) else []


def parse_month(value: str | None, year_ok: bool = False) -> date | None:
    """"YYYY-MM"; with `year_ok`, also "YYYY" (education is shown by year only, so no month is invented)."""
    value = (value or "").strip()
    if year_ok and _YEAR_RE.fullmatch(value):
        return date(int(value), 1, 1)
    m = _MONTH_RE.fullmatch(value)
    if not m or not 1 <= int(m.group(2)) <= 12:
        return None
    return date(int(m.group(1)), int(m.group(2)), 1)


def dates(start: str | None, end: str | None, year_ok: bool = False) -> tuple[date | None, date | None]:
    """Unparseable or out-of-order dates become unknown (I-7), never a guess."""
    s, e = parse_month(start, year_ok), parse_month(end, year_ok)
    return (None, None) if s and e and e < s else (s, e)


def norm(*parts: str | None) -> tuple[str, ...]:
    """Comparison key for de-duplicating re-imports: case, spacing and punctuation don't matter."""
    return tuple(" ".join(re.sub(r"[^\w]+", " ", (p or "").lower()).split()) for p in parts)


def contact(mapping: dict[str, str], names: list[str]) -> dict:
    """What redaction captured from the resume header, so onboarding can offer it to the user to confirm.

    Returned in the task result only (owner-scoped); never sent to a model.
    """
    first = {kind: next((v for ph, v in mapping.items() if ph.startswith(f"⟦{kind}_")), None)
             for kind in ("EMAIL", "PHONE")}
    return {"name": names[0] if names else None, "email": first["EMAIL"], "phone": first["PHONE"]}


def numbers_in_source(fact: DraftFact, source: list[numbers.Quantity]) -> bool:
    """Every number in the draft appears in the resume text (TRD §5.1 step 5).

    The outcome is checked with its unit: a bare "50" (unit "%") would otherwise never match "50%".
    """
    outcome = f"{fact.outcome_value} {fact.outcome_unit or ''}" if fact.outcome_value else None
    text = " ".join(x for x in (fact.description, outcome) if x)
    return all(any(numbers.same(q, s) for s in source) for q in numbers.extract(text))


def suggested_level(verb: str | None) -> int | None:
    return _verb_lexicon()[0].get((verb or "").lower())


def _outcome(value: str | None) -> float | None:
    try:
        return float((value or "").replace(",", ""))
    except ValueError:
        return None


def _add_facts(db: Session, uid: uuid.UUID, owner_col: str, owner_id: uuid.UUID, drafts: list[DraftFact],
               source: list[numbers.Quantity], import_id: uuid.UUID) -> int:
    """Draft facts under one owner. A fact the owner already has (any status, so a rejected one stays
    rejected) is skipped, so re-importing the same resume adds only what is new."""
    dropped = 0
    have = set(db.scalars(select(FactVersion.description).join(Fact, Fact.id == FactVersion.fact_id)
                          .where(getattr(Fact, owner_col) == owner_id)))
    have = {norm(x) for x in have}
    for d in drafts:
        if not numbers_in_source(d, source):
            dropped += 1
            continue
        if norm(d.description) in have:
            continue
        have.add(norm(d.description))
        fact = Fact(user_id=uid, origin="import", current_version=1, **{owner_col: owner_id})
        db.add(fact)
        db.flush()
        v = _add_version(db, fact, {
            "description": d.description, "tools": [{"skill_id": None, "raw": t} for t in d.tools],
            "responsibility_level": suggested_level(d.source_verb), "outcome_value": _outcome(d.outcome_value),
            "outcome_unit": d.outcome_unit, "completion": d.completion,
        })
        v.source_span = {"import_id": str(import_id), "text": d.source_span}
    return dropped


def import_resume(db: Session, task: Claimed) -> dict:
    imp = db.get(Import, uuid.UUID(task.payload["import_id"]))
    if imp is None:
        raise TaskError("NOT_FOUND", "This import no longer exists.", retry=False)
    text = (task.payload.get("text") or "").strip()
    if not text:
        raise TaskError("NO_EXTRACTABLE_TEXT",
                        "We couldn't read any text from this file. Upload a TXT or MD file, or paste the text.",
                        retry=False)
    names = header_name(text)
    red = redact(text, names + user_names(db, imp.user_id), header=True)
    result = llm.run(db, task, "resume_extract", {}, untrusted_text=red.text)
    out = ResumeExtract.model_validate(restore(result.output.model_dump(), red.mapping))
    source = numbers.extract(text)
    uid, created, dropped = imp.user_id, [], 0

    def add(kind: str, row) -> None:
        db.add(row)
        db.flush()
        created.append({"type": kind, "id": str(row.id)})

    # Re-imports merge into what exists (not rejected): same role = title + employer + start,
    # same project = name + start, same education = degree + institution, same certification or language = name,
    # same achievement = kind + text, same career break = start month.
    def existing(model, key) -> dict:
        return {key(r): r for r in db.scalars(select(model).where(model.status != "rejected"))}

    roles = existing(Experience, lambda r: norm(r.title, r.employer, str(r.start_month)))
    for d in out.experiences:
        start, end = dates(d.start, d.end)
        e = roles.get(norm(d.title, d.employer, str(start)))
        if e is None:
            e = roles[norm(d.title, d.employer, str(start))] = Experience(
                user_id=uid, origin="import", employer=d.employer, title=d.title, location=d.location,
                start_month=start, end_month=end)
            add("experience", e)
        dropped += _add_facts(db, uid, "experience_id", e.id, d.facts, source, imp.id)
    projects = existing(Project, lambda r: norm(r.name, str(r.start_month)))
    for d in out.projects:
        start, end = dates(d.start, d.end)
        p = projects.get(norm(d.title or d.employer, str(start)))
        if p is None:
            p = projects[norm(d.title or d.employer, str(start))] = Project(
                user_id=uid, origin="import", name=d.title or d.employer, start_month=start, end_month=end)
            add("project", p)
        dropped += _add_facts(db, uid, "project_id", p.id, d.facts, source, imp.id)
    schools = existing(Education, lambda r: norm(r.degree, r.institution))
    for d in out.education:
        if norm(d.degree, d.institution) in schools:
            continue
        start, end = dates(d.start, d.end, year_ok=True)
        ed = schools[norm(d.degree, d.institution)] = Education(
            user_id=uid, origin="import", institution=d.institution, degree=d.degree, start_month=start, end_month=end)
        add("education", ed)
    certs = existing(Certification, lambda r: norm(r.name))
    for c in out.certifications:
        if norm(c.name) not in certs:
            certs[norm(c.name)] = Certification(user_id=uid, origin="import", name=c.name)
            add("certification", certs[norm(c.name)])
    have = {s.lower() for s in db.scalars(select(UserSkill.raw_label))}
    aliases = approved_aliases(db, [s.name for s in out.skills])
    for s in out.skills:
        if s.name.lower() not in have:
            have.add(s.name.lower())
            add("skill", UserSkill(user_id=uid, raw_label=s.name, self_declared=True,
                                   skill_id=aliases.get(alias_norm(s.name))))
    langs = existing(Language, lambda r: norm(r.name))
    for lang in out.languages:
        if norm(lang.name) not in langs:
            langs[norm(lang.name)] = Language(user_id=uid, origin="import", name=lang.name)
            add("language", langs[norm(lang.name)])
    wins = existing(Achievement, lambda r: norm(r.kind, r.description))
    for a in out.achievements:
        if a.text.strip() and norm(a.kind, a.text) not in wins:
            wins[norm(a.kind, a.text)] = Achievement(user_id=uid, origin="import", kind=a.kind, description=a.text.strip())
            add("achievement", wins[norm(a.kind, a.text)])
    breaks = existing(CareerGap, lambda r: r.start_month)
    for b in out.career_breaks:
        start, end = dates(b.start, b.end)
        if start and start not in breaks:  # a break needs a start month; none is guessed
            # It was on the user's own resume, so once confirmed it stays on their resumes.
            breaks[start] = CareerGap(user_id=uid, status="draft", start_month=start, end_month=end,
                                      reason_text=(b.reason or "").strip()[:200] or None, show_on_resume=True)
            add("career_gap", breaks[start])

    imp.parser_version, imp.model_version, imp.created_entries = PARSER_VERSION, result.model, created
    payload = {k: v for k, v in task.payload.items() if k != "text"}
    db.execute(update(Task).where(Task.id == task.id).values(payload=payload))
    return {"import_id": str(imp.id), "created": len(created), "dropped_facts": dropped,
            "contact": contact(red.mapping, names)}
