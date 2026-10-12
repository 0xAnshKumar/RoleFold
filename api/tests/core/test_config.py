import pytest
from pydantic import ValidationError

from app.core.config import Settings


def test_missing_required_config_fails_clearly(monkeypatch):
    monkeypatch.delenv("DATABASE_URL", raising=False)
    monkeypatch.delenv("PSEUDONYM_SALT", raising=False)
    with pytest.raises(ValidationError) as e:
        Settings(_env_file=None)
    assert {err["loc"][0] for err in e.value.errors()} == {"database_url", "pseudonym_salt"}


def test_short_salt_rejected(monkeypatch):
    monkeypatch.setenv("PSEUDONYM_SALT", "short")
    with pytest.raises(ValidationError):
        Settings(_env_file=None)


def test_free_limits_default_to_prd_values():
    s = Settings(_env_file=None)
    assert (s.free_tailored_per_month, s.free_deep_matches_per_month, s.reservation_ttl_seconds) == (10, 30, 3600)
