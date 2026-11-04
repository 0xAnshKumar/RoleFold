"""Live Gemini smoke test: one real call per pipeline task, through build_gateway() and api/.env.

Opt-in only (it costs money and needs GEMINI_API_KEY): run from api/ with
    RUN_LIVE_LLM=1 uv run pytest tests/live -s
All input is fictional: no real person, contact detail or employer.
"""

import os

import pytest

pytestmark = [
    pytest.mark.live,
    pytest.mark.skipif(os.environ.get("RUN_LIVE_LLM") != "1", reason="live Gemini test; set RUN_LIVE_LLM=1"),
]

JOB = """Backend Engineer, Quillfeather Labs (fictional)
Bengaluru, hybrid. Full-time.

Requirements:
- 3+ years building web services in Python
- Experience with PostgreSQL schema design
- Must have written automated tests for production code

Nice to have:
- Familiarity with message queues such as RabbitMQ

Visa sponsorship is not available for this role; you must already have the right to work in India.
"""
RESUME = """Software Engineer, Tamarind Works (fictional), Jun 2020 - Present
- Built Python billing services handling 40,000 invoices a month

Career break, Mar 2019 - May 2020: Caring for a family member

Achievements
- Winner, Kestrel Hack Night 2022 (fictional)

Publications
- "Ledgers without tears", Quillfeather Engineering Blog, 2023 (fictional)
"""
FACTS = [
    {"id": "fv-1", "text": "Built Python billing services handling 40,000 invoices a month", "tools": ["Python"],
     "responsibility_level": 2, "completion": "completed", "employer": "Tamarind Works", "title": "Software Engineer",
     "start": "2020-06", "end": None},
    {"id": "fv-2", "text": "Designed the PostgreSQL schema for the invoice ledger", "tools": ["PostgreSQL"],
     "responsibility_level": 3, "completion": "completed", "employer": "Tamarind Works", "title": "Software Engineer",
     "start": "2020-06", "end": None},
]


def test_one_call_per_task(monkeypatch):
    os.environ.setdefault("DATABASE_URL", "postgresql+psycopg://nobody:x@127.0.0.1:1/none")  # prices only
    os.environ.setdefault("PSEUDONYM_SALT", "live-test-salt-0123456789")
    from app.llm.gateway import build_gateway
    from app.tasks.llm import cost_usd

    gw = build_gateway()
    raw = []
    models = gw.provider._client.models
    real = models.generate_content
    monkeypatch.setattr(models, "generate_content", lambda **kw: raw.append(real(**kw)) or raw[-1])

    calls = []

    def run(name, data, untrusted_text=None):
        res = gw.run(name, data, untrusted_text)
        calls.extend(res.calls)
        r, rec = raw[-1], res.calls[-1]
        u = r.usage_metadata
        assert rec.tokens_out > 0, name
        assert rec.tokens_out == (u.candidates_token_count or 0) + (u.thoughts_token_count or 0), name  # thinking counted
        return res.output

    resume = run("resume_extract", {}, untrusted_text=RESUME)
    print("\nresume_extract:", resume.achievements, resume.career_breaks)
    assert {a.kind for a in resume.achievements} == {"achievement", "publication"}
    assert [(b.start, b.end) for b in resume.career_breaks] == [("2019-03", "2020-05")]

    job = run("job_extract", {}, untrusted_text=JOB)
    assert job.requirements, "no requirements extracted"
    print("eligibility:", [(e.field, e.value) for e in job.eligibility])
    assert all(len(e.value or "") <= 40 for e in job.eligibility), "eligibility value is a whole sentence"
    reqs = [{"id": f"R{i}", "value": r.skill_text, "category": r.category, "quote": None if r.skill_text else r.quote}
            for i, r in enumerate(job.requirements, 1)]
    pack = [{"id": f["id"], "text": f["text"], "tools": f["tools"], "role": "Software Engineer · Tamarind Works"}
            for f in FACTS]
    mapped = run("requirement_map", {"requirements": reqs, "evidence_pack": pack})
    assert {m.requirement_id for m in mapped.results} <= {r["id"] for r in reqs} and mapped.results
    print("reasons:", [m.reason for m in mapped.results])
    assert not any("candidate" in m.reason.lower() for m in mapped.results), "notes must address the user as you"

    written = run("resume_write", {"facts": FACTS, "target_requirements": [r["value"] for r in reqs if r["value"]],
                                   "target_role": "Backend Engineer",
                                   "style": {"first_person": False, "max_bullet_chars": 220, "summary_statements": 1,
                                             "banned": ["responsible for"]}})
    assert written.statements and all(s.text.strip() for s in written.statements)
    print("statements:", [s.text for s in written.statements])
    assert not any(s.type == "candidate_fact" and "Tamarind Works" in s.text for s in written.statements)
    verified = run("statement_verify", {
        "statements": [{"index": n, "type": s.type, "text": s.text} for n, s in enumerate(written.statements)],
        "facts": FACTS})
    assert verified.results

    total = sum(cost_usd(c) for c in calls)
    print(f"\nlive smoke: {len(calls)} calls, {sum(c.tokens_in for c in calls)} tokens in, "
          f"{sum(c.tokens_out for c in calls)} tokens out (incl. thinking), estimated cost ${total:.5f}")
