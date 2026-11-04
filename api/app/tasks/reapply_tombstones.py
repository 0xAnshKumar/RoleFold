"""Re-apply account deletions after a DB restore (README "Restore runbook").

A restored backup can still hold users who were deleted after it was taken. Their salted hashes survive in
TOMBSTONE_DIR, outside the DB, so: hash every restored user id and delete each user whose hash is tombstoned.

    RESTORE_DATABASE_URL=... uv run python -m app.tasks.reapply_tombstones [--dry-run]

Needs the same PSEUDONYM_SALT that wrote the tombstones. Safe to run again: deleted users no longer match.
"""

import argparse
import uuid
from collections.abc import Iterable

from sqlalchemy import Engine, select
from sqlalchemy.orm import Session

from app.core import storage
from app.core.config import get_settings
from app.db.models import DeletionRequest, User
from app.db.session import engine_for, set_user
from app.tasks.deletion import delete_user, pseudonym
from app.tasks.queue import Claimed


def matching(user_ids: Iterable[uuid.UUID], hashes: Iterable[str]) -> list[uuid.UUID]:
    hashes = set(hashes)
    return [u for u in user_ids if pseudonym(u) in hashes]


def reapply(engine: Engine, dry_run: bool = False) -> dict:
    hashes = storage.tombstones()
    with Session(engine) as db:
        ids = matching(db.scalars(select(User.id)), hashes)
    if not dry_run:
        for uid in ids:  # one transaction per user, the same work as the delete_user task
            with Session(engine) as db, db.begin():
                set_user(db, uid)
                req = DeletionRequest(user_id=uid, user_hash=pseudonym(uid))
                db.add(req)
                db.flush()
                delete_user(db, Claimed(uuid.uuid4(), uid, "delete_user", {"deletion_request_id": str(req.id)},
                                        1, f"reapply_tombstone:{uid}"))
    return {"tombstone_dir": str(get_settings().tombstone_dir), "tombstones": len(hashes),
            "matched_users": len(ids), "deleted": 0 if dry_run else len(ids), "dry_run": dry_run}


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description="Delete restored users whose deletion tombstone exists.")
    parser.add_argument("--dry-run", action="store_true", help="count matches, delete nothing")
    args = parser.parse_args(argv)
    url = get_settings().restore_database_url
    if not url:
        raise SystemExit("RESTORE_DATABASE_URL is not set (a superuser/BYPASSRLS role: it must see every user).")
    print(reapply(engine_for(url), args.dry_run))


if __name__ == "__main__":
    main()
