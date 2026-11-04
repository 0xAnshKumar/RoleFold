"""match task (TRD §9.4 deep match) and the code-only assessment recomputed on every view (§9.5).

job_extract (untrusted text, datamarked) -> quotes validated against the posting, labels
cross-checked with cues (Side Questions Q5) -> evidence pack of confirmed facts -> requirement_map
-> citations validated in code -> verdict in code. The model never decides eligibility or verdict.
"""

import hashlib
import json
import re
import uuid
from dataclasses import dataclass
from datetime import date

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core import usage
from app.core.config import get_settings
from app.core.display import day, role, years
from app.db.models import (
    CareerGoal,
    Education,
    Experience,
    Fact,
    FactVersion,
    Job,
    JobEligibility,
    JobRequirement,
    JobVersion,
    MatchAnalysis,
    PreferenceVersion,
    Project,
    SkillAssertion,
    User,
    UserSkill,
)
from app.llm.gateway import datamark
from app.llm.schemas import JobEligibilityDraft, JobRequirementDraft
from app.routes.profile import profile_version
from app.tasks import llm
from app.tasks.queue import Claimed, TaskError
from app.truth import verdict as vr
from app.truth.aliases import approved_aliases, norm
from app.truth.redact import PLACEHOLDER_RE, redact, restore

CUE_RULES_VERSION = "label-cues-1"
RULES = vr.VerdictRules()

# ---------------------------------------------------------------- posting text (code)

_QUOTES = str.maketrans("‘’“”", "''\"\"")
_REQ_CUE = re.compile(r"\b(must|required|requirements?|mandatory|essential|minimum)\b", re.IGNORECASE)
_PREF_CUE = re.compile(
    r"\b(nice[- ]to[- ]have|preferred|preferably|a plus|bonus|desirable|good[- ]to[- ]have|ideally|advantage)\b",
    re.IGNORECASE,
)
_BULLET = re.compile(r"^\s*([-*•·▪]|\d+[.)])\s")


def locate(quote: str | None, text: str) -> tuple[int, int] | None:
    """Span of `quote` in `text`, whitespace- and quote-mark-insensitive; None if it isn't there."""
    words = (quote or "").translate(_QUOTES).split()
    if not words:
        return None
    m = re.search(r"\s+".join(map(re.escape, words)), text.translate(_QUOTES))
    return (m.start(), m.end()) if m else None


def section_heading(text: str, start: int) -> str:
    """Nearest heading above position `start`: a non-bullet line ending in ':' or of at most 60 chars."""
    for line in reversed(text[:start].split("\n")[:-1]):
        line = line.strip()
        if line and not _BULLET.match(line) and (line.endswith(":") or len(line) <= 60):
            return line
    return ""


def cues(text: str, start: int, quote: str) -> set[str]:
    """Required/preferred cues in the quote itself, else in its section heading."""
    for source in (quote, section_heading(text, start)):
        found = {label for label, rx in (("required", _REQ_CUE), ("preferred", _PREF_CUE)) if rx.search(source)}
        if found:
            return found
    return set()


def checked_importance(model_label: str, found: set[str]) -> str:
    """The model's label survives unless the cues point the other way only (then unknown, TRD §10.2)."""
    other = {"required": "preferred", "preferred": "required"}.get(model_label)
    return "unknown" if other and other in found and model_label not in found else model_label


def clean_requirements(drafts: list[JobRequirementDraft], text: str) -> list[dict]:
    """Requirements whose quote is not in the posting are dropped (I-7)."""
    out, seen = [], set()
    for d in drafts:
        span = locate(d.quote, text)
        if span is None or span in seen:
            continue
        seen.add(span)
        quote = text[span[0]:span[1]]
        out.append({
            "quote": quote, "quote_start": span[0], "quote_end": span[1], "category": d.category,
            "importance": checked_importance(d.importance, cues(text, span[0], quote)),
            "gate": d.gate, "value": (d.skill_text or "").strip() or None,
        })
    return out


ELIGIBILITY_FIELD = {"experience_years": "experience_years_min", "visa": "visa_sponsorship"}


