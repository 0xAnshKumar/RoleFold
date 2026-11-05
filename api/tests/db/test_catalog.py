"""Catalog ingestion, the feed, opening a full check (plan accounting) and email alerts, on real Postgres."""

import json
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import text
from sqlalchemy.exc import DBAPIError
from sqlalchemy.orm import Session

from app.catalog import alerts
from app.catalog.ingest import run_source
from app.catalog.sources import Record, Source
from app.core.config import get_settings
from app.tasks.worker import run_once
from tests.db.test_pipeline import JOB, count, fake, task_row, usage_of

pytestmark = pytest.mark.db

FEED_ITEM_KEYS = {"id", "title", "company", "location", "remote", "employmentType", "applyUrl", "source", "posted",
                  "lastSeen", "saved", "check", "fit", "skills", "goal"}
BODY = ("You will build our merchant dashboard with React and TypeScript, write tests with Jest, and consume GraphQL "
        "APIs. You care about web performance and accessibility. We ship small changes often and review each "
        "other's code. The team is spread across Bengaluru and Pune.")


class FakeSource(Source):
    def __init__(self, records, key="greenhouse:acme", full_listing=True, fail=False):
        self.key, self.records, self.full_listing, self.fail = key, records, full_listing, fail

    def fetch(self):
        if self.fail:
            raise OSError("connection reset")
        return self.records


def rec(ext, title="Frontend Engineer", company="Acme", body=BODY, url=None, **kw) -> Record:
    return Record(external_id=ext, title=title, company=company, description=f"<p>{body}</p>",
                  apply_url=url or f"https://boards.greenhouse.io/acme/jobs/{ext}", location="Bengaluru", **kw)


def ingest(pg, source) -> dict:
    with Session(pg.worker) as db, db.begin():
        return run_source(db, source)


def rows(pg, sql="SELECT external_id, version, lifecycle, duplicate_of IS NOT NULL, scam_state FROM catalog_jobs "
                  "ORDER BY external_id"):
    with pg.superuser.connect() as c:
        return [tuple(r) for r in c.execute(text(sql)).all()]


def skilled(api, tools=("React", "TypeScript", "Jest", "GraphQL")):
    exp = api.write("POST", "/v1/experiences", {"employer": "Northwind", "title": "Frontend Engineer",
                                               "start_month": "2021-07-01"}).json()
    f = api.write("POST", "/v1/facts", {"owner_type": "experience", "owner_id": exp["id"], "responsibility_level": 2,
                                       "description": "Built the checkout UI", "tools": [{"raw": t} for t in tools]}).json()
    api.write("POST", f"/v1/facts/{f['id']}/confirm", {"version": 1, "responsibility_level": 2})


# ---------------------------------------------------------------- ingestion


def test_ingest_versions_dedupes_flags_and_rejects(pg):
    first = ingest(pg, FakeSource([
        rec("1"),
        rec("2", url="https://boards.greenhouse.io/acme/jobs/1?utm_source=feed"),  # same apply URL as 1
        rec("3", title="Sales Associate", body="Pay a registration fee of Rs 999 to start. " + BODY),
        rec("4", body="Too short."),
    ]))
    assert (first["status"], first["new"], first["duplicates"], first["flagged"], first["rejected"]) == (
        "complete", 3, 1, 1, 1)
    assert rows(pg) == [("1", 1, "active", False, "none"), ("2", 1, "active", True, "none"),
                        ("3", 1, "active", False, "suspected")]

    # Another board lists a near-identical posting for the same company and title: one job, two source refs.
    other = ingest(pg, FakeSource([rec("x9", url="https://jobs.lever.co/acme/x9", body=BODY + " Apply today.")],
                                  key="lever:acme"))
    assert other["duplicates"] == 1

    again = ingest(pg, FakeSource([rec("1", body=BODY + " Hybrid, 3 days a week."), rec("2")]))
    assert (again["updated"], again["unchanged"], again["new"]) == (1, 1, 0)
    assert rows(pg, "SELECT version FROM catalog_jobs WHERE external_id = '1'") == [(2,)]


