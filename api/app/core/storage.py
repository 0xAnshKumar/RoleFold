"""Object storage on local disk (TRD §3: keys are prefixed by user_id). put / get / delete a user's prefix."""

import shutil
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
