"""delete_user task (TRD §12.4, CEO D14). Runs as hunt_worker with app.user_id = the deleted user."""

import hashlib
import hmac
import uuid

from sqlalchemy import delete, func, update
from sqlalchemy.orm import Session

from app.core import storage
from app.core.config import get_settings
from app.db.models import AuditLog, DeletionRequest, LlmCall, Task, User
from app.tasks.queue import Claimed


def pseudonym(user_id: uuid.UUID) -> str:
    return hmac.new(get_settings().pseudonym_salt.encode(), str(user_id).encode(), hashlib.sha256).hexdigest()


def delete_user(db: Session, task: Claimed) -> dict:
    uid, alias = task.user_id, pseudonym(task.user_id)
    db.execute(update(AuditLog).where(AuditLog.actor_id == uid).values(actor_id=None, actor_hash=alias))
    db.execute(update(LlmCall).where(LlmCall.user_id == uid).values(user_id=None, user_hash=alias))
    db.execute(delete(Task).where(Task.user_id == uid, Task.id != task.id))
    db.execute(update(Task).where(Task.id == task.id).values(user_id=None))
    # Every user-owned table cascades from users (FK ON DELETE CASCADE).
    db.execute(delete(User).where(User.id == uid))
    # Before commit: if the commit fails the task retries, and deleting files twice is harmless.
    storage.delete_prefix(str(uid))
    # ponytail: no sessions, cache or email lists exist at beta; add those stages with them.
    stages = ["logs_pseudonymized", "tasks_deleted", "user_rows_deleted", "files_deleted"]
    # The tombstone keeps only the salted hash; restores re-apply deletions by hashing restored ids.
    db.execute(
        update(DeletionRequest)
        .where(DeletionRequest.id == uuid.UUID(task.payload["deletion_request_id"]))
        .values(stages_completed=stages, completed_at=func.now(), user_id=None, user_hash=alias)
    )
    db.add(AuditLog(actor_hash=alias, action="account.deleted"))
    return {"stages": stages}
