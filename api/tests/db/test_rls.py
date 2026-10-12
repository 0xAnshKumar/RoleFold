"""I-6: user B can never read or modify user A's rows; RLS is forced and fail-closed (eng E1)."""

import uuid

import pytest
from sqlalchemy import text
from sqlalchemy.exc import DBAPIError

from app.db.models import RLS_TABLES
from tests.db.conftest import JD, as_user

pytestmark = pytest.mark.db


def test_roles_hardened(pg):
    with pg.superuser.connect() as c:
        owners = set(c.scalars(text("SELECT DISTINCT tableowner FROM pg_tables WHERE schemaname = 'public'")))
        assert not owners & {"hunt_app", "hunt_worker"}
        assert not c.scalar(text("SELECT bool_or(rolbypassrls OR rolsuper) FROM pg_roles WHERE rolname IN ('hunt_app', 'hunt_worker')"))
        rows = c.execute(text("""
            SELECT c.relname, c.relrowsecurity, c.relforcerowsecurity, count(p.*) AS policies
            FROM pg_class c LEFT JOIN pg_policies p ON p.tablename = c.relname
            WHERE c.relnamespace = 'public'::regnamespace AND c.relname = ANY(:t)
            GROUP BY 1, 2, 3
        """), {"t": list(RLS_TABLES)}).all()
    assert len(rows) == len(RLS_TABLES)
    for name, enabled, forced, policies in rows:
        assert enabled and forced and policies >= 4, name


def test_cross_user_reads_and_writes_denied(pg, alice, bob):
    exp = alice.write("POST", "/v1/experiences", {"employer": "Acme"}).json()
    with as_user(pg.app, bob.id) as db:
        assert db.scalar(text("SELECT count(*) FROM experiences")) == 0
        assert db.execute(text("UPDATE experiences SET title = 'x'")).rowcount == 0
        assert db.execute(text("DELETE FROM experiences")).rowcount == 0
    with pytest.raises(DBAPIError, match="row-level security"), as_user(pg.app, bob.id) as db:
        db.execute(text("INSERT INTO experiences (id, user_id) VALUES (gen_random_uuid(), :a)"), {"a": alice.id})
    with pytest.raises(DBAPIError, match="row-level security"), as_user(pg.app, bob.id) as db:
        db.execute(text("INSERT INTO experiences (id, user_id) VALUES (gen_random_uuid(), :b)"), {"b": bob.id})
        db.execute(text("UPDATE experiences SET user_id = :a"), {"a": alice.id})
    assert alice.get(f"/v1/experiences/{exp['id']}").status_code == 200


def test_missing_user_setting_denies(pg, alice):
    alice.write("POST", "/v1/experiences", {"employer": "Acme"})
    with as_user(pg.app, None) as db:
        assert db.scalar(text("SELECT count(*) FROM experiences")) == 0
        assert db.scalar(text("SELECT count(*) FROM users")) == 0
    with pytest.raises(DBAPIError, match="row-level security"), as_user(pg.app, None) as db:
        db.execute(text("INSERT INTO experiences (id, user_id) VALUES (gen_random_uuid(), :a)"), {"a": alice.id})


def test_job_rows_must_be_owned_by_current_user(pg, alice, bob):
    for owner in (None, alice.id):
        with pytest.raises(DBAPIError), as_user(pg.app, bob.id) as db:
            db.execute(text("INSERT INTO jobs (id, owner_user_id) VALUES (gen_random_uuid(), :o)"), {"o": owner})


def test_snapshots_and_system_tables_locked_down(pg, alice):
    with pytest.raises(DBAPIError, match="permission denied"), as_user(pg.app, alice.id) as db:
        db.execute(text("UPDATE resume_versions SET version = 1"))
    with pytest.raises(DBAPIError, match="permission denied"), as_user(pg.app, alice.id) as db:
        db.execute(text("SELECT * FROM audit_log"))


def test_api_routes_hide_other_users_rows(alice, bob):
    exp = alice.write("POST", "/v1/experiences", {"employer": "Acme"}).json()
    fact = alice.write("POST", "/v1/facts", {"owner_type": "experience", "owner_id": exp["id"], "description": "Did X"}).json()
    paste = alice.write("POST", "/v1/jobs/paste", {"text": JD}).json()
    for path in (f"/v1/experiences/{exp['id']}", f"/v1/facts/{fact['id']}", f"/v1/tasks/{paste['operation']['id']}"):
        assert bob.get(path).status_code == 404
    for method, path, body in [
        ("PATCH", f"/v1/experiences/{exp['id']}", {"version": 1, "title": "x"}),
        ("DELETE", f"/v1/experiences/{exp['id']}", {"version": 1}),
        ("POST", f"/v1/experiences/{exp['id']}/confirm", {"version": 1}),
        ("PATCH", f"/v1/facts/{fact['id']}", {"version": 1, "description": "x"}),
        ("POST", f"/v1/facts/{fact['id']}/confirm", {"version": 1, "responsibility_level": 1}),
        ("POST", f"/v1/facts/{fact['id']}/reject", {"version": 1}),
        ("DELETE", f"/v1/facts/{fact['id']}", {"version": 1}),
    ]:
        assert bob.write(method, path, body).status_code == 404, (method, path)
    assert bob.get("/v1/experiences").json()["items"] == []
    assert bob.write("POST", "/v1/facts", {"owner_type": "experience", "owner_id": exp["id"], "description": "x"}).status_code == 404
    assert bob.get("/v1/me/export").json()["data"]["experiences"] == []
    assert uuid.UUID(alice.get(f"/v1/experiences/{exp['id']}").json()["id"])
