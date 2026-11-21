"""Usage reservation (TRD §11.1, CEO D19), confirmation (TRD §5.2), paste (CEO D28), idempotency."""

import threading
from datetime import UTC, datetime

import pytest
from sqlalchemy import text

from app.core import usage
from app.core.errors import ApiError
from tests.db.conftest import JD, as_user, export_data

pytestmark = pytest.mark.db


def set_used(pg, user_id, metric, used):
    with pg.superuser.begin() as c:
        c.execute(
            text("INSERT INTO usage_counters (id, user_id, metric, period, used) VALUES (gen_random_uuid(), :u, :m, :p, :n)"),
            {"u": user_id, "m": metric, "p": datetime.now(UTC).strftime("%Y-%m"), "n": used},
        )


def counter(alice, metric):
    return alice.get("/v1/usage").json()["metrics"][metric]


def test_reservation_race_at_9_of_10(pg, alice):
    set_used(pg, alice.id, "tailored_resume", 9)
    results, barrier = [], threading.Barrier(10)

    def attempt():
        with as_user(pg.app, alice.id) as db:
            barrier.wait()
            try:
                results.append(usage.reserve(db, alice.id, "tailored_resume") is not None)
            except ApiError as e:
                assert e.code == "PLAN_LIMIT_REACHED"
                results.append(False)

    threads = [threading.Thread(target=attempt) for _ in range(10)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    assert results.count(True) == 1
    assert counter(alice, "tailored_resume") == {"used": 9, "reserved": 1, "limit": 10}


def test_reserve_convert_release_and_expiry(pg, alice):
    with as_user(pg.app, alice.id) as db:
        first = usage.reserve(db, alice.id, "deep_match", subject="jv-1")
        assert usage.reserve(db, alice.id, "deep_match", subject="jv-1") is None  # same job version: free
        assert usage.convert(db, first) and not usage.convert(db, first)  # idempotent
        refund = usage.reserve(db, alice.id, "deep_match", subject="jv-2")
        assert usage.release(db, refund)  # insufficient detail -> refunded
        usage.reserve(db, alice.id, "deep_match", subject="jv-3")
    assert counter(alice, "deep_match") == {"used": 1, "reserved": 1, "limit": 30}
    with pg.superuser.begin() as c:
        c.execute(text("UPDATE usage_reservations SET created_at = now() - interval '2 hours' WHERE state = 'reserved'"))
    assert counter(alice, "deep_match") == {"used": 1, "reserved": 0, "limit": 30}


def test_confirm_requires_level_and_increments_profile_version(alice):
    exp = alice.write("POST", "/v1/experiences", {"employer": "Acme", "title": "Engineer"}).json()
    fact = alice.write("POST", "/v1/facts", {"owner_type": "experience", "owner_id": exp["id"], "description": "Led migration",
                                             "responsibility_level": 3}).json()
    assert fact["profile_version"] == 0

    r = alice.write("POST", f"/v1/facts/{fact['id']}/confirm", {"version": 1})
    assert r.json()["error"]["code"] == "RESPONSIBILITY_LEVEL_REQUIRED"
    r = alice.write("POST", f"/v1/facts/{fact['id']}/confirm", {"version": 99, "responsibility_level": 3})
    assert r.status_code == 409 and r.json()["error"]["code"] == "VERSION_CONFLICT"

    confirmed = alice.write("POST", f"/v1/facts/{fact['id']}/confirm", {"version": 1, "responsibility_level": 2}).json()
    assert (confirmed["status"], confirmed["profile_version"], confirmed["responsibility_level"]) == ("confirmed", 1, 2)
    assert confirmed["current_version"] == 2  # changing the suggested level is an edit -> new fact_version

    edited = alice.write("PATCH", f"/v1/facts/{fact['id']}", {"version": confirmed["version"], "description": "Led DB migration",
                                                              "change_kind": "correction"}).json()
    assert (edited["current_version"], edited["profile_version"], edited["change_kind"]) == (3, 2, "correction")
    assert alice.get("/v1/profile").json()["profileVersion"] == 2


def test_url_only_paste_rejected_with_no_quota_used(alice):
    r = alice.write("POST", "/v1/jobs/paste", {"text": "  https://careers.example.com/jobs/123  "})
    assert r.status_code == 422 and r.json()["error"]["code"] == "URL_ONLY_PASTE"
    assert counter(alice, "deep_match") == {"used": 0, "reserved": 0, "limit": 30}


def test_short_paste_rejected_before_any_reservation(alice):
    r = alice.write("POST", "/v1/jobs/paste", {"text": "React developer"})
    assert r.status_code == 422 and r.json()["error"]["code"] == "PASTE_TOO_SHORT"
    assert r.json()["error"]["details"]["min_chars"] == 200
    assert counter(alice, "deep_match") == {"used": 0, "reserved": 0, "limit": 30}
    assert export_data(alice)["data"]["jobs"] == []


def test_me_contact_details_saved_and_used_in_exports(pg, alice):
    from types import SimpleNamespace

    from app.db.models import User
    from app.tasks.exports import resume_doc
    from tests.db.conftest import as_user

    r = alice.write("PATCH", "/v1/me", {"email": "rohan@example.com", "phone": "+91 98765 43210", "location": "Pune"})
    assert r.status_code == 200 and (r.json()["email"], r.json()["phone"]) == ("rohan@example.com", "+91 98765 43210")
    assert alice.write("PATCH", "/v1/me", {"email": "not-an-email"}).status_code == 422
    prof = alice.get("/v1/profile").json()
    assert (prof["email"], prof["phone"]) == ("rohan@example.com", "+91 98765 43210")
    with as_user(pg.app, alice.id) as db:
        doc = resume_doc(db, db.get(User, alice.id), SimpleNamespace(statements=[]))
    assert doc["contact"] == ["Pune", "rohan@example.com", "+91 98765 43210"]

    # Profile links from the resume header go on the contact line too, de-duplicated; junk is refused.
    assert alice.write("PATCH", "/v1/me", {"links": ["github.com/rohan", "github.com/rohan", "linkedin.com/in/rohan"]}).status_code == 200
    assert alice.get("/v1/profile").json()["links"] == ["github.com/rohan", "linkedin.com/in/rohan"]
    assert alice.write("PATCH", "/v1/me", {"links": ["<script>"]}).status_code == 422
    with as_user(pg.app, alice.id) as db:
        doc = resume_doc(db, db.get(User, alice.id), SimpleNamespace(statements=[]))
    assert doc["contact"][-2:] == ["github.com/rohan", "linkedin.com/in/rohan"]


def test_paste_reserves_quota_and_enqueues_match(alice):
    r = alice.write("POST", "/v1/jobs/paste", {"text": JD})
    assert r.status_code == 202
    op = alice.get(f"/v1/tasks/{r.json()['operation']['id']}").json()
    assert (op["type"], op["state"]) == ("match", "queued")
    assert counter(alice, "deep_match")["reserved"] == 1


def test_paste_blocked_at_limit(pg, alice):
    set_used(pg, alice.id, "deep_match", 30)
    r = alice.write("POST", "/v1/jobs/paste", {"text": JD})
    assert r.json()["error"]["code"] == "PLAN_LIMIT_REACHED"
    assert export_data(alice)["data"]["jobs"] == []  # nothing left behind


def test_idempotency_replay_and_conflict(alice):
    first = alice.write("POST", "/v1/experiences", {"employer": "Acme"}, key="k1")
    again = alice.write("POST", "/v1/experiences", {"employer": "Acme"}, key="k1")
    assert again.json() == first.json() and again.headers["idempotent-replayed"] == "true"
    clash = alice.write("POST", "/v1/experiences", {"employer": "Other"}, key="k1")
    assert clash.status_code == 409 and clash.json()["error"]["code"] == "IDEMPOTENCY_CONFLICT"
    assert len(alice.get("/v1/experiences").json()["items"]) == 1


def test_match_page_answer_saves_an_unconfirmed_draft_under_a_confirmed_role(alice):
    """The match page's "Save as draft fact" body: POST /v1/facts {owner_type, owner_id, description}."""
    exp = alice.write("POST", "/v1/experiences", {"employer": "Northwind", "title": "Engineer"}).json()
    alice.write("POST", f"/v1/experiences/{exp['id']}/confirm", {"version": 1})
    pv = alice.get("/v1/profile").json()["profileVersion"]
    r = alice.write("POST", "/v1/facts", {"owner_type": "experience", "owner_id": exp["id"],
                                         "description": "Built an internal dashboard with Apollo Client"})
    assert r.status_code == 201 and r.json()["status"] == "draft"
    p = alice.get("/v1/profile").json()
    assert p["drafts"] == 1 and p["confirmed"] == 0 and p["profileVersion"] == pv  # counts nowhere yet
    [group] = p["draftGroups"]
    assert group["experienceId"] == exp["id"] and group["drafts"][0]["text"].startswith("Built an internal")
