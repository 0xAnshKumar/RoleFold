"""Idempotency-Key on side-effecting routes (TRD §11.2).

Same key + same request replays the stored response; same key + different request is 409.
The key row is inserted first, so a concurrent duplicate waits on the unique index until the
first request commits (then replays) or rolls back (then runs).
"""

import hashlib
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Annotated

from fastapi import Depends, Header, Request
from fastapi.encoders import jsonable_encoder
from fastapi.responses import JSONResponse
from sqlalchemy import delete, select, update
from sqlalchemy.dialects.postgresql import insert

from app.core.auth import Ctx, current_ctx
from app.core.config import get_settings
from app.core.errors import ApiError, Replay
from app.db.models import IdempotencyKey


@dataclass
class WriteCtx(Ctx):
    key: str
    key_row_id: object

    def respond(self, status: int, body: dict) -> JSONResponse:
        body = jsonable_encoder(body)
        self.db.execute(
            update(IdempotencyKey)
            .where(IdempotencyKey.id == self.key_row_id)
            .values(status_code=status, response=body)
        )
        return JSONResponse(body, status)


async def request_fingerprint(
    request: Request, idempotency_key: Annotated[str | None, Header()] = None
) -> tuple[str, str, str]:
    if not idempotency_key or len(idempotency_key) > 200:
        raise ApiError(400, "VALIDATION_ERROR", "An Idempotency-Key header (max 200 chars) is required.")
    route = f"{request.method} {request.url.path}"
    digest = hashlib.sha256(route.encode() + b"\n" + await request.body()).hexdigest()
    return idempotency_key, route, digest


def write_ctx(
    ctx: Annotated[Ctx, Depends(current_ctx, scope="function")],
    fp: Annotated[tuple[str, str, str], Depends(request_fingerprint)],
) -> WriteCtx:
    key, route, digest = fp
    db, uid = ctx.db, ctx.user.id
    now = datetime.now(UTC)
    db.execute(delete(IdempotencyKey).where(IdempotencyKey.key == key, IdempotencyKey.expires_at < now))
    row_id = db.scalar(
        insert(IdempotencyKey)
        .values(
            user_id=uid, key=key, route=route, request_hash=digest,
            expires_at=now + timedelta(hours=get_settings().idempotency_ttl_hours),
        )
        .on_conflict_do_nothing(index_elements=["user_id", "key"])
        .returning(IdempotencyKey.id)
    )
    if row_id is None:
        prior = db.scalars(select(IdempotencyKey).where(IdempotencyKey.key == key)).one()
        if prior.request_hash != digest or prior.response is None:
            raise ApiError(409, "IDEMPOTENCY_CONFLICT", "This Idempotency-Key was used for a different request.")
        raise Replay(prior.status_code, prior.response)
    return WriteCtx(db, ctx.user, key, row_id)


WriteCtxDep = Annotated[WriteCtx, Depends(write_ctx, scope="function")]