def clean_eligibility(drafts: list[JobEligibilityDraft], text: str) -> list[dict]:
    """A value without a quote found in the posting is stored as unknown (I-7). One row per field."""
    out: dict[str, dict] = {}
    for d in drafts:
        field = ELIGIBILITY_FIELD.get(d.field, d.field)
        span = locate(d.quote, text)
        if field in out:
            continue
        ok = span is not None and d.value
        out[field] = {"field": field, "value": {"text": d.value} if ok else None,
                      "quote": text[span[0]:span[1]] if ok else None}
    return list(out.values())


# ---------------------------------------------------------------- profile side (code)


@dataclass
class FactRow:
    fact: Fact
    version: FactVersion
    experience: Experience | None
    project: Project | None

    @property
    def start(self) -> date | None:
        owner = self.experience or self.project
        return owner.start_month if owner else None


def current_facts(db: Session, version_ids: list[str] | None = None) -> list[FactRow]:
    """Confirmed, current fact versions (I-1); or exactly `version_ids` (a frozen basis)."""
    stmt = (
        select(Fact, FactVersion, Experience, Project)
        .join(FactVersion, FactVersion.fact_id == Fact.id)
        .outerjoin(Experience, Fact.experience_id == Experience.id)
        .outerjoin(Project, Fact.project_id == Project.id)
        .order_by(Fact.created_at, Fact.id)
    )
    if version_ids is None:
        stmt = stmt.where(Fact.status == "confirmed", FactVersion.version == Fact.current_version)
    else:
        stmt = stmt.where(FactVersion.id.in_([uuid.UUID(i) for i in version_ids]))
    return [FactRow(*r) for r in db.execute(stmt).all()]


_STOP = {"and", "or", "the", "with", "in", "of", "to", "for", "a", "an", "on", "at", "is", "be", "you", "experience"}


def tokens(text: str) -> set[str]:
    return {t for t in re.findall(r"[a-z0-9+#.]+", text.lower()) if len(t) > 1 and t not in _STOP}


def user_names(db: Session, user_id: uuid.UUID) -> list[str]:
    """Names to redact from model input (I-10): the stored users.name. (The import header name is
    not stored; the import task adds it from the file it is reading.)"""
    name = db.scalar(select(User.name).where(User.id == user_id))
    return [name] if name else []


def fact_text(row: FactRow, names: list[str] = (), mapping: dict[str, str] | None = None) -> str:
    """Fact text for a model: contact details and the user's name redacted (I-10) even if the user typed them.
    Pass one `mapping` for every text in a model call so placeholders in its output can be restored."""
    return redact(row.version.description, names, mapping=mapping).text


def pack_item(row: FactRow, names: list[str] = (), mapping: dict[str, str] | None = None) -> dict:
    owner = row.experience
    return {"id": str(row.version.id), "text": fact_text(row, names, mapping), "tools": [t.get("raw") for t in row.version.tools],
            "role": role(owner.title, owner.employer) if owner else (row.project.name if row.project else None)}


def evidence_pack(rows: list[FactRow], wanted: str, cap_tokens: int, names: list[str] = (),
                  mapping: dict[str, str] | None = None) -> list[dict]:
    """Facts ranked by word overlap with the target, newest first on ties, capped at ~cap_tokens (chars / 4)."""
    want = tokens(wanted)

    def rank(row: FactRow):
        overlap = len(tokens(row.version.description + " " + " ".join(t.get("raw", "") for t in row.version.tools)) & want)
        return (-overlap, -(row.start or date.min).toordinal())

    pack, used = [], 0
    for row in sorted(rows, key=rank):
        item = pack_item(row, names, mapping)
        cost = len(json.dumps(item)) // 4 + 1
        if used + cost <= cap_tokens:
            pack.append(item)
            used += cost
    return pack


def education_items(db: Session) -> list[dict]:
    """Confirmed education as evidence, so a degree requirement can be supported. Its id is the education
    row id (not a fact version); the match page then shows the degree without a fact link."""
    return [{"id": str(e.id), "text": ", ".join(x for x in (e.degree, e.field_of_study, e.institution) if x)
             + (f" ({years(e.start_month, e.end_month)})" if e.start_month or e.end_month else ""),
             "tools": [], "role": "Education"}
            for e in db.scalars(select(Education).where(Education.status == "confirmed").order_by(Education.id))]


