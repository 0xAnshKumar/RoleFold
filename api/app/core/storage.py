"""Object storage on local disk (TRD §3: keys are prefixed by user_id). put / get / delete a user's prefix.
Also the deletion tombstone store (TOMBSTONE_DIR), which lives outside the DB and its backups."""

import os
import re
import shutil
from datetime import UTC, datetime
from pathlib import Path

from app.core.config import get_settings


def _path(key: str) -> Path:
    root = get_settings().storage_dir.resolve()
    path = (root / key).resolve()
    if not key or not path.is_relative_to(root) or path == root:
        raise ValueError(f"invalid storage key: {key!r}")
    return path


def put(key: str, data: bytes) -> None:
    path = _path(key)
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_bytes(data)
    tmp.replace(path)


def get(key: str) -> bytes:
    return _path(key).read_bytes()


def delete_prefix(prefix: str) -> None:
    """Deletion pipeline (TRD §12.4): removes every object under `prefix` (a user_id)."""
    shutil.rmtree(_path(prefix), ignore_errors=True)


_HASH_RE = re.compile(r"[0-9a-f]{64}")  # app.tasks.deletion.pseudonym (HMAC-SHA256 hex)


def write_tombstone(user_hash: str) -> None:
    """One file per deleted user, named by the salted hash. Write-once: an existing file is left untouched,
    so a retried deletion is a no-op. Production TOMBSTONE_DIR is a WORM bucket that enforces the same."""
    if not _HASH_RE.fullmatch(user_hash):
        raise ValueError("tombstone name must be a pseudonym hash")
    root = get_settings().tombstone_dir
    root.mkdir(parents=True, exist_ok=True)
    try:
        with open(root / user_hash, "x") as f:
            f.write(datetime.now(UTC).isoformat() + "\n")
            f.flush()
            os.fsync(f.fileno())  # durable before the DB deletion commits
    except FileExistsError:
        pass


def tombstones() -> list[str]:
    """Every tombstoned user hash (for re-applying deletions after a restore)."""
    root = get_settings().tombstone_dir
    return sorted(p.name for p in root.iterdir() if _HASH_RE.fullmatch(p.name)) if root.is_dir() else []
