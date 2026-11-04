import pytest
from fastapi.testclient import TestClient

from app.core.config import get_settings
from app.main import app

client = TestClient(app)


def assert_error(r, status, code):
    assert r.status_code == status
    err = r.json()["error"]
    assert err["code"] == code and err["message"] and isinstance(err["details"], dict)
    assert err["trace_id"] == r.headers["x-trace-id"]


def test_missing_credentials():
    assert_error(client.get("/v1/me"), 401, "UNAUTHORIZED")


def test_bearer_tokens_refused_when_oidc_not_configured(monkeypatch):
    monkeypatch.setattr(get_settings(), "oidc_issuer", None)
    assert_error(client.get("/v1/me", headers={"Authorization": "Bearer abc"}), 401, "UNAUTHORIZED")


@pytest.mark.parametrize("name", ["", "a b", "x" * 65, "../etc"])
def test_invalid_dev_user(name):
    assert_error(client.get("/v1/me", headers={"X-Dev-User": name}), 401, "UNAUTHORIZED")


def test_dev_auth_refused_in_production(monkeypatch):
    monkeypatch.setattr(get_settings(), "env", "production")
    assert_error(client.get("/v1/me", headers={"X-Dev-User": "alice"}), 401, "UNAUTHORIZED")


def test_unknown_route_uses_error_shape():
    assert_error(client.get("/v1/nope"), 404, "NOT_FOUND")


def test_healthz():
    assert client.get("/healthz").json() == {"status": "ok"}