def full_pack(db: Session, rows: list[FactRow], wanted: str, names: list[str] = (),
              mapping: dict[str, str] | None = None) -> list[dict]:
    """The requirement_map evidence: ranked facts within the token cap, plus every confirmed degree (small)."""
    return evidence_pack(rows, wanted, get_settings().evidence_pack_tokens, names, mapping) + education_items(db)


def pack_hash(ids: list[str]) -> str:
    return hashlib.sha256(",".join(sorted(ids)).encode()).hexdigest()


def latest(db: Session, model):
    return db.scalars(select(model).order_by(model.version.desc()).limit(1)).first()


def basis(db: Session, user_id: uuid.UUID, fact_version_ids: list[str], **extra) -> dict:
    """TRD §16.1 basis record (taxonomy is not built yet, so taxonomy_version is null)."""
    prefs, goals = latest(db, PreferenceVersion), latest(db, CareerGoal)
    return {
        "profile_version": profile_version(db, user_id), "fact_version_ids": sorted(fact_version_ids),
        "preference_version": prefs.version if prefs else None, "goals_version": goals.version if goals else None,
        "taxonomy_version": None, **extra,
    }


# ---------------------------------------------------------------- assessment (code, every view)

FIELD_LABELS = {
    "location": "Location", "work_mode": "Work mode", "employment_type": "Employment",
    "experience_years_min": "Experience", "experience_years_max": "Experience", "salary": "Salary",
    "notice_period": "Notice period", "visa_sponsorship": "Visa", "education_level": "Education",
    "required_licence": "Licence", "language": "Language", "shift_or_travel": "Shift or travel",
}
QUESTIONS = {
    "location": "Where is this role based?",
    "work_mode": "Is this role remote, hybrid or on-site?",
    "employment_type": "Is this full-time, contract or part-time?",
    "experience_years_min": "How many years of experience do they expect?",
    "notice_period": "What's the notice period you can work with?",
    "salary": "What's the salary range?",
    "visa_sponsorship": "Do they sponsor work visas?",
}
STATUS = {"supported": "supported", "partial": "partial", "no_evidence_recorded": "no_evidence", "confirmed_gap": "gap"}
DB_VERDICT = {"not_enough_detail": "insufficient_detail"}


def _name(x) -> str:
    return (x.get("name") or x.get("label") or x.get("place_id") or "") if isinstance(x, dict) else str(x)


def _days(text: str) -> int | None:
    m = re.search(r"(\d+)\s*(day|week|month)?", text)
    if not m:
        return 0 if "immediate" in text else None
    return int(m.group(1)) * {"week": 7, "month": 30}.get(m.group(2) or "day", 1)


def compare(field: str, text: str | None, prefs: PreferenceVersion | None, exp_years: float) -> tuple[str, bool]:
    """(status, constrained): match | conflict | unknown against the user's preferences."""
    t = (text or "").lower()
    p = prefs
    checks = {
        "location": bool(p and p.locations),
        "work_mode": bool(p and p.work_modes),
        "employment_type": bool(p and p.employment_types),
        "notice_period": bool(p and p.notice_period_days is not None),
        "experience_years_min": exp_years > 0,
        "salary": bool(p and p.salary_range),
        "visa_sponsorship": bool(p and p.visa_needs),
    }
    constrained = checks.get(field, False)
    if text is None:
        return "unknown", constrained
    if field == "location" and constrained:
        remote_ok = "remote" in t and any("remote" in _name(m).lower() for m in p.work_modes)
        ok = remote_ok or any(_name(x).lower() in t for x in p.locations if _name(x))
    elif field == "work_mode" and constrained:
        ok = any(_name(m).lower() in t for m in p.work_modes)
    elif field == "employment_type" and constrained:
        ok = any(_name(e).lower().replace("-", " ") in t.replace("-", " ") for e in p.employment_types)
    elif field == "notice_period" and constrained:
        days = _days(t)
        if days is None:
            return "unknown", True
        ok = p.notice_period_days <= days
    elif field == "experience_years_min" and constrained:
        m = re.search(r"\d+", t)
        if not m:
            return "unknown", True
        ok = exp_years >= int(m.group(0))
    else:
        return "match", constrained  # stated, and nothing in the preferences to compare it with
    return ("match" if ok else "conflict"), True


