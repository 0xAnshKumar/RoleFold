"""Import, match and tailor handlers end to end through the worker, plus the routes the frontend reads.

FakeLLM only. Response key sets are checked against src/lib/mock.ts.
"""

import pytest
from sqlalchemy import text

from app.llm.gateway import FakeLLM, Gateway, ProviderResponse
from app.tasks import llm
from app.tasks.worker import run_once
from tests.conftest import MODELS
from tests.db.test_usage_and_profile import set_used

pytestmark = pytest.mark.db

MATCH_KEYS = {"id", "title", "company", "source", "verdict", "reasons", "eligibility", "requirements", "goalFit",
              "questions", "enrichment", "profileNote"}
RESUME_KEYS = {"id", "name", "target", "template", "sections"}
RESUME_ITEM_KEYS = {"id", "kind", "name", "target", "template", "updated", "freshness"}
JOB_ITEM_KEYS = {"id", "title", "company", "verdict", "status", "gaps", "added"}
PROFILE_KEYS = {"name", "headline", "location", "confirmed", "drafts", "roles", "skills", "education", "gaps",
                "goals", "prefs"}


def fake(monkeypatch, replies) -> FakeLLM:
    f = FakeLLM(replies)
    monkeypatch.setattr(llm, "GATEWAY", Gateway(f, MODELS, sleep=lambda s: None))
    return f


def task_row(pg, type_):
    with pg.superuser.connect() as c:
        return c.execute(text("SELECT status, attempts, error_code, error_message, payload, result FROM tasks "
                              "WHERE type = :t"), {"t": type_}).one()


def count(pg, sql, **params):
    with pg.superuser.connect() as c:
        return c.scalar(text(sql), params)


def usage_of(api, metric):
    return api.get("/v1/usage").json()["metrics"][metric]


# ---------------------------------------------------------------- import

RESUME = """Rohan Iyer
rohan.iyer@example.com · +91 98765 43210
Frontend Engineer, Northwind Commerce (Jul 2021 – Present)
- Led the checkout migration, cutting the bundle from 1.8 MB to 640 KB
Skills: React
"""
EXTRACT = {
    "experiences": [{
        "employer": "Northwind Commerce", "title": "Frontend Engineer", "start": "2021-07", "end": None,
        "source_span": "Frontend Engineer, Northwind Commerce",
        "facts": [
            {"description": "Led the checkout migration, cutting the bundle from 1.8 MB to 640 KB",
             "source_verb": "Led", "source_span": "Led the checkout migration"},
            {"description": "Grew revenue by 45%", "source_span": "x"},  # number not in the resume
        ],
    }],
    "education": [{"institution": "PES University", "start": "2019-13", "source_span": "PES"}],
    "skills": [{"name": "React", "source_span": "React"}],
}


def test_import_creates_drafts_without_sending_contact_details(pg, alice, monkeypatch):
    llm_fake = fake(monkeypatch, [EXTRACT])
    r = alice.write("POST", "/v1/imports", {"filename": "cv.txt", "size_bytes": 300, "text": RESUME})
    assert r.status_code == 202
    assert run_once(pg.worker)
    status, _, _, _, payload, result = task_row(pg, "import")
    assert status == "succeeded" and "text" not in payload
    assert result["dropped_facts"] == 1
    # What redaction captured is offered back to the user (onboarding pre-fills it to confirm).
    assert result["contact"] == {"name": "Rohan Iyer", "email": "rohan.iyer@example.com", "phone": "+91 98765 43210"}
    sent = llm_fake.requests[0].user
    for secret in ("rohan.iyer@example.com", "98765", "Rohan", "Iyer"):
        assert secret not in sent  # I-10
    assert "UNTRUSTED_DOCUMENT" in sent  # I-4: datamarked

    assert count(pg, "SELECT count(*) FROM facts WHERE status = 'draft' AND origin = 'import'") == 1
    assert count(pg, "SELECT responsibility_level FROM fact_versions") == 3  # suggestion from "Led"
    assert count(pg, "SELECT start_month FROM education") is None  # "2019-13" is unknown, not guessed
    assert count(pg, "SELECT cost > 0 FROM llm_calls WHERE purpose = 'resume_extract'")

    prof = alice.get("/v1/profile").json()
    assert PROFILE_KEYS <= prof.keys()
    [group] = prof["draftGroups"]
    [draft] = group["drafts"]
    assert (draft["numbers"], draft["suggested"]) == (["1.8", "640"], "Led")
    assert group["dates"] == "Jul 2021 – Present" and prof["confirmed"] == 0
    assert prof["drafts"] == 2  # the draft fact and the draft education row both wait for the user


