"""RoleFold API: `uvicorn app.main:app`."""

import uuid

from fastapi import FastAPI, Request
from pydantic import ValidationError

from app.core import errors
from app.core.config import get_settings
from app.routes import admin, imports, insights, jobs, me, profile, resumes, share, system

try:
    get_settings()
except ValidationError as e:
    missing = ", ".join(str(err["loc"][0]).upper() for err in e.errors())
    raise SystemExit(f"Invalid or missing configuration in api/.env: {missing}") from None

app = FastAPI(title="RoleFold API", version="0.1.0")
errors.install(app)


@app.middleware("http")
async def trace_id(request: Request, call_next):
    request.state.trace_id = request.headers.get("x-request-id") or uuid.uuid4().hex
    response = await call_next(request)
    response.headers["X-Trace-Id"] = request.state.trace_id
    return response


app.include_router(system.health)
for r in (me.router, profile.router, imports.router, jobs.router, resumes.router, system.router):
    app.include_router(r, prefix="/v1")
for r in (share.router, insights.router):
    app.include_router(r, prefix="/v1")
app.include_router(admin.router, prefix="/v1")  # admin console (app/routes/admin.py)
