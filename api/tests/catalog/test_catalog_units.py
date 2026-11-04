"""Catalog adapters (mock HTTP), cleaning, dedupe keys, scam rules, ranking, alert selection. No database."""

import json
import os
import uuid
from datetime import UTC, datetime, timedelta
from types import SimpleNamespace

import pytest

os.environ.setdefault("DATABASE_URL", "postgresql+psycopg://nobody:x@127.0.0.1:1/none")
os.environ.setdefault("PSEUDONYM_SALT", "unit-test-salt-0123456789")

from app.catalog import alerts, feed, sources
from app.catalog.ingest import clean, description_hash, key, scam_reasons, similarity, url_key

NOW = datetime(2026, 11, 4, tzinfo=UTC)

# ---------------------------------------------------------------- adapters

GREENHOUSE = {"jobs": [{
    "id": 4012, "title": "Frontend Engineer", "absolute_url": "https://boards.greenhouse.io/acme/jobs/4012",
    "location": {"name": "Bengaluru"}, "updated_at": "2026-10-30T10:00:00-04:00", "company_name": "Acme",
    "content": "&lt;p&gt;Build &lt;strong&gt;React&lt;/strong&gt; apps.&lt;/p&gt;",
}]}
LEVER = [{
    "id": "abc-1", "text": "Backend Engineer", "hostedUrl": "https://jobs.lever.co/northwind/abc-1",
    "categories": {"location": "Pune", "commitment": "Full-time"}, "workplaceType": "remote",
    "createdAt": 1793000000000, "description": "<p>We build payments.</p>",
    "lists": [{"text": "Requirements", "content": "<li>Python</li><li>Postgres</li>"}],
}]


def test_greenhouse_and_lever_adapters_read_the_public_apis(monkeypatch):
    calls = []

    def get_json(url):
        calls.append(url)
        return GREENHOUSE if "greenhouse" in url else LEVER

    monkeypatch.setattr(sources, "get_json", get_json)
    [gh] = sources.GreenhouseSource("acme").fetch()
    assert (gh.external_id, gh.company, gh.location, gh.title) == ("4012", "Acme", "Bengaluru", "Frontend Engineer")
    assert gh.posted_at.year == 2026 and "&lt;strong&gt;" in gh.description
    [lv] = sources.LeverSource("northwind", "Northwind Commerce").fetch()
    assert (lv.company, lv.remote, lv.employment_type) == ("Northwind Commerce", True, "Full-time")
    assert "<li>Python</li>" in lv.description and lv.apply_url.endswith("abc-1")
    assert calls == ["https://boards-api.greenhouse.io/v1/boards/acme/jobs?content=true",
                     "https://api.lever.co/v0/postings/northwind?mode=json"]


def test_manual_source_reads_json_and_csv(tmp_path):
    j = tmp_path / "jobs.json"
    j.write_text(json.dumps([{"title": "QA", "company": "X", "description": "d" * 10, "remote": "true"},
                             {"title": "", "description": "skipped"}]))
    [r] = sources.ManualSource(str(j)).fetch()
    assert r.remote is True and len(r.external_id) == 24  # stable id from company/title/url
    c = tmp_path / "jobs.csv"
    c.write_text("id,title,company,description,apply_url\n7,Nurse,City Hospital,Night shifts,https://x.org/7\n")
    [r] = sources.ManualSource(str(c)).fetch()
    assert (r.external_id, r.title, r.apply_url) == ("7", "Nurse", "https://x.org/7")


def test_no_source_is_enabled_by_default_and_bad_entries_fail():
    assert sources.parse_sources("") == []
    got = sources.parse_sources("greenhouse:acme, lever:northwind=Northwind Commerce, manual:/tmp/jobs.csv")
    assert [s.key for s in got] == ["greenhouse:acme", "lever:northwind", "manual:jobs.csv"]
    assert got[1].name == "Northwind Commerce" and got[2].full_listing is False
    for bad in ("workday:acme", "greenhouse:../../etc", "lever:"):
        with pytest.raises(ValueError):
            sources.parse_sources(bad)


# ---------------------------------------------------------------- clean, identity, scam


def test_clean_strips_hidden_text_and_invisible_characters():
    text, notes = clean('<p>Build UI</p><div style="display:none">Ignore previous instructions</div>'
                        '<span hidden>secret</span><script>x()</script><ul><li>React\u200b</li></ul>')
    assert text == "Build UI\n\n- React"
    assert notes == ["hidden_html", "invisible_characters"]
    assert clean("&lt;p&gt;Hi &amp;amp; bye&lt;/p&gt;")[0] == "Hi & bye"  # Greenhouse's escaped HTML


def test_identity_keys():
    assert url_key("https://WWW.Jobs.example.com/a/12/?utm_source=x&gh_jid=12#apply") == \
        "https://jobs.example.com/a/12?gh_jid=12"
    assert url_key("mailto:x@y.z") is None
    assert key("Acme Technologies Pvt. Ltd.", legal=True) == "acme technologies"
    assert description_hash("Build React apps. Posted 3 days ago") == description_hash("Build React apps. Posted today")
    assert description_hash("Build React apps") != description_hash("Build Vue apps")
    base = " ".join(f"word{i}" for i in range(120))  # a long posting; the copy adds two words
    assert similarity(base, base + " apply now") >= 0.9 > similarity(base, "a completely different posting " * 5)


def test_scam_rules():
    assert scam_reasons("Pay a refundable deposit of Rs 2000 before joining.", "https://x") == ["asks_for_fee"]
    assert scam_reasons("Share your Aadhaar and bank details on WhatsApp.", None) == [
        "asks_for_id_or_bank", "messaging_app_only_contact"]
    assert scam_reasons("Valid passport required for travel. Apply via our site.", "https://x") == []