REIMPORT = {**EXTRACT, "education": [
    {"institution": "PES University", "degree": "B.Tech", "start": "2015", "end": "2019", "source_span": "PES"}]}


def test_reimport_merges_instead_of_duplicating_and_keeps_year_dates(pg, alice, monkeypatch):
    fake(monkeypatch, [REIMPORT, {**REIMPORT, "experiences": [{**REIMPORT["experiences"][0], "facts": [
        *REIMPORT["experiences"][0]["facts"],
        {"description": "Built a React design system", "source_verb": "Built", "source_span": "React"}]}],
        "education": [{**REIMPORT["education"][0], "degree": "B.Tech.", "institution": "PES  university"}]}])
    for _ in range(2):
        alice.write("POST", "/v1/imports", {"filename": "cv.txt", "size_bytes": 300, "text": RESUME})
        assert run_once(pg.worker)
    assert count(pg, "SELECT count(*) FROM experiences") == 1
    assert count(pg, "SELECT count(*) FROM education") == 1
    assert count(pg, "SELECT count(*) FROM user_skills") == 1
    # The second import's new fact joins the existing role; the repeated one is not added again.
    assert count(pg, "SELECT count(*) FROM facts") == 2
    assert str(count(pg, "SELECT start_month FROM education")) == "2015-01-01"
    [edu] = alice.get("/v1/profile").json()["education"]
    assert (edu["degree"], edu["dates"], edu["status"]) == ("B.Tech", "2015 – 2019", "draft")


DEGREE_POSTING = """Backend Engineer
Acme Labs, Pune

Requirements:
- B.Tech in Computer Science required
- Strong Python skills required
- PostgreSQL in production required
We build payment tools for small shops across India and care about clear, tested code.
"""
DEGREE_JOB = {"title": "Backend Engineer", "company": "Acme Labs", "requirements": [
    {"quote": "B.Tech in Computer Science required", "category": "education", "importance": "required",
     "skill_text": "B.Tech in Computer Science"},
    {"quote": "Strong Python skills required", "category": "skill", "importance": "required", "skill_text": "Python"},
    {"quote": "PostgreSQL in production required", "category": "skill", "importance": "required",
     "skill_text": "PostgreSQL"},
]}


def test_confirmed_education_is_match_evidence_for_a_degree(pg, alice, monkeypatch):
    fake(monkeypatch, [REIMPORT])
    alice.write("POST", "/v1/imports", {"filename": "cv.txt", "size_bytes": 300, "text": RESUME})
    run_once(pg.worker)
    [edu] = alice.get("/v1/profile").json()["education"]
    r = alice.write("POST", f"/v1/education/{edu['id']}/confirm", {"version": edu["version"]})
    assert r.status_code == 200 and r.json()["status"] == "confirmed" and r.json()["profile_version"] == 1
    assert alice.write("POST", f"/v1/education/{edu['id']}/confirm", {"version": 1}).status_code == 409

    llm_fake = fake(monkeypatch, [DEGREE_JOB, {"results": [
        {"requirement_id": "R1", "support": "supported", "cited_fact_version_ids": [edu["id"]], "reason": "Degree."}]}])
    job_id = alice.write("POST", "/v1/jobs/paste", {"text": DEGREE_POSTING}).json()["job_id"]
    assert run_once(pg.worker)
    assert edu["id"] in llm_fake.requests[1].user  # the degree is in the evidence pack
    m = alice.get(f"/v1/jobs/{job_id}/match").json()
    degree = next(r for r in m["requirements"] if r["text"] == "B.Tech in Computer Science")
    assert degree["status"] == "supported" and degree["note"] == "Your confirmed education: B.Tech, PES University (2015 – 2019)"
    assert m["freshness"] == "current"

    r = alice.write("POST", f"/v1/education/{edu['id']}/reject", {"version": 2})
    assert r.json()["status"] == "rejected"
    assert alice.get("/v1/profile").json()["education"] == []
    assert alice.get(f"/v1/jobs/{job_id}/match").json()["freshness"] == "outdated"


