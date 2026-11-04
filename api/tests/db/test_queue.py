"""TRD §11.1 task queue: SKIP LOCKED claims, lease expiry, dead-lettering, deletion handler."""

import threading

import pytest
from sqlalchemy import text

from app.core.config import get_settings
from app.tasks import queue
from app.tasks.deletion import pseudonym
from app.tasks.worker import run_once
from tests.db.conftest import JD

pytestmark = pytest.mark.db


def add_tasks(pg, n, max_attempts=5):
    with pg.superuser.begin() as c:
        c.execute(text("""
            INSERT INTO tasks (id, type, idempotency_key, max_attempts)
            SELECT gen_random_uuid(), 'race', 'race-' || g, :m FROM generate_series(1, :n) g
        """), {"n": n, "m": max_attempts})


def status(pg):
    with pg.superuser.connect() as c:
        return c.execute(text("SELECT status, attempts FROM tasks")).one()


def test_no_task_handed_out_twice(pg):
    add_tasks(pg, 40)
    claimed, barrier = [], threading.Barrier(8)

    def drain():
        barrier.wait()
        while True:
            with pg.worker.begin() as conn:
                task = queue.claim(conn, ["race"])
            if task is None:
                return
            claimed.append(task.id)

    threads = [threading.Thread(target=drain) for _ in range(8)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    assert len(claimed) == 40 == len(set(claimed))


def test_expired_lease_requeues_then_dead_letters(pg):
    add_tasks(pg, 1, max_attempts=2)
    for expected in ("queued", "dead"):
        with pg.worker.begin() as conn:
            assert queue.claim(conn, ["race"]) is not None
        with pg.superuser.begin() as c:
            c.execute(text("UPDATE tasks SET lease_until = now() - interval '1 second'"))
        with pg.worker.begin() as conn:
            assert queue.requeue_expired(conn) == 1
        assert status(pg)[0] == expected


def test_fail_retries_with_backoff_or_stops(pg):
    add_tasks(pg, 1)
    with pg.worker.begin() as conn:
        task = queue.claim(conn, ["race"])
        queue.fail(conn, task, "MODEL_REFUSED", "refused")
    with pg.superuser.connect() as c:
        assert c.execute(text("SELECT status, run_after > now() FROM tasks")).one() == ("queued", True)
        c.execute(text("UPDATE tasks SET run_after = now()"))
        c.commit()
    with pg.worker.begin() as conn:
        task = queue.claim(conn, ["race"])
        queue.fail(conn, task, "MODEL_REFUSED", "refused", retry=False)
    assert status(pg) == ("failed", 2)


def test_stale_completion_is_rejected(pg):
    add_tasks(pg, 1)
    with pg.worker.begin() as conn:
        first = queue.claim(conn, ["race"])
    with pg.superuser.begin() as c:
        c.execute(text("UPDATE tasks SET lease_until = now() - interval '1 second'"))
    with pg.worker.begin() as conn:
        queue.requeue_expired(conn)
        queue.claim(conn, ["race"])
    with pytest.raises(queue.LeaseLost), pg.worker.begin() as conn:
        queue.complete(conn, first, {"ok": True})


def test_account_deletion_removes_rows_and_pseudonymizes_logs(pg, alice, bob):
    alice.write("POST", "/v1/experiences", {"employer": "Acme"})
    upload = alice.write("POST", "/v1/imports", files={"file": ("cv.txt", b"Engineer at Acme", "text/plain")}).json()
    stored = get_settings().storage_dir / upload["import"]["source_file_key"]
    assert stored.exists()
    alice.write("POST", "/v1/jobs/paste", {"text": JD})
    bob.write("POST", "/v1/experiences", {"employer": "Other"})
    with pg.superuser.begin() as c:
        c.execute(text("INSERT INTO llm_calls (id, user_id, purpose, model) VALUES (gen_random_uuid(), :u, 'x', 'm')"), {"u": alice.id})
    r = alice.write("POST", "/v1/me/delete")
    assert r.status_code == 202
    assert r.json()["removed_on"] < r.json()["backups_purged_by"]  # the two dates settings shows
    assert alice.get("/v1/me").status_code == 403
    while run_once(pg.worker):  # the pasted job's match task runs (and fails: no scripted LLM) first
        pass
    with pg.superuser.connect() as c:
        assert c.scalar(text("SELECT status FROM tasks WHERE type = 'delete_user'")) == "succeeded"
        assert c.scalar(text("SELECT count(*) FROM users WHERE id = :u"), {"u": alice.id}) == 0
        assert c.scalar(text("SELECT count(*) FROM experiences")) == 1  # bob's
        for table, col in (("audit_log", "actor_id"), ("llm_calls", "user_id"), ("tasks", "user_id")):
            assert c.scalar(text(f"SELECT count(*) FROM {table} WHERE {col} = :u"), {"u": alice.id}) == 0, table
        assert c.scalar(text("SELECT count(*) FROM llm_calls WHERE user_hash IS NOT NULL")) == 1
        assert c.scalar(text("SELECT completed_at IS NOT NULL FROM deletion_requests"))
        # The tombstone keeps a salted hash only, never the bare user id (TRD §12.4).
        tombstone = c.execute(text("SELECT user_id, user_hash, row_to_json(d)::text FROM deletion_requests d")).one()
        assert tombstone[:2] == (None, pseudonym(alice.id)) and tombstone[1] != str(alice.id)
        assert str(alice.id) not in tombstone[2]
    assert not (get_settings().storage_dir / str(alice.id)).exists()  # files under the user's prefix are gone


def test_worker_pool_claims_only_its_types(pg, monkeypatch):
    from app.tasks import worker

    add_tasks(pg, 1)  # type 'race'
    monkeypatch.setitem(worker.HANDLERS, "race", lambda db, task: {"ok": True})
    assert worker.parse_types(" race, render ,race") == ["race", "render"]
    assert worker.parse_types(None) == sorted(worker.HANDLERS)
    for bad in ("nope", ","):
        with pytest.raises(SystemExit):
            worker.parse_types(bad)
    assert not run_once(pg.worker, ["render"])
    assert status(pg) == ("queued", 0)
    assert run_once(pg.worker, ["race"])
    assert status(pg)[0] == "succeeded"
