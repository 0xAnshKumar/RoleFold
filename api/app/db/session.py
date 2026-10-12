"""One transaction per request; RLS context is set with set_config(..., is_local=true) == SET LOCAL."""

import uuid
from collections.abc import Iterator
from functools import lru_cache

from sqlalchemy import Engine, create_engine, text
from sqlalchemy.orm import Session

from app.core.config import get_settings


@lru_cache
def engine_for(url: str) -> Engine:
    return create_engine(url, pool_pre_ping=True)


def app_engine() -> Engine:
    return engine_for(get_settings().database_url)


def set_user(db: Session, user_id: uuid.UUID) -> None:
    """Only ever called with an id resolved from the authenticated subject (or a task's owner)."""
    db.execute(text("SELECT set_config('app.user_id', :u, true)"), {"u": str(user_id)})


def get_db() -> Iterator[Session]:
    with Session(app_engine()) as db, db.begin():
        yield db