def goal_fit(title: str | None, goals: CareerGoal | None) -> dict:
    targets = [_name(t) for t in (goals.target_occupations if goals else []) if _name(t)]
    if not targets or not title:
        return {"status": "unknown", "text": "Add a target role to your goals to see how this job fits them."}
    t = title.lower()
    for target in targets:
        if target.lower() in t or t in target.lower():
            return {"status": "aligned", "text": f"Matches your goal: {target}."}
    for target in targets:
        if tokens(target) & tokens(title):
            return {"status": "partly", "text": f"Partly matches your goal: {target}."}
    return {"status": "not_aligned", "text": f"Different from your goal: {', '.join(targets)}."}


def experience_years(db: Session) -> float:
    today = date.today()
    months = sum(
        (e.end_month or today).year * 12 + (e.end_month or today).month - e.start_month.year * 12 - e.start_month.month
        for e in db.scalars(select(Experience).where(Experience.status == "confirmed", Experience.start_month.is_not(None)))
    )
    return months / 12


def latest_analysis(db: Session, job_version_id: uuid.UUID) -> MatchAnalysis | None:
    return db.scalars(
        select(MatchAnalysis).where(MatchAnalysis.job_version_id == job_version_id)
        .order_by(MatchAnalysis.created_at.desc()).limit(1)
    ).first()


def assess(db: Session, job: Job, jv: JobVersion, analysis: MatchAnalysis) -> dict:
    """The match page (src/lib/mock.ts `Match`), recomputed in code under current preferences (TRD §9.5).

    Internal keys start with "_" and are stripped by the route.
    """
    prefs, goals = latest(db, PreferenceVersion), latest(db, CareerGoal)
    exp_years = experience_years(db)
    reqs = db.scalars(select(JobRequirement).where(JobRequirement.job_version_id == jv.id)
                      .order_by(JobRequirement.quote_start)).all()
    stated = db.scalars(select(JobEligibility).where(JobEligibility.job_version_id == jv.id)).all()
    mapping = {r["requirement_id"]: r for r in analysis.requirement_results}

    declared = {s.raw_label.lower() for s in db.scalars(select(UserSkill).where(UserSkill.self_declared))}
    lacking = {(a.requirement_text or a.skill_id or "").lower() for a in db.scalars(
        select(SkillAssertion).where(SkillAssertion.assertion == "does_not_have", SkillAssertion.withdrawn_at.is_(None)))}
    cited_ids = {i for r in mapping.values() for i in r["cited_fact_version_ids"]}
    fact_of = dict(db.execute(select(FactVersion.id, FactVersion.fact_id)
                              .where(FactVersion.id.in_([uuid.UUID(i) for i in cited_ids]))).all()) if cited_ids else {}

    degrees = {e["id"]: e["text"] for e in education_items(db)}
    requirements, req_rows = [], []
    for r in reqs:
        m = mapping.get(str(r.id), {"model_support": "no_evidence_recorded", "cited_fact_version_ids": [], "reason": ""})
        text = r.value or r.quote
        keys = {k.lower() for k in (r.value, r.quote) if k}
        support = vr.resolve_support(m["model_support"], len(m["cited_fact_version_ids"]),
                                     self_declared=bool(r.value and r.value.lower() in declared),
                                     does_not_have=bool(keys & lacking))
        requirements.append(vr.Requirement(str(r.id), r.importance, r.gate, support, text))
        row = {"id": str(r.id), "text": text, "importance": "required" if r.importance == "required" else "preferred",
               "status": STATUS[support], "quote": r.quote}
        first = next(iter(m["cited_fact_version_ids"]), None)
        if support in ("supported", "partial") and first in degrees:
            row["note"] = f"Your confirmed education: {degrees[first]}"
        elif support in ("supported", "partial") and first:
            row["factId"] = str(fact_of.get(uuid.UUID(first), ""))
        if support != "supported" and m["reason"]:
            row["note"] = m["reason"]
        req_rows.append(row)

    eligibility, elig_rows = [], []
    for e in stated:
        value = (e.value or {}).get("text")
        status, constrained = compare(e.field, value, prefs, exp_years)
        eligibility.append(vr.Eligibility(e.field, status, hard=False, constrained=constrained))
        elig_rows.append({"field": FIELD_LABELS[e.field], "value": value or "Not stated", "status": status,
                          "quote": e.quote})
    for field in sorted(set(QUESTIONS) - {e.field for e in stated}):
        status, constrained = compare(field, None, prefs, exp_years)
        if constrained:
            eligibility.append(vr.Eligibility(field, status, hard=False, constrained=True))
            elig_rows.append({"field": FIELD_LABELS[field], "value": "Not stated", "status": status, "quote": None})

    goal = goal_fit(job.title, goals)
    v = vr.decide(requirements, eligibility, goal["status"], RULES)
    return {
        "id": str(job.id), "title": job.title or "Untitled role", "company": job.company or "",
        "source": f"{'From your job feed' if job.catalog_job_id else 'Pasted by you'} · {day(jv.observed_at)}",
        "verdict": v.label, "reasons": reasons(v, requirements, eligibility),
        "eligibility": elig_rows, "requirements": req_rows, "goalFit": goal,
        "questions": [QUESTIONS.get(q, f"Is “{q}” a must-have for this role?") for q in v.open_questions],
        "enrichment": enrichment(requirements, {str(r.id): r.category for r in reqs}),
        "profileNote": f"Reflects your profile version {analysis.basis.get('profile_version')} "
                       f"as of {day(analysis.created_at)}",
        "freshness": "current" if analysis.evidence_pack_hash == pack_hash(
            [p["id"] for p in full_pack(db, current_facts(db), " ".join(r.value or r.quote or "" for r in reqs))])
        else "outdated",
        "_verdict": v, "_goal": goal["status"], "_eligibility": elig_rows,
    }


