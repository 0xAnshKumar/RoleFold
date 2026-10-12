"""One worker for every task type: `python -m app.tasks.worker` (connects as hunt_worker).

Only types in HANDLERS are claimed; other types stay queued until a handler is registered here.
"""

import logging
import time
import uuid
from collections.abc import Callable

from sqlalchemy import Engine
from sqlalchemy.orm import Session

from app.core import usage
from app.core.config import get_settings
from app.db.session import engine_for, set_user
from app.tasks import queue
from app.tasks.deletion import delete_user
from app.tasks.exports import render_export
from app.tasks.imports import import_resume
from app.tasks.match import match_job
from app.tasks.tailor import tailor_resume

log = logging.getLogger("worker")

HANDLERS: dict[str, Callable[[Session, queue.Claimed], dict | None]] = {
    "delete_user": delete_user,
    "import": import_resume,
    "match": match_job,
    "render": render_export,
    "tailor": tailor_resume,
}


def run_once(engine: Engine) -> bool:
    """Requeue expired leases, claim one task, run it. Returns False when there was nothing to do."""
    with engine.begin() as conn:
        queue.requeue_expired(conn)
    with engine.begin() as conn:
        task = queue.claim(conn, list(HANDLERS))
    if task is None:
        return False
    try:
        with Session(engine) as db, db.begin():
            if task.user_id:
                set_user(db, task.user_id)
            queue.complete(db, task, HANDLERS[task.type](db, task))
    except queue.LeaseLost:
        log.warning("lease lost, effects rolled back", extra={"task_id": str(task.id)})
    except queue.Deferred as e:
        with engine.begin() as conn:
            queue.defer(conn, task, e.code, str(e), e.delay_s)
    except queue.TaskError as e:
        _fail(engine, task, e.code, str(e), e.retry)
    except Exception as e:
        log.exception("task failed", extra={"task_id": str(task.id), "type": task.type})
        _fail(engine, task, "INTERNAL_ERROR", type(e).__name__)
    return True


def _fail(engine: Engine, task: queue.Claimed, code: str, message: str, retry: bool = True) -> None:
    """A task that will not run again gives its usage reservation back (TRD §11.1)."""
    with engine.begin() as conn:
        status = queue.fail(conn, task, code, message, retry)
        reservation_id = task.payload.get("reservation_id")
        if status in ("failed", "dead") and reservation_id and task.user_id:
            set_user(conn, task.user_id)
            usage.release(conn, uuid.UUID(reservation_id))


def main() -> None:
    logging.basicConfig(level=logging.INFO)
    settings = get_settings()
    if not settings.worker_database_url:
        raise SystemExit("WORKER_DATABASE_URL is not set (connect as hunt_worker).")
    engine = engine_for(settings.worker_database_url)
    log.info("worker started; types=%s", sorted(HANDLERS))
    while True:
        if not run_once(engine):
            time.sleep(settings.worker_poll_seconds)


if __name__ == "__main__":
    main()
