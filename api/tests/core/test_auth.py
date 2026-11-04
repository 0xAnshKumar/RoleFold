"""OIDC bearer validation against a JWKS served in-test (no network)."""

import io
import json
import time
import urllib.request

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import rsa

from app.core import auth
from app.core.config import get_settings
from app.core.errors import ApiError

ISS = "https://login.example.com/"
AUD = "hunt-client"


def make_key(kid):
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    jwk = json.loads(jwt.algorithms.RSAAlgorithm.to_jwk(key.public_key()))
    return key, {**jwk, "kid": kid, "use": "sig", "alg": "RS256"}


KEY_A, JWK_A = make_key("a")
KEY_B, JWK_B = make_key("b")


@pytest.fixture
def idp(monkeypatch):
    """Serves discovery + JWKS for ISS; `idp["keys"]` is the live key set, `idp["hits"]` counts JWKS fetches."""
    state = {"keys": [JWK_A], "hits": 0}

    def fake_open(self, req, *a, **kw):
        url = req if isinstance(req, str) else req.full_url
        if url == ISS + ".well-known/openid-configuration":
            body = {"issuer": ISS, "jwks_uri": ISS + "jwks"}
        elif url == ISS + "jwks":
            state["hits"] += 1
            body = {"keys": state["keys"]}
        else:
            raise AssertionError(url)
        return io.BytesIO(json.dumps(body).encode())

    monkeypatch.setattr(urllib.request.OpenerDirector, "open", fake_open)
    s = get_settings()
    monkeypatch.setattr(s, "oidc_issuer", ISS)
    monkeypatch.setattr(s, "oidc_audience", AUD)
    monkeypatch.setattr(s, "oidc_jwks_url", None)
    auth._jwks_client.cache_clear()
    yield state
    auth._jwks_client.cache_clear()


def token(key=KEY_A, kid="a", **over):
    now = int(time.time())
    claims = {"iss": ISS, "aud": AUD, "sub": "user-1", "iat": now, "exp": now + 600} | over
    return jwt.encode(claims, key, algorithm="RS256", headers={"kid": kid})


def assert_401(authorization):
    with pytest.raises(ApiError) as e:
        auth.resolve_subject(authorization, None)
    assert e.value.status == 401


def test_valid_token_maps_to_issuer_and_subject(idp):
    assert auth.resolve_subject(f"Bearer {token()}", None) == f"{ISS}|user-1"
    auth.resolve_subject(f"Bearer {token()}", None)
    assert idp["hits"] == 1  # key set is cached


@pytest.mark.parametrize("over", [
    {"exp": int(time.time()) - 3600},  # expired beyond leeway
    {"nbf": int(time.time()) + 3600},  # not yet valid
    {"aud": "someone-else"},
    {"iss": "https://evil.example.com/"},
])
def test_bad_claims_rejected(idp, over):
    assert_401(f"Bearer {token(**over)}")


def test_bad_signature_rejected(idp):
    assert_401(f"Bearer {token(key=KEY_B, kid='a')}")  # signed by B, claims to be A


def test_unknown_kid_rejected(idp):
    assert_401(f"Bearer {token(key=KEY_B, kid='b')}")


def test_unknown_kid_refreshes_key_set(idp):
    auth.resolve_subject(f"Bearer {token()}", None)
    idp["keys"] = [JWK_A, JWK_B]  # provider rotated keys
    auth._jwks_client(ISS, None).cooldown_duration = 0
    assert auth.resolve_subject(f"Bearer {token(key=KEY_B, kid='b')}", None) == f"{ISS}|user-1"
    assert idp["hits"] == 2


def test_explicit_jwks_url_skips_discovery(idp, monkeypatch):
    monkeypatch.setattr(get_settings(), "oidc_jwks_url", ISS + "jwks")
    assert auth.resolve_subject(f"Bearer {token()}", None) == f"{ISS}|user-1"


@pytest.mark.parametrize("header", ["Bearer", "Basic abc", "Bearer not-a-jwt"])
def test_malformed_header_rejected(idp, header):
    assert_401(header)


def test_bearer_refused_when_oidc_not_configured(monkeypatch):
    monkeypatch.setattr(get_settings(), "oidc_issuer", None)
    assert_401(f"Bearer {token()}")


def test_dev_header_refused_in_production_but_bearer_works(idp, monkeypatch):
    monkeypatch.setattr(get_settings(), "env", "production")
    assert_401(None)
    with pytest.raises(ApiError):
        auth.resolve_subject(None, "alice")
    assert auth.resolve_subject(f"Bearer {token()}", "alice") == f"{ISS}|user-1"


def test_dev_header_outside_production():
    assert auth.resolve_subject(None, "alice") == "dev|alice"


def test_admin_by_subject_list_or_verified_role_claim(idp, monkeypatch):
    s = get_settings()
    monkeypatch.setattr(s, "admin_subjects", "dev|root")
    assert auth.is_admin(*auth.resolve_identity(None, "root"))
    assert not auth.is_admin(*auth.resolve_identity(None, "alice"))
    subject, claims = auth.resolve_identity(f"Bearer {token(groups=['staff', 'hunt-admin'])}", None)
    assert not auth.is_admin(subject, claims)  # role claim not configured
    monkeypatch.setattr(s, "admin_role_claim", "groups")
    assert auth.is_admin(subject, claims)
    assert auth.is_admin(*auth.resolve_identity(f"Bearer {token(groups='hunt-admin')}", None))
    assert not auth.is_admin(*auth.resolve_identity(f"Bearer {token(groups=['staff'])}", None))
    assert not auth.is_admin(*auth.resolve_identity(f"Bearer {token()}", None))
