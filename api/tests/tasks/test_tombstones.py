"""Deletion tombstones outside the DB (TODOS P1): write-once files and re-apply matching. No DB."""

import uuid

import pytest

from app.core import storage
from app.core.config import get_settings
from app.tasks.deletion import pseudonym
from app.tasks.reapply_tombstones import matching


@pytest.fixture(autouse=True)
def settings(tmp_path, monkeypatch):
    monkeypatch.setenv("DATABASE_URL", "postgresql+psycopg://nobody:x@127.0.0.1:1/none")
    monkeypatch.setenv("PSEUDONYM_SALT", "unit-test-salt-0123456789")
    monkeypatch.setenv("TOMBSTONE_DIR", str(tmp_path / "tombstones"))
    get_settings.cache_clear()
    yield get_settings()
    get_settings.cache_clear()


def test_tombstone_is_write_once_and_idempotent(settings):
    h = pseudonym(uuid.uuid4())
    storage.write_tombstone(h)
    path = settings.tombstone_dir / h
    first = path.read_text()
    storage.write_tombstone(h)  # a retried deletion task
    assert path.read_text() == first
    assert storage.tombstones() == [h]


def test_tombstone_names_must_be_hashes(settings):
    for bad in ["../x", "", str(uuid.uuid4())]:
        with pytest.raises(ValueError):
            storage.write_tombstone(bad)
    settings.tombstone_dir.mkdir(parents=True)
    (settings.tombstone_dir / "README").write_text("not a tombstone")
    assert storage.tombstones() == []


def test_no_tombstone_dir_means_no_tombstones():
    assert storage.tombstones() == []


def test_reapply_matches_only_tombstoned_users():
    deleted, kept = uuid.uuid4(), uuid.uuid4()
    assert matching([deleted, kept], [pseudonym(deleted), "0" * 64]) == [deleted]
    assert matching([kept], []) == []
