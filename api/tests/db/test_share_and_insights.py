"""Shareable resume link (PRD §7) and the skills insight view (PRD §6.4). FakeLLM only."""

import hashlib
import secrets

import pytest
from sqlalchemy import func, select, text

from app.db.models import ShareLink
from app.tasks.worker import run_once
from tests.db.conftest import as_user
from tests.db.test_contract import master_resume
from tests.db.test_pipeline import JOB, count, fake, paste

pytestmark = pytest.mark.db


def public(client, token, ip="203.0.113.7"):
    return client.get(f"/v1/shared/{token}", headers={"X-Forwarded-For": ip})


def test_share_link_consent_contact_rotation_and_revocation(pg, client, alice, bob, monkeypatch):
    rid = master_resume(pg, alice, monkeypatch)
    alice.write("PATCH", "/v1/me", {"name": "Rohan Iyer", "email": "rohan@example.com", "phone": "+91 98765 43210",
                                    "location": "Bengaluru"})
    path = f"/v1/resumes/{rid}/share"
    got = alice.get(path).json()
    assert got["link"] is None and "until you turn the link off" in got["consentText"]
    assert alice.write("POST", path, {"contact": ["email"]}).status_code == 422  # consent is required
    assert alice.write("POST", path, {"consent": False}).status_code == 422
    assert alice.write("POST", path, {"consent": True, "contact": ["address"]}).status_code == 422

    r = alice.write("POST", path, {"consent": True, "contact": ["phone", "email"]})
    assert r.status_code == 201
    token, link = r.json()["token"], r.json()["link"]
    assert len(token) == 43 and link["contact"] == ["email", "phone"] and link["created"]
    assert alice.get(path).json()["link"] == link and "token" not in alice.get(path).json()
    # Only the hash is at rest: not in the link row, not in the stored idempotent response.
    assert count(pg, "SELECT token_hash FROM share_links") == hashlib.sha256(token.encode()).hexdigest()
    assert count(pg, "SELECT count(*) FROM idempotency_keys WHERE response::text LIKE :t", t=f"%{token}%") == 0
    assert count(pg, "SELECT consent_text FROM share_links") == got["consentText"]
    assert count(pg, "SELECT count(*) FROM audit_log WHERE action = 'share_link.created'") == 1

    res = public(client, token)  # no credentials
    assert res.status_code == 200 and "noindex" in res.headers["x-robots-tag"]
    assert res.headers["cache-control"] == "no-store"
    v = res.json()
    assert set(v) == {"name", "templateId", "sections", "extras"} and v["name"] == "Rohan Iyer"
    assert v["templateId"] == "classic" and v["extras"]["contact"] == "rohan@example.com · +91 98765 43210"
    assert [line["text"] for s in v["sections"] for line in s["lines"]] == ["Led the checkout migration to React."]
    assert all(set(line) == {"id", "text"} for s in v["sections"] for line in s["lines"])  # no fact ids or statuses

    assert bob.get(path).status_code == 404
    assert bob.write("POST", path, {"consent": True}).status_code == 404
    assert bob.write("DELETE", path).status_code == 404

    # One identical 404 for malformed, unknown and replaced/revoked tokens.
    unknown, malformed = public(client, secrets.token_urlsafe(32)), public(client, "abc")
    assert unknown.status_code == malformed.status_code == 404
    assert unknown.json()["error"]["message"] == malformed.json()["error"]["message"]

    new = alice.write("POST", path, {"consent": True}).json()
    replaced = public(client, token).json()["error"]
    assert (replaced["code"], replaced["message"]) == (unknown.json()["error"]["code"], unknown.json()["error"]["message"])
    assert public(client, new["token"]).json()["extras"]["contact"] == ""  # no contact unless chosen

    assert alice.write("DELETE", path).json()["link"] is None
    assert public(client, new["token"]).status_code == 404 and alice.get(path).json()["link"] is None
    # Revoked rows stay as consent records; RLS hides them from any session without the owner's id.
    assert count(pg, "SELECT count(*) FROM share_links WHERE revoked_at IS NOT NULL") == 2
    with as_user(pg.app, None) as db:
        db.execute(text("SELECT set_config('app.share_token', :h, true)"),
                   {"h": hashlib.sha256(new["token"].encode()).hexdigest()})
        assert db.scalar(select(func.count()).select_from(ShareLink)) == 0

    last = alice.write("POST", path, {"consent": True}).json()["token"]
    assert public(client, last).status_code == 200
    alice.write("POST", "/v1/me/delete")
    assert public(client, last).status_code == 404  # access ends with the account


def test_public_share_route_is_rate_limited_per_client(client):
    for _ in range(30):
        assert public(client, "abc", ip="198.51.100.9").status_code == 404
    assert public(client, "abc", ip="198.51.100.9").status_code == 429
    assert public(client, "abc", ip="198.51.100.10").status_code == 404


def analysed_job(pg, api, monkeypatch):
    fake(monkeypatch, [JOB])  # no confirmed facts: nothing to map, every requirement has no evidence
    job_id = paste(api)
    assert run_once(pg.worker)
    return job_id


def test_skills_insight_counts_recurring_gaps(pg, alice, bob, monkeypatch):
    empty = {"jobs": 0, "minJobs": 3, "learn": [], "record": []}
    assert alice.get("/v1/insights/skills").json() == empty
    first = analysed_job(pg, alice, monkeypatch)
    analysed_job(pg, alice, monkeypatch)
    assert alice.get("/v1/insights/skills").json() == {**empty, "jobs": 2}  # too few jobs for a pattern
    third = analysed_job(pg, alice, monkeypatch)

    got = alice.get("/v1/insights/skills").json()
    assert got["jobs"] == 3 and got["learn"] == []
    assert got["record"] == [{"label": x, "jobs": 3, "required": r} for x, r in
                             [("GraphQL", 3), ("React", 3), ("Rust", 3), ("Jest", 0), ("Kubernetes", 0)]]

    # "I don't have this" on one job applies to every job asking for it: it moves to what to learn.
    rust = next(r for r in alice.get(f"/v1/jobs/{first}/match").json()["requirements"] if r["text"] == "Rust")
    alice.write("POST", f"/v1/jobs/{first}/requirements/{rust['id']}/gap", {"confirmed": True})
    got = alice.get("/v1/insights/skills").json()
    assert got["learn"] == [{"label": "Rust", "jobs": 3, "required": 3}]
    assert "Rust" not in [g["label"] for g in got["record"]]

    alice.write("PATCH", f"/v1/jobs/{third}", {"status": "not_interested"})
    assert alice.get("/v1/insights/skills").json() == {**empty, "jobs": 2}
    assert bob.get("/v1/insights/skills").json() == empty
