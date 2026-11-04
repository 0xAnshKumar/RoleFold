"""Pure parts of the import / match / tailor handlers and the LLM runner. No DB, FakeLLM only."""

import json
import uuid
from datetime import date
from types import SimpleNamespace

import pytest

from app.llm.gateway import CallRecord, ErrorClass, FakeLLM, Gateway, ProviderResponse
from app.llm.schemas import DraftFact, JobEligibilityDraft, JobRequirementDraft, WrittenStatement
from app.tasks import llm
from app.tasks.imports import dates, header_name, numbers_in_source, suggested_level
from app.tasks.match import (
    FactRow,
    _restored,
    checked_importance,
    clean_eligibility,
    clean_requirements,
    compare,
    enrichment,
    evidence_pack,
)
from app.tasks.queue import Claimed, Deferred, TaskError
from app.tasks.tailor import MAX_PER_ROLE, _validate, check_fact, model_fact, select_facts
from tests.conftest import MODELS

POSTING = """Senior Frontend Engineer
Requirements:
- Deep experience with React and
  TypeScript in production
- Jest is a plus
Nice to have:
- Kubernetes basics
Notice period: 30 days
"""


def req(quote, importance="required", **kw):
    return JobRequirementDraft(quote=quote, category="skill", importance=importance, **kw)


def test_quotes_not_in_posting_are_dropped_and_spans_are_exact():
    out = clean_requirements([req("Deep experience with React and TypeScript in production", skill_text="React"),
                              req("Ten years of Haskell")], POSTING)
    assert len(out) == 1
    r = out[0]
    assert POSTING[r["quote_start"]:r["quote_end"]] == r["quote"]  # line break inside the quote is fine
    assert r["value"] == "React" and r["importance"] == "required"


def test_label_cross_check_turns_disagreement_into_unknown():
    out = clean_requirements([req("Jest is a plus"), req("Kubernetes basics"),
                              req("Deep experience with React", "preferred")], POSTING)
    assert [r["importance"] for r in out] == ["unknown", "unknown", "unknown"]
    assert checked_importance("required", set()) == "required"  # no cues: no disagreement
    assert checked_importance("preferred", {"preferred"}) == "preferred"


def test_eligibility_without_a_real_quote_is_unknown():
    out = clean_eligibility([
        JobEligibilityDraft(field="notice_period", value="30 days", quote="Notice period: 30 days"),
        JobEligibilityDraft(field="location", value="Bengaluru", quote="Based in Bengaluru"),
        JobEligibilityDraft(field="visa", value="Sponsored", quote=None),
    ], POSTING)
    by = {e["field"]: e for e in out}
    assert by["notice_period"]["value"] == {"text": "30 days"}
    assert by["location"]["value"] is None and by["location"]["quote"] is None
    assert by["visa_sponsorship"]["value"] is None


def test_eligibility_compare():
    prefs = SimpleNamespace(locations=["Bengaluru"], work_modes=["Hybrid"], employment_types=[],
                            notice_period_days=60, salary_range=None, visa_needs=[])
    assert compare("location", "Bengaluru, hybrid", prefs, 0) == ("match", True)
    assert compare("location", "Pune", prefs, 0) == ("conflict", True)
    assert compare("notice_period", "30 days", prefs, 0) == ("conflict", True)
    assert compare("notice_period", "3 months", prefs, 0) == ("match", True)
    assert compare("experience_years_min", "4+ years", prefs, 5.5) == ("match", True)
    assert compare("salary", None, prefs, 0) == ("unknown", False)
    assert compare("employment_type", "Full-time", prefs, 0) == ("match", False)