def reasons(v: vr.Verdict, reqs: list[vr.Requirement], elig: list[vr.Eligibility]) -> list[str]:
    if v.verdict == "not_eligible":
        return v.capped_by
    out = []
    if elig and all(e.status == "match" for e in elig):
        out.append("Every stated eligibility item fits your preferences.")
    required = [r for r in reqs if r.importance == "required"]
    if required:
        n = sum(r.support in ("supported", "partial") for r in required)
        out.append(f"{n} of {len(required)} required items have evidence in your profile.")
    out += [f"{r.label} is asked for, but nothing is recorded yet." for r in required
            if r.support == "no_evidence_recorded"][:3]
    if v.verdict == "not_enough_detail":
        out.append(f"This posting lists fewer than {RULES.min_requirements} clear requirements, "
                   "so there's no verdict.")
    return out + v.capped_by


def enrichment(reqs: list[vr.Requirement], categories: dict[str, str | None] | None = None) -> str:
    """The "close the gap" question, worded for what is asked: a degree, a certification, years, or a skill."""
    missing = next((r for r in reqs if r.support == "no_evidence_recorded"), None)
    if missing is None:
        return ""
    label, kind = missing.label, (categories or {}).get(missing.id)
    if kind == "education":
        return f"Do you have {label}, or something equivalent? Add it to your education and confirm it so it counts."
    if kind == "credential" or missing.gate == "credential":
        return f"Do you hold {label}? Add it with who issued it and when, so it can count."
    if kind == "experience":
        return f"Where have you done this: {label}? Add a fact with the role and what you did, so the time counts."
    return f"Have you used {label} anywhere, even on a side project? What did you do with it?"


# ---------------------------------------------------------------- the task


def _restored(text: str, mapping: dict[str, str]) -> str:
    """Model text shown to the user: placeholders restored; dropped if an unknown one is left (never shown raw)."""
    text = restore(text, mapping)
    return "" if PLACEHOLDER_RE.search(text) else text


