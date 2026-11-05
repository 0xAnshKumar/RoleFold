"""Deep-match verdict, support resolution and gap typing (TRD §9.4 steps 4, 5, 8; CEO D18, D20).

Pure code: recomputed on every view from the stored requirement mapping and the current
preferences and goals, with no model call (TRD §9.5).
"""

from dataclasses import dataclass, field

SUPPORT_SCORE = {"supported": 1.0, "partial": 0.5}
LABELS = {
    "not_eligible": "Not eligible",
    "strong_fit": "Strong fit",
    "good_fit_with_gaps": "Good fit with gaps",
    "stretch": "Stretch",
    "poor_fit": "Poor fit",
    "not_enough_detail": "Not enough detail in this posting",
}
_ORDER = ["poor_fit", "stretch", "good_fit_with_gaps", "strong_fit"]


@dataclass(frozen=True)
class VerdictRules:
    """Thresholds from config (TRD §15.1); `version` goes into the basis (§16.1)."""

    strong_req: float = 0.8
    good_req: float = 0.6
    stretch_req: float = 0.35
    min_requirements: int = 3
    version: str = "verdict-rules-1"


@dataclass(frozen=True)
class Requirement:
    id: str
    importance: str  # required | preferred | unknown
    gate: str  # none | credential | work_authorization
    support: str  # supported | partial | no_evidence_recorded | confirmed_gap (after resolve_support)
    label: str = ""


@dataclass(frozen=True)
class Eligibility:
    field: str
    status: str  # match | conflict | unknown
    hard: bool  # the user's preference on this field is a hard preference
    constrained: bool = True  # the user's preferences constrain this field at all


@dataclass
class Verdict:
    verdict: str  # key of LABELS
    label: str
    required_coverage: float | None
    capped_by: list[str] = field(default_factory=list)  # reasons, gates and conflicts first
    open_questions: list[str] = field(default_factory=list)  # eligibility fields, unknown gates first



_CAP_LABELS = {"experience_years_min": "Experience", "experience_years_max": "Experience", "work_mode": "Work mode",
               "employment_type": "Employment", "notice_period": "Notice period", "visa_sponsorship": "Visa",
               "education_level": "Education", "required_licence": "Licence", "shift_or_travel": "Shift or travel"}


def cap_text(field: str) -> str:
    """Why a soft eligibility conflict holds the verdict down, in the user's words (never a raw field name)."""
    if field in ("experience_years", "experience_years_min"):
        return "Experience: they ask for more years than your confirmed roles add up to"
    return f"{_CAP_LABELS.get(field, field.replace('_', ' ').capitalize())}: doesn't match your preferences"

def resolve_support(
    model_support: str, valid_citations: int, self_declared: bool = False, does_not_have: bool = False
) -> str:
    """Final support for one requirement after code validation.

    confirmed_gap only from a user does_not_have assertion; a mapping without a valid citation
    becomes no_evidence_recorded; a skill the user only declared counts as partial, never supported.
    """
    if does_not_have:
        return "confirmed_gap"
    if valid_citations > 0 and model_support in ("supported", "partial"):
        return model_support
    return "partial" if self_declared else "no_evidence_recorded"


def gap_type(support: str, in_current_resume: bool) -> str | None:
    if support == "supported":
        return None if in_current_resume else "presentation"
    if support == "confirmed_gap":
        return "learning"
    return "evidence"  # partial or no_evidence_recorded


def decide(
    requirements: list[Requirement],
    eligibility: list[Eligibility],
    goal_fit: str,  # aligned | partly | not_aligned | unknown
    rules: VerdictRules | None = None,
) -> Verdict:
    rules = rules or VerdictRules()
    gates = [r for r in requirements if r.gate != "none"]
    unmet = [f"{r.label or r.id}: you've confirmed you don't have this" for r in gates
             if r.support == "confirmed_gap"]
    unmet += [f"{e.field}: conflicts with your hard preference" for e in eligibility
              if e.status == "conflict" and e.hard]

    unknown_gates = [r.label or r.id for r in gates if r.support not in ("supported", "confirmed_gap")]
    unknown_gates += [e.field for e in eligibility if e.status == "unknown" and e.hard]
    other_unknown = [e.field for e in eligibility if e.status == "unknown" and not e.hard and e.constrained]
    questions = unknown_gates + other_unknown

    required = [r for r in requirements if r.importance == "required"]  # unknown counts as preferred
    coverage = (sum(SUPPORT_SCORE.get(r.support, 0.0) for r in required) / len(required)) if required else None

    if unmet:
        return Verdict("not_eligible", LABELS["not_eligible"], coverage, unmet, questions)
    if len(requirements) < rules.min_requirements or coverage is None:
        return Verdict("not_enough_detail", LABELS["not_enough_detail"], coverage, [], questions)

    if coverage >= rules.strong_req and goal_fit == "aligned":
        verdict = "strong_fit"
    elif coverage >= rules.good_req:
        verdict = "good_fit_with_gaps"
    elif coverage >= rules.stretch_req:
        verdict = "stretch"
    else:
        verdict = "poor_fit"

    caps = [f"{g}: not confirmed yet" for g in unknown_gates]
    caps += [cap_text(e.field) for e in eligibility if e.status == "conflict" and not e.hard]
    if caps and _ORDER.index(verdict) > _ORDER.index("good_fit_with_gaps"):
        verdict = "good_fit_with_gaps"
    return Verdict(verdict, LABELS[verdict], coverage, caps, questions)