def test_import_refusal_saves_nothing(pg, alice, monkeypatch):
    fake(monkeypatch, [ProviderResponse(text="", refused=True)])
    alice.write("POST", "/v1/imports", {"filename": "cv.txt", "size_bytes": 300, "text": RESUME})
    run_once(pg.worker)
    assert task_row(pg, "import")[:3] == ("failed", 1, "MODEL_REFUSED")
    assert count(pg, "SELECT count(*) FROM experiences") == 0
    assert count(pg, "SELECT error_class FROM llm_calls") == "model_refused"


# ---------------------------------------------------------------- match

POSTING = """Senior Frontend Engineer
Kestrel Pay, Bengaluru

Requirements:
- Deep experience with React and TypeScript in production
- Experience consuming GraphQL APIs
- Comfortable with Jest is a plus
- Rust experience required
Nice to have:
- Kubernetes basics
Notice period: 30 days
"""
JOB = {
    "title": "Senior Frontend Engineer", "company": "Kestrel Pay",
    "requirements": [
        {"quote": "Deep experience with React and TypeScript in production", "category": "skill",
         "importance": "required", "skill_text": "React"},
        {"quote": "Experience consuming GraphQL APIs", "category": "skill", "importance": "required",
         "skill_text": "GraphQL"},
        {"quote": "Comfortable with Jest is a plus", "category": "skill", "importance": "required",
         "skill_text": "Jest"},
        {"quote": "Rust experience required", "category": "skill", "importance": "required", "skill_text": "Rust"},
        {"quote": "Kubernetes basics", "category": "skill", "importance": "required", "skill_text": "Kubernetes"},
        {"quote": "Ten years of Haskell", "category": "skill", "importance": "required"},
    ],
    "eligibility": [
        {"field": "notice_period", "value": "30 days", "quote": "Notice period: 30 days"},
        {"field": "location", "value": "Mars", "quote": "Based on Mars"},
    ],
}


def confirmed_fact(api, description, level, employer="Northwind Commerce", title="Frontend Engineer"):
    exp = api.write("POST", "/v1/experiences", {"employer": employer, "title": title, "start_month": "2021-07-01"}).json()
    f = api.write("POST", "/v1/facts", {"owner_type": "experience", "owner_id": exp["id"], "description": description,
                                       "responsibility_level": level, "tools": [{"raw": "React"}]}).json()
    api.write("POST", f"/v1/facts/{f['id']}/confirm", {"version": 1, "responsibility_level": level})
    return api.get(f"/v1/facts/{f['id']}").json()


def paste(api):
    r = api.write("POST", "/v1/jobs/paste", {"text": POSTING})
    assert r.status_code == 202
    return r.json()["job_id"]