def match_job(db: Session, task: Claimed) -> dict:
    jv = db.get(JobVersion, uuid.UUID(task.payload["job_version_id"]))
    if jv is None:
        raise TaskError("NOT_FOUND", "This job no longer exists.", retry=False)
    job, uid, text = db.get(Job, jv.job_id), jv.owner_user_id, jv.raw_text

    extracted = llm.run(db, task, "job_extract", {}, untrusted_text=text)
    out = extracted.output
    job.title = out.title if locate(out.title, text) else job.title
    job.company = out.company if locate(out.company, text) else job.company
    reqs = [JobRequirement(owner_user_id=uid, job_version_id=jv.id, requirement_key=f"R{i}",
                           extraction_version=f"{extracted.prompt_version}+{CUE_RULES_VERSION}", **r)
            for i, r in enumerate(clean_requirements(out.requirements, text), 1)]
    aliases = approved_aliases(db, [r.value or "" for r in reqs if r.category == "skill"])
    for r in reqs:  # curator-approved aliases give unmapped skill requirements a skill id (TRD §6)
        if r.category == "skill" and not r.skill_id:
            r.skill_id = aliases.get(norm(r.value or ""))
    db.add_all(reqs)
    db.add_all(JobEligibility(owner_user_id=uid, job_version_id=jv.id, **e) for e in clean_eligibility(out.eligibility, text))
    db.flush()

    facts = current_facts(db)
    names, redacted = user_names(db, uid), {}  # one placeholder map for everything sent, to restore `reason`
    pack = full_pack(db, facts, " ".join(r.value or r.quote for r in reqs), names, redacted)
    pack_ids = {p["id"] for p in pack}
    mapped, prompt_versions, model = {}, {"job_extract": extracted.prompt_version}, extracted.model
    if len(reqs) >= RULES.min_requirements and pack:
        # Normalized values go to the model; the quote only when there is no value, redacted and datamarked.
        items = [{"id": r.requirement_key, "value": r.value, "category": r.category,
                  "quote": None if r.value else datamark(redact(r.quote, names, mapping=redacted).text)} for r in reqs]
        res = llm.run(db, task, "requirement_map", {"requirements": items, "evidence_pack": pack})
        mapped = {m.requirement_id: m for m in res.output.results}
        prompt_versions["requirement_map"], model = res.prompt_version, res.model

    results = []
    for r in reqs:
        m = mapped.get(r.requirement_key)
        results.append({
            "requirement_id": str(r.id), "model_support": m.support if m else "no_evidence_recorded",
            # I-1: only citations from the evidence pack (confirmed, current, this user's) survive.
            "cited_fact_version_ids": [i for i in (m.cited_fact_version_ids if m else []) if i in pack_ids],
            "reason": _restored(m.reason, redacted) if m else "",
        })
    analysis = MatchAnalysis(
        user_id=uid, job_version_id=jv.id, evidence_pack_hash=pack_hash(list(pack_ids)),
        evidence_fact_version_ids=sorted(pack_ids), requirement_results=results, model_version=model,
        prompt_version=json.dumps(prompt_versions, sort_keys=True),
        basis=basis(db, uid, [str(f.version.id) for f in facts], job_version_id=str(jv.id), model=model,
                    prompt_versions=prompt_versions, rules={"verdict": RULES.version, "labels": CUE_RULES_VERSION}),
    )
    db.add(analysis)
    db.flush()
    view = assess(db, job, jv, analysis)
    v = view["_verdict"]
    analysis.verdict = DB_VERDICT.get(v.verdict, v.verdict)
    analysis.goal_fit, analysis.eligibility_results, analysis.open_questions = view["_goal"], view["_eligibility"], view["questions"]

    reservation_id = task.payload.get("reservation_id")
    if reservation_id:
        # Not enough detail is refunded (CEO D19).
        (usage.release if v.verdict == "not_enough_detail" else usage.convert)(db, uuid.UUID(reservation_id))
    return {"job_id": str(job.id), "match_id": str(analysis.id), "verdict": v.label}