def test_import_validation_helpers():
    assert header_name("Rohan Iyer\nrohan@example.com") == ["Rohan Iyer"]
    assert header_name("Experience\n...") == []
    assert dates("2021-07", None) == (date(2021, 7, 1), None)
    assert dates("2022-01", "2021-01") == (None, None) and dates("2021-13", "x") == (None, None)
    source = __import__("app.truth.numbers", fromlist=["extract"]).extract("cut bundle from 1.8 MB to 640 KB")
    assert numbers_in_source(DraftFact(description="cut it from 1,800 KB to 640 KB", source_span="x"), source)
    assert not numbers_in_source(DraftFact(description="grew revenue 45%", source_span="x"), source)
    # The model splits "640 KB" into outcome_value "640" + outcome_unit "KB"; the pair must still match.
    assert numbers_in_source(DraftFact(description="cut bundle to 640 KB", outcome_value="640", outcome_unit="KB",
                                       source_span="x"), source)
    assert suggested_level("Led") == 3 and suggested_level("Did") is None


def row(desc, owner, start, tools=(), outcome=None):
    v = SimpleNamespace(id=uuid.uuid4(), description=desc, tools=[{"raw": t} for t in tools], outcome_value=outcome)
    f = SimpleNamespace(experience_id=owner, project_id=None, education_id=None, created_at=start)
    exp = SimpleNamespace(title="Engineer", employer="Acme", start_month=start)
    return FactRow(f, v, exp, None)


def test_evidence_pack_ranks_caps_and_redacts():
    owner = uuid.uuid4()
    rows = [row("Wrote docs; mail me at a@b.com", owner, date(2020, 1, 1)),
            row("Built GraphQL APIs", owner, date(2019, 1, 1), tools=["GraphQL"])]
    pack = evidence_pack(rows, "GraphQL", 4000)
    assert pack[0]["text"] == "Built GraphQL APIs"
    assert "a@b.com" not in pack[1]["text"] and "⟦EMAIL_1⟧" in pack[1]["text"]
    assert len(evidence_pack(rows, "GraphQL", 40)) == 1


def test_select_facts_budget_per_role():
    owner = uuid.uuid4()
    rows = [row(f"Fact {i}", owner, date(2020, 1, 1)) for i in range(MAX_PER_ROLE + 3)]
    assert len(select_facts(rows, "")) == MAX_PER_ROLE


TASK = Claimed(uuid.uuid4(), uuid.uuid4(), "match", {}, 1, "k")


def test_cost_per_tier_and_cache_hits_are_free():
    rec = CallRecord("job_extract", "fast-model", "v", 1, tokens_in=1_000_000, tokens_out=1_000_000)
    assert llm.cost_usd(rec) == pytest.approx(0.30 + 2.50)
    assert llm.cost_usd(CallRecord("resume_write", "w", "v", 1, tokens_in=1_000_000)) == pytest.approx(0.75)
    assert llm.cost_usd(CallRecord("job_extract", "f", "v", 1, tokens_in=10**6, cache_hit=True)) == 0


@pytest.fixture
def runner(monkeypatch):
    persisted = []
    monkeypatch.setattr(llm, "_persist", lambda db, task, records: persisted.extend(records))
    monkeypatch.setattr(llm, "spent_today", lambda db: 0.0)

    def use(replies):
        fake = FakeLLM(replies)
        monkeypatch.setattr(llm, "GATEWAY", Gateway(fake, MODELS, sleep=lambda s: None))
        return fake

    return SimpleNamespace(use=use, persisted=persisted)


def test_spend_cap_defers_without_calling_the_provider(runner, monkeypatch):
    fake = runner.use([{"candidate_id": None}])
    monkeypatch.setattr(llm, "spent_today", lambda db: 5.0)
    with pytest.raises(Deferred) as e:
        llm.run(None, TASK, "taxonomy_pick", {"term": "x"})
    assert e.value.delay_s > 0 and "budget" in str(e.value) and fake.requests == []