def test_match_happy_path_and_routes(pg, alice, monkeypatch):
    f = confirmed_fact(alice, "Led the checkout migration to React", 3)
    fv = f["fact_version_id"]

    def mapping(_):
        return {"results": [
            {"requirement_id": "R1", "support": "supported", "cited_fact_version_ids": [fv], "reason": "React work."},
            {"requirement_id": "R2", "support": "supported", "cited_fact_version_ids": ["not-in-pack"],
             "reason": "Invented."},
        ]}

    llm_fake = fake(monkeypatch, [JOB, mapping(None)])
    job_id = paste(alice)
    assert usage_of(alice, "deep_match")["reserved"] == 1
    assert run_once(pg.worker)
    assert task_row(pg, "match")[0] == "succeeded"
    assert usage_of(alice, "deep_match") == {"used": 1, "reserved": 0, "limit": 30}

    # Raw job text only in the extraction call; the mapping call gets values and ids.
    assert "UNTRUSTED_DOCUMENT" in llm_fake.requests[0].user
    assert "Comfortable with Jest" not in llm_fake.requests[1].user
    assert count(pg, "SELECT count(*) FROM job_requirements") == 5  # Haskell quote is not in the posting
    importance = dict(pg.superuser.connect().execute(text("SELECT value, importance FROM job_requirements")).all())
    assert importance == {"React": "required", "GraphQL": "required", "Jest": "unknown", "Rust": "required",
                          "Kubernetes": "unknown"}

    m = alice.get(f"/v1/jobs/{job_id}/match").json()
    assert MATCH_KEYS <= m.keys()
    assert (m["title"], m["company"]) == ("Senior Frontend Engineer", "Kestrel Pay")
    reqs = {r["text"]: r for r in m["requirements"]}
    assert reqs["React"]["status"] == "supported" and reqs["React"]["factId"] == f["id"]
    assert reqs["GraphQL"]["status"] == "no_evidence"  # citation outside the evidence pack is dropped
    assert reqs["Jest"]["importance"] == "preferred"
    assert m["verdict"] == "Poor fit"  # 1 of 3 required
    elig = {e["field"]: e for e in m["eligibility"]}
    assert elig["Location"]["status"] == "unknown" and elig["Location"]["quote"] is None
    assert m["freshness"] == "current"

    [item] = alice.get("/v1/jobs").json()["items"]
    assert JOB_ITEM_KEYS <= item.keys() and item["verdict"] == "Poor fit" and item["gaps"] == 2
    assert alice.get(f"/v1/jobs/{job_id}").json()["text"].startswith("Senior Frontend")

    r = alice.write("POST", f"/v1/jobs/{job_id}/feedback", {"action": "assessment_wrong", "reasons": ["Wrong skills"]})
    assert r.status_code == 201
    assert count(pg, "SELECT reason_code FROM job_feedback") == "Wrong skills"

    confirmed_fact(alice, "Built GraphQL APIs", 2)  # new evidence -> mapping is outdated on view
    assert alice.get(f"/v1/jobs/{job_id}/match").json()["freshness"] == "outdated"


def test_match_validation_failure_releases_the_reservation(pg, alice, monkeypatch):
    fake(monkeypatch, ['{"requirements": 1}', '{"requirements": 2}'])
    paste(alice)
    run_once(pg.worker)
    assert task_row(pg, "match")[0] == "failed"
    assert usage_of(alice, "deep_match") == {"used": 0, "reserved": 0, "limit": 30}
    assert count(pg, "SELECT count(*) FROM llm_calls WHERE error_class = 'validation'") == 2


def test_spend_cap_keeps_the_task_queued(pg, alice, monkeypatch):
    llm_fake = fake(monkeypatch, [JOB])
    with pg.superuser.begin() as c:
        c.execute(text("INSERT INTO llm_calls (id, purpose, model, cost) VALUES (gen_random_uuid(), 'x', 'm', 5.01)"))
    paste(alice)
    assert run_once(pg.worker)
    status, attempts, code, message, _, _ = task_row(pg, "match")
    assert (status, attempts, code) == ("queued", 0, "DEPENDENCY_UNAVAILABLE") and "budget" in message
    assert llm_fake.requests == []
    assert usage_of(alice, "deep_match")["reserved"] == 1  # still held for the deferred run
    assert alice.get("/v1/usage").status_code == 200  # reads are never blocked (I-12)

    # Waiting past the reservation TTL does not lose it while the task is still queued.
    with pg.superuser.begin() as c:
        c.execute(text("UPDATE usage_reservations SET created_at = now() - interval '5 hours'"))
    assert usage_of(alice, "deep_match") == {"used": 0, "reserved": 1, "limit": 30}
    with pg.superuser.begin() as c:  # next UTC day: budget available again
        c.execute(text("DELETE FROM llm_calls"))
        c.execute(text("UPDATE tasks SET run_after = now()"))
    assert run_once(pg.worker) and task_row(pg, "match")[0] == "succeeded"
    assert usage_of(alice, "deep_match") == {"used": 1, "reserved": 0, "limit": 30}