def test_expiry_needs_complete_runs_over_the_grace_period(pg):
    jobs = [rec(str(i)) for i in range(4)]
    for r in jobs:
        r.apply_url, r.title = None, f"Role {r.external_id}"  # distinct jobs
    ingest(pg, FakeSource(jobs))
    assert ingest(pg, FakeSource([], fail=True))["status"] == "failed"
    assert ingest(pg, FakeSource(jobs[:1]))["status"] == "partial"  # 1 < 4 / 2: nothing expires
    assert rows(pg, "SELECT count(*) FROM catalog_jobs WHERE absent_since IS NOT NULL") == [(0,)]

    assert ingest(pg, FakeSource(jobs[:2]))["status"] == "complete"
    assert rows(pg, "SELECT count(*) FROM catalog_jobs WHERE absent_since IS NOT NULL AND lifecycle = 'active'") == [(2,)]
    with pg.superuser.begin() as c:  # the absence clock started 4 days ago (grace is 3)
        c.execute(text("UPDATE catalog_jobs SET absent_since = now() - interval '4 days' WHERE absent_since IS NOT NULL"))
    assert ingest(pg, FakeSource(jobs[:2]))["expired"] == 2
    assert rows(pg, "SELECT external_id, lifecycle FROM catalog_jobs ORDER BY 1") == [
        ("0", "active"), ("1", "active"), ("2", "expired"), ("3", "expired")]
    assert rows(pg, "SELECT status FROM catalog_source_runs ORDER BY started_at") == [
        ("complete",), ("failed",), ("partial",), ("complete",), ("complete",)]


def test_app_role_reads_the_catalog_but_cannot_write_it(pg, alice):
    ingest(pg, FakeSource([rec("1")]))
    with Session(pg.app) as db, db.begin():
        assert db.scalar(text("SELECT count(*) FROM catalog_jobs")) == 1
    with pytest.raises(DBAPIError, match="permission denied"), Session(pg.app) as db, db.begin():
        db.execute(text("UPDATE catalog_jobs SET scam_state = 'cleared'"))
    with pytest.raises(DBAPIError, match="permission denied"), Session(pg.app) as db, db.begin():
        db.execute(text("SELECT count(*) FROM catalog_source_runs"))


def test_worker_task_runs_only_enabled_sources(pg, tmp_path, monkeypatch):
    f = tmp_path / "jobs.json"
    f.write_text(json.dumps([{"id": "m1", "title": "Staff Nurse", "company": "City Hospital", "description": BODY}]))
    monkeypatch.setenv("CATALOG_SOURCES", f"manual:{f}")
    get_settings.cache_clear()
    try:
        with Session(pg.worker) as db, db.begin():
            assert alerts.tick(db) == {"sources": ["manual:jobs.json"], "digests": 0}
            alerts.tick(db)  # same slot: no second task
        assert count(pg, "SELECT count(*) FROM tasks WHERE type = 'catalog_ingest'") == 1
        assert run_once(pg.worker)
        assert task_row(pg, "catalog_ingest")[5]["new"] == 1
        monkeypatch.setenv("CATALOG_SOURCES", "")  # kill switch: a queued run for a removed source does nothing
        get_settings.cache_clear()
        with pg.superuser.begin() as c:
            c.execute(text("UPDATE tasks SET status = 'queued', run_after = now(), attempts = 0"))
        assert run_once(pg.worker) and task_row(pg, "catalog_ingest")[5]["status"] == "skipped"
    finally:
        get_settings.cache_clear()


# ---------------------------------------------------------------- feed


