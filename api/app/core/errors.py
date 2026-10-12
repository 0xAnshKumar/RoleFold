"""Error shape {"error": {code, message, details, trace_id}} with the closed code list (TRD §11.3)."""

import logging
from typing import Literal

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

log = logging.getLogger(__name__)

ErrorCode = Literal[
    "VALIDATION_ERROR",
    "UNSUPPORTED_FORMAT",
    "NO_EXTRACTABLE_TEXT",
    "NO_TEXT_FOUND",  # upload route: scanned or empty file (frontend contract; the task keeps NO_EXTRACTABLE_TEXT)
    "FILE_TOO_LARGE",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "NOT_FOUND",
    "IDEMPOTENCY_CONFLICT",
    "VERSION_CONFLICT",
    "UNCONFIRMED_ENTRY",
    "RESPONSIBILITY_LEVEL_REQUIRED",
    "INSUFFICIENT_JOB_DETAIL",
    "PLAN_LIMIT_REACHED",
    "RATE_LIMITED",
    "DEPENDENCY_UNAVAILABLE",
    "URL_ONLY_PASTE",  # CEO D28
    "MODEL_REFUSED",  # eng review E1 (internal: failed operations)
    "INTERNAL_ERROR",  # unhandled exceptions; not in TRD's list, see report
]

_HTTP_CODES: dict[int, ErrorCode] = {
    401: "UNAUTHORIZED",
    403: "FORBIDDEN",
    404: "NOT_FOUND",
    405: "NOT_FOUND",
    429: "RATE_LIMITED",
}


class ApiError(Exception):
    def __init__(self, status: int, code: ErrorCode, message: str, details: dict | None = None):
        super().__init__(message)
        self.status, self.code, self.message, self.details = status, code, message, details or {}


class Replay(Exception):
    """Raised to answer with a stored idempotent response."""

    def __init__(self, status: int, body: dict):
        self.status, self.body = status, body


def error_body(request: Request, code: str, message: str, details: dict | None = None) -> dict:
    trace_id = getattr(request.state, "trace_id", None)
    return {"error": {"code": code, "message": message, "details": details or {}, "trace_id": trace_id}}


def install(app: FastAPI) -> None:
    @app.exception_handler(ApiError)
    async def _api(request: Request, exc: ApiError):
        return JSONResponse(error_body(request, exc.code, exc.message, exc.details), exc.status)

    @app.exception_handler(Replay)
    async def _replay(request: Request, exc: Replay):
        return JSONResponse(exc.body, exc.status, headers={"Idempotent-Replayed": "true"})

    @app.exception_handler(RequestValidationError)
    async def _validation(request: Request, exc: RequestValidationError):
        details = {"errors": [{"loc": list(e["loc"]), "msg": e["msg"]} for e in exc.errors()]}
        return JSONResponse(error_body(request, "VALIDATION_ERROR", "Invalid request.", details), 422)

    @app.exception_handler(StarletteHTTPException)
    async def _http(request: Request, exc: StarletteHTTPException):
        code = _HTTP_CODES.get(exc.status_code, "VALIDATION_ERROR")
        return JSONResponse(error_body(request, code, str(exc.detail)), exc.status_code)

    @app.exception_handler(Exception)
    async def _unhandled(request: Request, exc: Exception):
        log.exception("unhandled error", extra={"trace_id": getattr(request.state, "trace_id", None)})
        return JSONResponse(error_body(request, "INTERNAL_ERROR", "Something went wrong."), 500)