# ---------------------------------------------------------------- tailor


def tailor_setup(pg, api):
    """A pasted job whose match task is set aside, and two confirmed facts (one with an email in it)."""
    job_id = paste(api)
    with pg.superuser.begin() as c:
        c.execute(text("UPDATE tasks SET status = 'canceled' WHERE type = 'match'"))
    a = confirmed_fact(api, "Led the checkout migration from AngularJS to React, cutting the bundle from 1.8 MB "
                            "to 640 KB", 3)
    b = confirmed_fact(api, "Wrote Jest unit tests that raised coverage from 35% to 70%; see rohan@example.com", 2)
    return job_id, a["fact_version_id"], b["fact_version_id"]


def test_tailor_happy_path_blocks_and_withholds(pg, alice, monkeypatch):
    job_id, fv1, fv2 = tailor_setup(pg, alice)
    llm_fake = fake(monkeypatch, [
        {"statements": [
            {"type": "candidate_fact", "text": "Led the checkout migration from AngularJS to React, cutting the "
                                               "bundle from 1.8 MB to 640 KB.", "cited_fact_version_ids": [fv1]},
            {"type": "candidate_fact", "text": "Raised test coverage from 35% to 90% with Jest.",
             "cited_fact_version_ids": [fv2]},
            {"type": "summary", "text": "Frontend engineer focused on React.", "cited_fact_version_ids": [fv1]},
        ]},
        {"results": [{"statement_index": 0, "supported": True}, {"statement_index": 1, "supported": True}]},
        {"statements": [{"type": "candidate_fact", "text": "Raised test coverage from 35% to 95%.",
                         "cited_fact_version_ids": [fv2]}]},
    ])
    r = alice.write("POST", f"/v1/jobs/{job_id}/tailored-resume", {"template": "tech"})
    assert r.status_code == 202
    resume_id = r.json()["resume_id"]
    assert r.json()["operation"]["basis"]["fact_version_ids"] == sorted([fv1, fv2])
    assert run_once(pg.worker)
    assert task_row(pg, "tailor")[:4] == ("succeeded", 1, None, None)
    assert usage_of(alice, "tailored_resume") == {"used": 1, "reserved": 0, "limit": 10}

    for req in llm_fake.requests:  # I-10: contact details never reach the provider
        assert "rohan@example.com" not in req.user
    assert "EMAIL_1" in llm_fake.requests[0].user  # placeholder (JSON-escaped brackets)
    assert "problems" in llm_fake.requests[2].user and "isn't in your fact" in llm_fake.requests[2].user

    res = alice.get(f"/v1/resumes/{resume_id}").json()
    assert RESUME_KEYS <= res.keys() and res["template"] == "Compact Tech"
    assert [s["title"] for s in res["sections"]] == ["Summary", "Frontend Engineer"]
    assert [w["id"] for w in res["withheld"]] == ["s2"]
    line = res["sections"][1]["lines"][0]
    assert line["status"] == "passed" and line["factId"] and line["factIds"][0] == line["factId"]
    assert res["sections"][1]["owner"]["type"] == "experience"  # "Save as a new fact" files the edit under it
    # The preview gets the non-line parts (contact, education, skills) from the data the export renders.
    assert {"contact", "education", "skills", "projects", "skillsSummary"} <= res["extras"].keys()
    [item] = alice.get("/v1/resumes").json()["items"]
    assert RESUME_ITEM_KEYS <= item.keys() and item["kind"] == "tailored" and item["freshness"] == "current"
    assert count(pg, "SELECT check_summary->>'blocked' FROM resume_versions") == "1"

    # Edits are re-checked in code, synchronously.
    bad = alice.write("PATCH", f"/v1/resumes/{resume_id}/statements/s1", {"text": "Led a 3 MB cut.", "version": 1})
    assert bad.json()["statement"]["status"] == "blocked"
    good = alice.write("PATCH", f"/v1/resumes/{resume_id}/statements/s2",
                       {"text": "Raised unit-test coverage from 35% to 70% with Jest.", "version": 2})
    assert good.json()["statement"]["status"] == "code_checked_only" and good.json()["resume"]["withheld"][0]["id"] == "s1"
    stale = alice.write("PATCH", f"/v1/resumes/{resume_id}/statements/s2", {"text": "x", "version": 1})
    assert stale.status_code == 409

    # The template picked in the editor is saved on the resume.
    r = alice.write("PATCH", f"/v1/resumes/{resume_id}", {"templateId": "modern"})
    assert r.status_code == 200 and r.json()["templateId"] == "modern"
    assert alice.get("/v1/resumes").json()["items"][0]["template"] == "Modern"
    assert alice.write("PATCH", f"/v1/resumes/{resume_id}", {"templateId": "nope"}).status_code == 422


