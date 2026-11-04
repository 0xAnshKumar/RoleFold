"""Request identity.

Production: `Authorization: Bearer <OIDC ID token>` from any OIDC provider (OIDC_ISSUER, OIDC_AUDIENCE =
the client id the frontend signs in with). Signature is checked against the provider's JWKS; the user row
is the one with auth_subject '{iss}|{sub}'.

DEV-ONLY: header `X-Dev-User: <name>` maps to the users row with auth_subject 'dev|<name>'.
It is refused when ENV=production.

Admins (app/routes/admin.py): subjects listed in ADMIN_SUBJECTS, or an ID token whose top-level
ADMIN_ROLE_CLAIM claim (a string or a list) contains ADMIN_ROLE.
"""

import json
import re
import urllib.request
from dataclasses import dataclass
from functools import lru_cache
from typing import Annotated

import jwt
from fastapi import Depends, Header
from sqlalchemy import select, text
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.errors import ApiError
from app.db.models import Profile, User
from app.db.session import get_db, set_user

_DEV_USER_RE = re.compile(r"[A-Za-z0-9_.-]{1,64}")
_ALGORITHMS = ["RS256", "ES256"]
_LEEWAY_SECONDS = 60


@dataclass
class Ctx:
    db: Session
    user: User


@lru_cache
def _jwks_client(issuer: str, jwks_url: str | None) -> jwt.PyJWKClient:
    """One client per issuer: caches the key set (5 min) and refetches on an unknown kid (30s cooldown)."""
    if not jwks_url:
        url = issuer.rstrip("/") + "/.well-known/openid-configuration"
        with urllib.request.urlopen(url, timeout=5) as r:
            jwks_url = json.load(r)["jwks_uri"]
    return jwt.PyJWKClient(jwks_url, timeout=5)


def verify_claims(token: str) -> dict:
    s = get_settings()
    if not (s.oidc_issuer and s.oidc_audience):
        raise ApiError(401, "UNAUTHORIZED", "Sign-in is not configured on this server (OIDC_ISSUER/OIDC_AUDIENCE).")
    try:
        key = _jwks_client(s.oidc_issuer, s.oidc_jwks_url).get_signing_key_from_jwt(token)
    except (jwt.PyJWKClientConnectionError, OSError, KeyError, ValueError):
        raise ApiError(503, "DEPENDENCY_UNAVAILABLE", "Couldn't reach the sign-in provider. Try again.") from None
    except jwt.PyJWTError:  # malformed token, no kid, or kid not in the key set even after a refresh
        raise ApiError(401, "UNAUTHORIZED", "Your session isn't valid. Sign in again.") from None
    try:
        claims = jwt.decode(
            token, key, algorithms=_ALGORITHMS, audience=s.oidc_audience, issuer=s.oidc_issuer,
            leeway=_LEEWAY_SECONDS, options={"require": ["exp", "iss", "aud", "sub"]},
        )
    except jwt.ExpiredSignatureError:
        raise ApiError(401, "UNAUTHORIZED", "Your session has expired. Sign in again.") from None
    except jwt.PyJWTError:
        raise ApiError(401, "UNAUTHORIZED", "Your session isn't valid. Sign in again.") from None
    return claims


def resolve_identity(authorization: str | None, x_dev_user: str | None) -> tuple[str, dict]:
    """(auth subject, verified ID token claims); dev users have no claims."""
    if x_dev_user is not None and get_settings().env != "production":
        if not _DEV_USER_RE.fullmatch(x_dev_user):
            raise ApiError(401, "UNAUTHORIZED", "Invalid X-Dev-User.")
        return f"dev|{x_dev_user}", {}
    if authorization:
        scheme, _, token = authorization.partition(" ")
        if scheme.lower() != "bearer" or not token.strip():
            raise ApiError(401, "UNAUTHORIZED", "Expected 'Authorization: Bearer <token>'.")
        claims = verify_claims(token.strip())
        return f"{get_settings().oidc_issuer}|{claims['sub']}", claims
    raise ApiError(401, "UNAUTHORIZED", "Missing credentials.")


def resolve_subject(authorization: str | None, x_dev_user: str | None) -> str:
    return resolve_identity(authorization, x_dev_user)[0]


def is_admin(subject: str, claims: dict) -> bool:
    s = get_settings()
    if subject in {x.strip() for x in s.admin_subjects.split(",") if x.strip()}:
        return True
    roles = claims.get(s.admin_role_claim) if s.admin_role_claim else None
    return s.admin_role in ([roles] if isinstance(roles, str) else roles if isinstance(roles, list) else [])


def current_ctx(
    db: Annotated[Session, Depends(get_db, scope="function")],
    authorization: Annotated[str | None, Header()] = None,
    x_dev_user: Annotated[str | None, Header()] = None,
) -> Ctx:
    subject = resolve_subject(authorization, x_dev_user)
    # users RLS lets a session see/insert only the row for app.auth_subject until app.user_id is set.
    db.execute(text("SELECT set_config('app.auth_subject', :s, true)"), {"s": subject})
    db.execute(insert(User).values(auth_subject=subject).on_conflict_do_nothing(index_elements=["auth_subject"]))
    user = db.scalars(select(User).where(User.auth_subject == subject)).one()
    if user.deleted_at is not None:
        raise ApiError(403, "FORBIDDEN", "This account is being deleted.")
    set_user(db, user.id)
    db.execute(insert(Profile).values(user_id=user.id).on_conflict_do_nothing(index_elements=["user_id"]))
    return Ctx(db, user)


CtxDep = Annotated[Ctx, Depends(current_ctx, scope="function")]