def test_feed_ranks_by_confirmed_skills_and_feedback_shapes_it(pg, alice, bob):
    ingest(pg, FakeSource([
        rec("fe"),
        rec("chef", title="Head Chef", company="Spice Route", body="Run a busy kitchen. " * 12),
        rec("scam", title="Data Entry", company="QuickCash", body="Share your Aadhaar and bank details. " + BODY),
    ]))
    skilled(alice)
    feed = alice.get("/v1/feed").json()
    assert feed["catalogSize"] == 3 and feed["alerts"] == {"frequency": "off", "hasEmail": False, "dailyAllowed": False}
    items = feed["items"]
    assert [i["title"] for i in items] == ["Frontend Engineer", "Head Chef"]  # the flagged job never shows
    top = items[0]
    assert set(top) == FEED_ITEM_KEYS and top["check"] is None
    assert (top["fit"], top["skills"][:2]) == ("strong", ["GraphQL", "Jest"]) and items[1]["fit"] == "little"
    assert "%" not in json.dumps(feed)

    fe = top["id"]
    alice.write("POST", f"/v1/feed/{fe}/feedback", {"action": "dismiss", "reasons": ["Not my field"]})
    assert [i["title"] for i in alice.get("/v1/feed").json()["items"]] == ["Head Chef"]
    assert "Frontend Engineer" in {i["title"] for i in bob.get("/v1/feed").json()["items"]}  # alice's dismissal only
    alice.write("POST", f"/v1/feed/{fe}/feedback", {"action": "save"})
    saved = alice.get("/v1/feed", params={"saved": "true"}).json()["items"]
    assert [(i["id"], i["saved"]) for i in saved] == [(fe, True)]
    assert alice.get("/v1/feed", params={"q": "kitchen"}).json()["items"][0]["title"] == "Head Chef"
    assert alice.get("/v1/feed", params={"remote": "true"}).json()["items"] == []

    # With goals set, a role off them with no skill in common leaves the default feed; a search still finds it.
    alice.write("PUT", "/v1/goals", {"roles": ["Frontend Engineer"], "industries": [], "seniority": ""})
    assert [i["title"] for i in alice.get("/v1/feed").json()["items"]] == ["Frontend Engineer"]
    assert alice.get("/v1/feed", params={"q": "kitchen"}).json()["items"][0]["title"] == "Head Chef"
    # A search shows every listed job that passes the preferences: older than the feed window, or off the goals.
    ingest(pg, FakeSource([rec("fde-old", title="Staff Forward Deployed Engineer", body="Deploy with customers. " * 9),
                           rec("fde-ops", title="Forward Deployed Strategist", body="Own quarterly revenue plans and pricing. " * 6)],
                          key="greenhouse:other", full_listing=False))
    with pg.superuser.begin() as c:
        c.execute(text("UPDATE catalog_jobs SET posted_at = now() - interval '200 days' WHERE external_id = 'fde-old'"))
    assert "Forward" not in json.dumps(alice.get("/v1/feed").json()["items"])
    found = alice.get("/v1/feed", params={"q": "Forward Deployed"}).json()["items"]
    assert sorted(i["title"] for i in found) == ["Forward Deployed Strategist", "Staff Forward Deployed Engineer"]

    # Preferences are hard filters; an unstated location passes.
    alice.write("PUT", "/v1/preferences", {"locations": ["Delhi"], "modes": [], "type": "", "visa": "", "notice": ""})
    assert alice.get("/v1/feed").json()["items"] == []


def test_opening_a_check_counts_once_and_thumbs_feed_ranking(pg, alice, monkeypatch):
    ingest(pg, FakeSource([rec("fe", body="Senior Frontend Engineer\nKestrel Pay\n" + BODY)]))
    skilled(alice)
    fe = alice.get("/v1/feed").json()["items"][0]["id"]
    assert usage_of(alice, "deep_match") == {"used": 0, "reserved": 0, "limit": 30}  # browsing is free

    fake(monkeypatch, [{**JOB, "requirements": JOB["requirements"][:1], "eligibility": []},
                       {"results": [{"requirement_id": "R1", "support": "partial", "cited_fact_version_ids": [],
                                     "reason": ""}]}])
    r = alice.write("POST", f"/v1/feed/{fe}/check")
    assert r.status_code == 202
    job_id = r.json()["job_id"]
    assert usage_of(alice, "deep_match")["reserved"] == 1
    assert run_once(pg.worker) and task_row(pg, "match")[0] == "succeeded"
    assert usage_of(alice, "deep_match") == {"used": 0, "reserved": 0, "limit": 30}  # < 3 requirements: refunded

    again = alice.write("POST", f"/v1/feed/{fe}/check")
    assert again.status_code == 200 and again.json()["job_id"] == job_id  # re-opening is free (D19)
    card = alice.get("/v1/feed").json()["items"][0]
    assert card["check"] == {"jobId": job_id, "verdict": "Not enough detail in this posting", "gaps": 0,
                             "state": "ready"}
    assert alice.get(f"/v1/jobs/{job_id}/match").json()["source"].startswith("From your job feed")

    alice.write("POST", f"/v1/jobs/{job_id}/feedback", {"action": "assessment_right"})
    learned = alice.get("/v1/feed").json()["learned"]
    assert {"kind": "company", "label": "acme", "direction": "more"} in learned
    assert alice.write("POST", "/v1/feed/signals/reset").status_code == 200
    assert alice.get("/v1/feed").json()["learned"] == []


