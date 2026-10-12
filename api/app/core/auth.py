"""Request identity. OIDC provider is not chosen yet (TRD T-OQ-4), so bearer tokens are refused.

DEV-ONLY: header `X-Dev-User: <name>` maps to the users row with auth_subject 'dev|<name>'.
It is refused when ENV=production.
"""

import re
from dataclasses import dataclass
from typing import Annotated

from fastapi import Depends, Header
from sqlalchemy import select, text
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.errors import ApiError
from app.db.models import Profile, User
from app.db.session import get_db, set_user

_DEV_USER_RE = re.compile(r"[A-Za-z0-9_.-]{1,64}")


@dataclass
class Ctx:
    db: Session
    user: User


def resolve_subject(authorization: str | None, x_dev_user: str | None) -> str:
    if x_dev_user is not None and get_settings().env != "production":
        if not _DEV_USER_RE.fullmatch(x_dev_user):
            raise ApiError(401, "UNAUTHORIZED", "Invalid X-Dev-User.")
        return f"dev|{x_dev_user}"
    if authorization:
        raise ApiError(401, "UNAUTHORIZED", "Bearer token validation is not configured (no OIDC provider yet).")
    raise ApiError(401, "UNAUTHORIZED", "Missing credentials.")


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