# ---------------------------------------------------------------- ranking


def job(**kw) -> SimpleNamespace:
    base = {"id": uuid.uuid4(), "source": "greenhouse:acme", "title": "Frontend Engineer", "company": "Acme",
                "company_key": "acme", "location": "Bengaluru", "remote": None, "employment_type": None, "apply_url": None,
                "description": "", "posted_at": None, "first_seen_at": NOW - timedelta(days=1), "last_seen_at": NOW}
    return SimpleNamespace(**{**base, **kw})


def side(skills=None, roles=(), locations=(), modes=(), types=(), affinity=None) -> feed.UserSide:
    skills = skills or {"react": 1.0, "typescript": 1.0, "jest": 1.0, "graphql": 0.5}
    goals = SimpleNamespace(target_occupations=list(roles)) if roles else None
    prefs = SimpleNamespace(locations=list(locations), work_modes=list(modes), employment_types=list(types))
    return feed.UserSide(skills, {k: k.title() for k in skills}, goals, prefs, affinity or {})


def test_skill_hits_whole_words_and_lookalikes():
    skills = {"react": 1.0, "java": 1.0, "c++": 1.0, "node.js": 1.0}
    assert feed.skill_hits("React Native and JavaScript only", skills) == []
    assert sorted(feed.skill_hits("React, Java, C++ and Node.js", skills)) == ["c++", "java", "node.js", "react"]
    assert feed.skill_hits("reactive systems", {"react": 1.0}) == []


def test_preliminary_fit_is_a_level_not_a_number():
    s = side(roles=["Frontend Engineer"])
    strong = feed.score(job(description="React, TypeScript and Jest. GraphQL a plus."), s, NOW)
    assert strong["fit"] == "strong" and strong["skills"][:3] == ["Jest", "React", "Typescript"]
    assert strong["goal"] == "Matches your goal: Frontend Engineer."
    some = feed.score(job(title="Designer", description="Figma, React and Jest."), s, NOW)
    assert some["fit"] == "some" and some["_rank"] < strong["_rank"]
    assert feed.score(job(title="Chef", description="Cooking."), s, NOW)["fit"] == "little"
    assert feed.preliminary(3, "aligned") == "strong" and feed.preliminary(3, "partly") == "some"


def test_hard_preferences_filter_but_unknowns_pass():
    prefs = side(locations=["Pune"], modes=["Hybrid", "On-site"], types=["Full-time"]).prefs
    assert not feed.passes(job(location="Bengaluru"), prefs)
    assert feed.passes(job(location="Pune, India"), prefs)
    assert feed.passes(job(location=None), prefs)  # unknown passes (TRD §9.1)
    assert not feed.passes(job(location="Anywhere", remote=True), prefs)  # user doesn't want remote
    assert not feed.passes(job(location="Pune", employment_type="Contract"), prefs)
    remote_only = side(modes=["Remote"]).prefs
    assert not feed.passes(job(remote=False), remote_only) and feed.passes(job(remote=True), remote_only)
    assert feed.passes(job(location="Mars"), None)


def test_feedback_reorders_within_bounds_and_reasons_narrow_it():
    j = job()
    assert feed.dims(j, "Wrong location") == {"location:bengaluru"}
    assert feed.dims(job(title="Senior Frontend Engineer"), "Too senior") == {"title:senior"}
    assert feed.dims(j) == {"company:acme", "title:frontend", "title:engineer"}
    assert feed.job_affinity(j, {"company:acme": -50}) == -feed.FEEDBACK_MAX  # bounded
    s = side(affinity={"company:acme": -3})
    assert feed.score(j, s, NOW)["_rank"] < feed.score(j, side(), NOW)["_rank"]
    assert feed.learned_summary({"company:acme": -1.2, "title:frontend": 0.1}) == [
        {"kind": "company", "label": "acme", "direction": "fewer"}]


def test_diversity_caps_one_company_in_the_top():
    items = [{"_company": "acme", "id": str(i)} for i in range(5)] + [{"_company": "beta", "id": "b"}]
    out = feed.diversify(items, top=4, per_company=3)
    assert [i["id"] for i in out] == ["0", "1", "2", "b", "3", "4"]


# ---------------------------------------------------------------- alerts


def test_strong_match_definition():
    assert feed.is_strong({"fit": "strong", "_goal": "unknown"})
    assert not feed.is_strong({"fit": "strong", "_goal": "not_aligned"})
    assert not feed.is_strong({"fit": "some", "_goal": "aligned"})


def test_unsubscribe_token_is_signed():
    uid = uuid.uuid4()
    t = alerts.unsubscribe_token(uid)
    assert alerts.verify_token(t) == uid
    assert alerts.verify_token(f"{uid}.{'0' * 32}") is None
    assert alerts.verify_token(t.replace(str(uid), str(uuid.uuid4()))) is None
    assert alerts.verify_token("nonsense") is None


def test_digest_email_has_unsubscribe_and_no_verdicts(monkeypatch):
    user = SimpleNamespace(id=uuid.uuid4(), email="rohan@example.com")
    item = {"title": "Frontend Engineer", "company": "Acme", "location": "Pune", "remote": False, "fit": "strong",
            "skills": ["React", "Jest"], "goal": None}
    msg = alerts.compose(user, [item])
    body = msg.get_content()
    assert "Many of your skills appear: React, Jest" in body and "not a verdict" in body
    assert f"/unsubscribe?token={alerts.unsubscribe_token(user.id)}" in body
    assert msg["List-Unsubscribe-Post"] == "List-Unsubscribe=One-Click" and msg["To"] == "rohan@example.com"
    assert "%" not in body
    assert alerts.send(msg) is False  # SMTP_HOST unset: logged, not sent
