import pytest

from app.truth.verdict import Eligibility, Requirement, VerdictRules, decide, gap_type, resolve_support


def req(i, support, importance="required", gate="none"):
    return Requirement(f"R{i}", importance, gate, support)


def reqs(*supports):
    return [req(i, s) for i, s in enumerate(supports)]


def v(requirements, eligibility=(), goal="aligned", **rules):
    return decide(list(requirements), list(eligibility), goal, VerdictRules(**rules))


def test_coverage_thresholds():
    assert v(reqs("supported", "supported", "supported", "supported", "partial")).verdict == "strong_fit"  # 0.9
    assert v(reqs("supported", "supported", "partial", "no_evidence_recorded")).verdict == "good_fit_with_gaps"
    assert v(reqs("supported", "partial", "no_evidence_recorded")).verdict == "stretch"  # 0.5
    assert v(reqs("partial", "no_evidence_recorded", "no_evidence_recorded")).verdict == "poor_fit"


def test_strong_fit_requires_goal_aligned():
    assert v(reqs("supported", "supported", "supported"), goal="partly").verdict == "good_fit_with_gaps"
    assert v(reqs("supported", "supported", "supported"), goal="unknown").verdict == "good_fit_with_gaps"


def test_coverage_counts_required_only_and_unknown_importance_is_preferred():
    items = reqs("supported", "supported") + [req(5, "no_evidence_recorded", "unknown"),
                                              req(6, "no_evidence_recorded", "preferred")]
    out = v(items)
    assert out.required_coverage == 1.0 and out.verdict == "strong_fit"


def test_not_enough_detail():
    assert v(reqs("supported", "supported")).verdict == "not_enough_detail"  # < MIN_REQUIREMENTS
    only_preferred = [req(i, "supported", "preferred") for i in range(4)]
    assert v(only_preferred).verdict == "not_enough_detail"  # 0 required items
    assert v([req(i, "supported", "unknown") for i in range(4)]).verdict == "not_enough_detail"
    assert v(reqs("supported", "supported"), min_requirements=2).verdict == "strong_fit"


def test_unmet_gate_is_not_eligible_regardless_of_coverage():
    items = reqs("supported", "supported", "supported") + [req(9, "confirmed_gap", gate="credential")]
    out = v(items)
    assert out.verdict == "not_eligible" and out.capped_by


def test_hard_preference_conflict_is_not_eligible():
    out = v(reqs("supported", "supported", "supported"), [Eligibility("work_mode", "conflict", hard=True)])
    assert out.verdict == "not_eligible"


def test_unknown_gate_caps_at_good_fit_and_its_question_comes_first():
    items = reqs("supported", "supported", "supported") + [req(9, "no_evidence_recorded", gate="work_authorization")]
    out = v(items, [Eligibility("salary", "unknown", hard=False)])
    assert out.verdict == "good_fit_with_gaps"
    assert out.open_questions == ["R9", "salary"]


def test_non_gate_conflict_caps_at_good_fit_and_is_listed():
    out = v(reqs("supported", "supported", "supported"), [Eligibility("experience_years", "conflict", hard=False)])
    assert out.verdict == "good_fit_with_gaps"
    assert out.capped_by[0].startswith("experience_years")
    # A cap never raises a verdict.
    low = v(reqs("partial", "no_evidence_recorded", "no_evidence_recorded"),
            [Eligibility("salary", "conflict", hard=False)])
    assert low.verdict == "poor_fit"


def test_A06_unknown_location_is_open_question_not_match():
    out = v(reqs("supported", "supported", "supported"), [Eligibility("location", "unknown", hard=False)])
    assert out.open_questions == ["location"]
    assert out.verdict == "strong_fit"  # a non-hard unknown asks, it does not cap
    hard = v(reqs("supported", "supported", "supported"), [Eligibility("location", "unknown", hard=True)])
    assert hard.verdict == "good_fit_with_gaps" and hard.open_questions == ["location"]


def test_A08_no_evidence_is_never_a_confirmed_gap():
    assert resolve_support("no_evidence_recorded", 0) == "no_evidence_recorded"
    assert resolve_support("supported", 0) == "no_evidence_recorded"  # hallucinated or invalid citation
    assert gap_type("no_evidence_recorded", in_current_resume=False) == "evidence"
    assert resolve_support("supported", 2, does_not_have=True) == "confirmed_gap"
    assert gap_type("confirmed_gap", False) == "learning"


def test_D18_self_declared_skill_is_partial_never_supported():
    assert resolve_support("supported", 0, self_declared=True) == "partial"
    assert resolve_support("no_evidence_recorded", 0, self_declared=True) == "partial"
    assert resolve_support("supported", 1, self_declared=True) == "supported"  # real evidence wins


@pytest.mark.parametrize("support,in_resume,expected", [
    ("supported", True, None),
    ("supported", False, "presentation"),
    ("partial", True, "evidence"),
    ("confirmed_gap", False, "learning"),
])
def test_gap_typing(support, in_resume, expected):
    assert gap_type(support, in_resume) == expected
