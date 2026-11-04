"""Admin console (app/routes/admin.py): admin gate, audited support sessions, DLQ replay, curator queue, stats."""

import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.exc import ProgrammingError
from sqlalchemy.pool import NullPool

from app.core.config import get_settings
from app.tasks.deletion import pseudonym
from app.tasks.worker import run_once
from tests.db.conftest import Api

pytestmark = pytest.mark.db
REASON = "Ticket 42: user can't see their import"


@pytest.fixture
def root(client, monkeypatch):
    monkeypatch.setattr(get_settings(), "admin_subjects", "dev|someone-else, dev|root")
    return Api(client, "root")


def audit(pg, action):
    with pg.superuser.connect() as c:
        return c.execute(text("SELECT actor_id, target, reason FROM audit_log WHERE action = :a"), {"a": action}).all()


def test_only_admins_get_in(root, alice):
    assert alice.get("/v1/admin/stats").status_code == 403
    r = root.get("/v1/admin/stats")
    assert r.status_code == 200 and r.json()["llm_daily_cap_usd"] == get_settings().llm_daily_spend_cap_usd


def test_dlq_replay_needs_reason_and_is_audited(pg, root):
    with pg.superuser.begin() as c:
        tid = c.scalar(text("""INSERT INTO tasks (type, status, idempotency_key, max_attempts, attempts, error_code)
                               VALUES ('render', 'dead', 'k1', 5, 5, 'INTERNAL_ERROR') RETURNING id"""))
    assert [t["id"] for t in root.get("/v1/admin/tasks").json()["items"]] == [str(tid)]
    assert root.write("POST", f"/v1/admin/tasks/{tid}/replay", {"reason": "short"}).status_code == 422
    assert root.write("POST", f"/v1/admin/tasks/{tid}/replay", {"reason": REASON}).status_code == 200
    with pg.superuser.connect() as c:
        assert c.execute(text("SELECT status, attempts, error_code FROM tasks")).one() == ("queued", 0, None)
    assert audit(pg, "admin.task.replay") == [(root.id, f"task:{tid}", REASON)]
    assert root.write("POST", f"/v1/admin/tasks/{tid}/replay", {"reason": REASON}).status_code == 404
    q = root.get("/v1/admin/stats").json()["queues"]
    assert q == [{"type": "render", "queued": 1, "running": 0, "failed": 0, "oldest_queued_seconds": 0}]


def test_support_session_reads_one_user_read_only_and_expires(pg, root, alice, bob):
    alice.write("POST", "/v1/experiences", {"employer": "Acme"})
    bob.write("POST", "/v1/experiences", {"employer": "Globex"})
    assert root.write("POST", "/v1/admin/support", {"user": str(alice.id), "reason": "x"}).status_code == 422
    assert root.write("POST", "/v1/admin/support", {"user": "nobody@example.com", "reason": REASON}).status_code == 404
    s = root.write("POST", "/v1/admin/support", {"user": str(alice.id), "reason": REASON}).json()
    assert s["user_id"] == str(alice.id)

    view = root.get(f"/v1/admin/support/{s['session_id']}").json()
    assert view["user"]["id"] == str(alice.id)
    assert [e["employer"] for e in view["data"]["experiences"]] == ["Acme"]  # RLS: never bob's rows
    assert audit(pg, "admin.support.open") == [(root.id, f"user:{alice.id}", REASON)]
    assert audit(pg, "admin.support.view") == [(root.id, f"user:{alice.id}", f"support session {s['session_id']}")]
    # Not the admin's session -> 404 even for another admin; after the time box -> 404.
    assert alice.get(f"/v1/admin/support/{s['session_id']}").status_code == 403
    with pg.superuser.begin() as c:
        c.execute(text("UPDATE audit_log SET created_at = now() - interval '31 minutes'"))
    assert root.get(f"/v1/admin/support/{s['session_id']}").status_code == 404

    # Deleting the user pseudonymizes the sessions that named them.
    alice.write("POST", "/v1/me/delete")
    while run_once(pg.worker):
        pass
    assert {t for _, t, _ in audit(pg, "admin.support.open")} == {f"user:{pseudonym(alice.id)}"}


def test_hunt_admin_cannot_write_user_data(pg):
    url = pg.superuser.url.set(username="hunt_admin", password="pw")
    with pytest.raises(ProgrammingError, match="permission denied"), create_engine(url, poolclass=NullPool).begin() as c:
        c.execute(text("UPDATE users SET email = 'x'"))


def test_curator_queue_approve_and_reject(pg, root, alice, bob):
    exp = alice.write("POST", "/v1/experiences", {"employer": "Acme"}).json()
    alice.write("POST", "/v1/facts", {"owner_type": "experience", "owner_id": exp["id"], "description": "Ran DBs",
                                      "tools": [{"raw": "Postgres"}, {"raw": "React", "skill_id": "react"}]})
    with pg.superuser.begin() as c:
        c.execute(text("INSERT INTO user_skills (user_id, raw_label) VALUES (:u, ' postgres '), (:u, 'Figma')"),
                  {"u": bob.id})
    items = {i["term_norm"]: (i["uses"], i["users"]) for i in root.get("/v1/admin/taxonomy/queue").json()["items"]}
    assert items == {"postgres": (2, 2), "figma": (1, 1)}

    ok = root.write("POST", "/v1/admin/taxonomy/decisions", {"term": "Postgres", "skill_id": "postgresql",
                                                             "reason": REASON})
    assert ok.status_code == 200 and ok.json()["status"] == "approved"
    root.write("POST", "/v1/admin/taxonomy/decisions", {"term": "FIGMA", "reason": REASON})
    q = root.get("/v1/admin/taxonomy/queue").json()
    assert q["items"] == [] and {d["alias_norm"]: d["skill_id"] for d in q["decided"]} == {
        "postgres": "postgresql", "figma": None}
    assert {(t, r) for _, t, r in audit(pg, "admin.taxonomy.approve")} == {("alias:postgres->postgresql", REASON)}
    assert [t for _, t, _ in audit(pg, "admin.taxonomy.reject")] == ["alias:figma"]
    assert len(root.get("/v1/admin/audit").json()["items"]) == 2


def test_approved_aliases_readable_by_app_and_worker(pg, root):
    from sqlalchemy.orm import Session

    from app.truth.aliases import approved_aliases

    root.write("POST", "/v1/admin/taxonomy/decisions", {"term": "Postgres", "skill_id": "postgresql", "reason": REASON})
    root.write("POST", "/v1/admin/taxonomy/decisions", {"term": "Figma", "reason": REASON})
    for engine in (pg.app, pg.worker):  # imports run as hunt_worker, matches too; both must read aliases
        with Session(engine) as db:
            assert approved_aliases(db, [" POSTGRES ", "figma", "Rust", ""]) == {"postgres": "postgresql"}
