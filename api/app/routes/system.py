"""Health, operations and usage."""

import uuid

from fastapi import APIRouter
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError

from app.core import usage
from app.core.auth import CtxDep
from app.core.errors import ApiError
from app.db.models import Task
from app.db.session import app_engine
from app.tasks.queue import operation

health = APIRouter(tags=["system"])
router = APIRouter(tags=["system"])


@health.get("/healthz")
def healthz():
    return {"status": "ok"}


@health.get("/readyz")
def readyz():
    try:
        with app_engine().connect() as conn:
            conn.execute(text("SELECT 1"))
    except SQLAlchemyError:
        raise ApiError(503, "DEPENDENCY_UNAVAILABLE", "Database unavailable.") from None
    return {"status": "ready"}


@router.get("/tasks/{task_id}")
def get_task(task_id: uuid.UUID, ctx: CtxDep):
    task = ctx.db.get(Task, task_id)  # RLS: other users' tasks are invisible -> 404
    if task is None:
        raise ApiError(404, "NOT_FOUND", "Not found.")
    return operation(task)


@router.get("/usage")
def get_usage(ctx: CtxDep):
    return usage.summary(ctx.db, ctx.user.id)