def test_tailor_limit_hit_is_402_and_enqueues_nothing(pg, alice):
    job_id, _, _ = tailor_setup(pg, alice)
    set_used(pg, alice.id, "tailored_resume", 10)
    r = alice.write("POST", f"/v1/jobs/{job_id}/tailored-resume", {"template": "classic"})
    assert r.status_code == 402 and r.json()["error"]["code"] == "PLAN_LIMIT_REACHED"
    assert count(pg, "SELECT count(*) FROM tasks WHERE type = 'tailor'") == 0


def test_tailor_failure_leaves_nothing_and_releases(pg, alice, monkeypatch):
    job_id, _, _ = tailor_setup(pg, alice)
    fake(monkeypatch, [ProviderResponse(text="", refused=True)])
    alice.write("POST", f"/v1/jobs/{job_id}/tailored-resume")  # no body: the match page sends none
    run_once(pg.worker)
    assert task_row(pg, "tailor")[0] == "failed"
    assert count(pg, "SELECT count(*) FROM resumes") == 0
    assert usage_of(alice, "tailored_resume") == {"used": 0, "reserved": 0, "limit": 10}


def test_master_resume_needs_confirmed_facts_and_templates_list(alice):
    r = alice.write("POST", "/v1/resumes", {"template": "classic", "target": "Frontend roles"})
    assert r.status_code == 422 and r.json()["error"]["code"] == "UNCONFIRMED_ENTRY"
    ids = [t["id"] for t in alice.get("/v1/templates").json()["items"]]
    assert ids == ["classic", "tech", "modern", "campus", "combination", "academic"]
    u = alice.get("/v1/usage").json()
    assert u["tailored"] == {"used": 0, "limit": 10} and u["matches"] == {"used": 0, "limit": 30} and u["resetsOn"]


def test_users_name_never_reaches_the_model_in_match_or_tailor(pg, alice, monkeypatch):
    """I-10: the stored users.name (full name and each token) is redacted from every match and tailor request."""
    alice.write("PATCH", "/v1/me", {"name": "Rohan Iyer"})
    f = confirmed_fact(alice, "Led the checkout migration to React; ROHAN IYER presented it and rohan wrote the docs", 3)
    fv = f["fact_version_id"]
    llm_fake = fake(monkeypatch, [
        JOB,
        {"results": [{"requirement_id": "R1", "support": "supported", "cited_fact_version_ids": [fv], "reason": "x"}]},
        {"statements": [{"type": "candidate_fact", "text": "Led the checkout migration to React.",
                         "cited_fact_version_ids": [fv]}]},
        {"results": [{"statement_index": 0, "supported": True}]},
    ])
    job_id = paste(alice)
    assert run_once(pg.worker) and task_row(pg, "match")[0] == "succeeded"
    alice.write("POST", f"/v1/jobs/{job_id}/tailored-resume", {"template": "classic"})
    assert run_once(pg.worker) and task_row(pg, "tailor")[0] == "succeeded"

    tasks = [r.system for r in llm_fake.requests]
    assert len(llm_fake.requests) == 4, tasks
    assert "NAME_" in llm_fake.requests[1].user and "NAME_" in llm_fake.requests[2].user
    for req in llm_fake.requests:
        assert "rohan" not in req.user.lower() and "iyer" not in req.user.lower()


