"""Restore runbook: deletion writes a file tombstone; re-applying it deletes the user from a restored DB."""

import pytest
from sqlalchemy import text

from app.core import storage
from app.tasks.deletion import pseudonym
from app.tasks.reapply_tombstones import reapply
from app.tasks.worker import run_once

pytestmark = pytest.mark.db


def users(pg) -> set:
    with pg.superuser.connect() as c:
        return set(c.scalars(text("SELECT id FROM users")))


def test_deletion_writes_tombstone_and_reapply_deletes_restored_user(pg, alice, bob):
    alice.write("POST", "/v1/experiences", {"employer": "Acme"})
    alice.write("POST", "/v1/me/delete")
    while run_once(pg.worker):
        pass
    assert pseudonym(alice.id) in storage.tombstones()

    # "Restore an older backup": alice is back in the DB, her tombstone is not.
    with pg.superuser.begin() as c:
        c.execute(text("INSERT INTO users (id, auth_subject) VALUES (:u, 'dev:alice-restored')"), {"u": alice.id})
    assert reapply(pg.superuser, dry_run=True)["matched_users"] == 1
    assert alice.id in users(pg)

    out = reapply(pg.superuser)
    assert out["deleted"] == 1 and users(pg) == {bob.id}
    assert reapply(pg.superuser)["matched_users"] == 0  # idempotent