def test_check_respects_the_plan_limit(pg, alice):
    from tests.db.test_usage_and_profile import set_used

    ingest(pg, FakeSource([rec("fe")]))
    fe = alice.get("/v1/feed").json()["items"][0]["id"]
    set_used(pg, alice.id, "deep_match", 30)
    r = alice.write("POST", f"/v1/feed/{fe}/check")
    assert r.status_code == 402 and r.json()["error"]["code"] == "PLAN_LIMIT_REACHED"
    assert count(pg, "SELECT count(*) FROM jobs") == 0


# ---------------------------------------------------------------- alerts


def test_weekly_digest_lists_new_strong_matches_and_unsubscribes(pg, alice, client, monkeypatch):
    sent = []
    monkeypatch.setattr(alerts, "send", lambda msg: sent.append(msg) or True)
    ingest(pg, FakeSource([rec("fe"), rec("chef", title="Head Chef", company="Spice Route", body="Cook. " * 50)]))
    skilled(alice)
    alice.write("PATCH", "/v1/me", {"email": "rohan@example.com"})
    assert alice.write("PUT", "/v1/feed/settings", {"frequency": "daily"}).status_code == 402  # paid plans only
    assert alice.write("PUT", "/v1/feed/settings", {"frequency": "weekly"}).json()["frequency"] == "weekly"

    with Session(pg.worker) as db, db.begin():
        assert alerts.tick(db)["digests"] == 1
    assert run_once(pg.worker) and task_row(pg, "alert_digest")[5] == {"sent": True, "jobs": 1}
    [msg] = sent
    body = msg.get_content()
    assert "Frontend Engineer" in body and "Head Chef" not in body and msg["To"] == "rohan@example.com"
    assert count(pg, "SELECT count(*) FROM llm_calls") == 0  # no model call per alert
    with Session(pg.worker) as db, db.begin():
        assert alerts.tick(db)["digests"] == 0  # just sent: not due for a week

    token = alerts.unsubscribe_token(alice.id)
    assert client.post("/v1/alerts/unsubscribe", params={"token": token + "x"}).status_code == 400
    assert client.post("/v1/alerts/unsubscribe", params={"token": token}).json() == {"frequency": "off"}
    assert alice.get("/v1/feed").json()["alerts"]["frequency"] == "off"


def test_digest_skips_when_nothing_new(pg, alice, monkeypatch):
    sent = []
    monkeypatch.setattr(alerts, "send", lambda msg: sent.append(msg) or True)
    ingest(pg, FakeSource([rec("fe")]))
    skilled(alice)
    alice.write("PATCH", "/v1/me", {"email": "rohan@example.com"})
    alice.write("PUT", "/v1/feed/settings", {"frequency": "weekly"})
    with pg.superuser.begin() as c:  # the job was there before the last digest
        c.execute(text("UPDATE feed_settings SET last_alert_at = now() - interval '8 days'"))
        c.execute(text("UPDATE catalog_jobs SET first_seen_at = now() - interval '9 days'"))
    with Session(pg.worker) as db, db.begin():
        assert alerts.tick(db, datetime.now(UTC) + timedelta(minutes=1))["digests"] == 1
    assert run_once(pg.worker) and task_row(pg, "alert_digest")[5] == {"sent": False, "jobs": 0}
    assert sent == []