YEARS_POSTING = """Frontend Engineer
Requirements:
- 3+ years of frontend experience required
- 20+ years of frontend experience required
- React in production required
- 3+ years of Kubernetes required
- 10+ years of TypeScript required
- 3+ years of Vue required
We build payment tools for small shops across India and care about clear, tested code every day.
"""


def test_years_requirements_are_counted_from_role_dates_not_cited_facts(pg, alice, monkeypatch):
    """QA 2026-11-04: "5+ years" was backed by a mentoring fact. Generic experience years come from confirmed role
    dates in code; a skill's years keep the model's cited evidence, with career length only as an upper gate."""
    f = confirmed_fact(alice, "Mentored two junior engineers", 2)  # role from Jul 2021
    fv = f["fact_version_id"]
    [role] = alice.get("/v1/profile").json()["roles"]
    alice.write("POST", f"/v1/experiences/{role['id']}/confirm", {"version": role["version"]})  # years count confirmed roles
    fake(monkeypatch, [
        {"title": "Frontend Engineer", "requirements": [
            {"quote": "3+ years of frontend experience required", "category": "experience", "importance": "required"},
            {"quote": "20+ years of frontend experience required", "category": "experience", "importance": "required"},
            {"quote": "React in production required", "category": "skill", "importance": "required",
             "skill_text": "React"},
            {"quote": "3+ years of Kubernetes required", "category": "skill", "importance": "required"},
            {"quote": "10+ years of TypeScript required", "category": "skill", "importance": "required"},
            {"quote": "3+ years of Vue required", "category": "skill", "importance": "required"}]},
        {"results": [{"requirement_id": r, "support": "supported", "cited_fact_version_ids": [fv],
                      "reason": "The candidate mentored engineers."} for r in ("R1", "R2", "R3", "R4", "R5")]
         + [{"requirement_id": "R6", "support": "no_evidence_recorded", "cited_fact_version_ids": [],
             "reason": "No Vue work in the evidence."}]},
    ])
    job_id = alice.write("POST", "/v1/jobs/paste", {"text": YEARS_POSTING}).json()["job_id"]
    assert run_once(pg.worker) and task_row(pg, "match")[0] == "succeeded"
    reqs = {r["quote"]: r for r in alice.get(f"/v1/jobs/{job_id}/match").json()["requirements"]}
    three, twenty = reqs["3+ years of frontend experience required"], reqs["20+ years of frontend experience required"]
    assert three["status"] == "supported" and "factId" not in three
    assert twenty["status"] == "no_evidence" and "factId" not in twenty
    for r in (three, twenty):
        assert r["note"].startswith("Counted from your confirmed role dates: about ")
    assert reqs["React in production required"]["factId"] == f["id"]  # other requirements keep their citation
    # Skill years: role dates (about 5 years) only cap the model's cited evidence, they never create it.
    kube, ts, vue = (reqs[f"{q} required"] for q in ("3+ years of Kubernetes", "10+ years of TypeScript",
                                                       "3+ years of Vue"))
    assert kube["status"] == "supported" and kube["factId"] == f["id"] and "note" not in kube
    assert ts["status"] == "partial" and ts["factId"] == f["id"] and "under the 10 years asked" in ts["note"]
    assert vue["status"] == "no_evidence" and vue["note"] == "No Vue work in the evidence."