def test_refusal_and_validation_become_task_errors_and_calls_are_kept(runner):
    runner.use([ProviderResponse(text="", refused=True)])
    with pytest.raises(TaskError) as e:
        llm.run(None, TASK, "taxonomy_pick", {"term": "x"})
    assert (e.value.code, e.value.retry) == ("MODEL_REFUSED", False)
    runner.use(['{"bad": 1}', '{"bad": 2}'])
    with pytest.raises(TaskError) as e:
        llm.run(None, TASK, "taxonomy_pick", {"term": "x"})
    assert not e.value.retry
    assert [r.error_class for r in runner.persisted] == [ErrorClass.MODEL_REFUSED, ErrorClass.VALIDATION,
                                                         ErrorClass.VALIDATION]


def test_success_persists_records(runner):
    runner.use([{"candidate_id": "S-1"}])
    assert llm.run(None, TASK, "taxonomy_pick", {"term": "x"}).output.candidate_id == "S-1"
    assert len(runner.persisted) == 1 and runner.persisted[0].error_class is None


def test_year_only_dates_kept_for_education_only():
    assert dates("2015", "2019", year_ok=True) == (date(2015, 1, 1), date(2019, 1, 1))
    assert dates("2015", "2019") == (None, None)  # a role's month is never invented


def test_close_the_gap_question_is_worded_by_requirement_kind():
    from app.truth.verdict import Requirement

    def ask(category, gate="none", label="B.Tech in Computer Science"):
        return enrichment([Requirement("r1", "required", gate, "no_evidence_recorded", label)], {"r1": category})

    assert ask("education").startswith("Do you have B.Tech in Computer Science, or something equivalent?")
    assert ask("credential", label="AWS Solutions Architect").startswith("Do you hold AWS Solutions Architect?")
    assert ask("other", gate="credential", label="CA licence").startswith("Do you hold CA licence?")
    assert ask("experience", label="5+ years of backend work").startswith("Where have you done this: 5+ years")
    assert ask("skill", label="GraphQL").startswith("Have you used GraphQL anywhere")
    assert "Have you used B.Tech" not in ask("education")


def test_tailor_restores_placeholders_and_blocks_unknown_ones(runner):
    # HANDOFF §8.3: resume lines must never show ⟦NAME_1⟧; the verifier must never see the real name.
    r = row("Priya cut checkout load time 40%; mail priya@x.com", uuid.uuid4(), date(2020, 1, 1))
    r.version.responsibility_level = r.version.completion = r.experience.end_month = None
    mapping: dict[str, str] = {}
    mf = model_fact(r, ["Priya"], mapping)
    assert "Priya" not in mf["text"] and "priya@x.com" not in mf["text"]
    fid = mf["id"]
    fake = runner.use([{"results": [{"statement_index": 0, "supported": True}]}])
    written = [WrittenStatement(type="candidate_fact", text="⟦NAME_1⟧ cut checkout load time 40%",
                                cited_fact_version_ids=[fid]),
               WrittenStatement(type="candidate_fact", text="Cut checkout load time 40% for ⟦NAME_7⟧",
                                cited_fact_version_ids=[fid])]
    stmts, ok = _validate(SimpleNamespace(scalars=lambda q: []), TASK, written, {fid: check_fact(r)}, {fid: mf}, mapping)
    assert ok and stmts[0]["text"] == "Priya cut checkout load time 40%" and stmts[0]["status"] == "passed"
    assert stmts[1]["status"] == "blocked" and "placeholder" in stmts[1]["reasons"][0]
    sent = fake.requests[0].user
    assert "Priya" not in sent and "priya@x.com" not in sent and json.dumps("⟦NAME_1⟧ cut checkout")[1:-1] in sent


def test_match_reason_placeholders_restored_or_dropped():
    assert _restored("⟦NAME_1⟧ led the rewrite", {"⟦NAME_1⟧": "Priya"}) == "Priya led the rewrite"
    assert _restored("⟦NAME_2⟧ led it", {"⟦NAME_1⟧": "Priya"}) == ""
