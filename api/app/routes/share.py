"""Shareable resume link (PRD §7, TRD §12): a read-only web resume behind an unguessable, revocable link.

Owner routes show, create (the row is the explicit consent record) and revoke the link of one resume; a resume has
at most one active link. Tokens are 256-bit and only their SHA-256 is stored, so the link is shown once, at creation.
The public route gives one identical 404 for malformed, unknown and revoked tokens and deleted accounts, is rate
limited per client, is noindex, and shows the name plus only the contact details the owner chose.
"""

import hashlib
import re
import secrets
import time
import uuid
from collections import defaultdict, deque
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Request
from fastapi.encoders import jsonable_encoder
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from sqlalchemy import func, select, text, update
from sqlalchemy.orm import Session

from app.core.auth import CtxDep
from app.core.display import day
from app.core.errors import ApiError
from app.core.idempotency import WriteCtxDep
from app.db.models import AuditLog, Resume, ResumeDraft, ShareLink, User
from app.db.session import get_db, set_user
from app.routes.resumes import _resume, resume_view

router = APIRouter(tags=["share"])

# Shown next to the checkbox (the frontend reads it from GET) and stored verbatim on the link as the consent record.
CONSENT_TEXT = ("Anyone with this link can read this resume, including edits you make later, until you turn the "
                "link off. It shows your name and only the contact details you tick.")
CONTACT = ("location", "email", "phone")
TOKEN_RE = re.compile(r"[A-Za-z0-9_-]{43}")  # secrets.token_urlsafe(32)
HEADERS = {"X-Robots-Tag": "noindex, nofollow", "Cache-Control": "no-store", "Referrer-Policy": "no-referrer"}
WINDOW_SECONDS, LIMIT = 60.0, 30
_hits: dict[str, deque[float]] = defaultdict(deque)


def token_hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def _link(link: ShareLink | None) -> dict:
    view = {"id": str(link.id), "created": day(link.consented_at), "contact": link.show_contact} if link else None
    return {"link": view, "consentText": CONSENT_TEXT}


def _revoke(ctx, resume_id: uuid.UUID) -> None:
    ids = ctx.db.scalars(update(ShareLink).where(ShareLink.resume_id == resume_id, ShareLink.revoked_at.is_(None))
                         .values(revoked_at=func.now()).returning(ShareLink.id)).all()
    ctx.db.add_all([AuditLog(actor_id=ctx.user.id, action="share_link.revoked", target=str(i)) for i in ids])


@router.get("/resumes/{resume_id}/share")
def get_share(resume_id: uuid.UUID, ctx: CtxDep):
    _resume(ctx.db, resume_id)
    return _link(ctx.db.scalars(select(ShareLink).where(ShareLink.resume_id == resume_id,
                                                        ShareLink.revoked_at.is_(None))).first())


class ShareIn(BaseModel):
    consent: Literal[True]  # the user ticked CONSENT_TEXT
    contact: list[Literal["location", "email", "phone"]] = Field(default_factory=list, max_length=3)


@router.post("/resumes/{resume_id}/share", status_code=201)
def create_share(resume_id: uuid.UUID, body: ShareIn, ctx: WriteCtxDep):
    """A new link replaces the resume's active one. The token is in this response only: the stored idempotent
    replay leaves it out, so it is never at rest."""
    _resume(ctx.db, resume_id)
    # Concurrent creates queue here, so the later one revokes the earlier link: one active link per resume.
    ctx.db.execute(text("SELECT pg_advisory_xact_lock(hashtext(:k))"), {"k": f"share:{resume_id}"})
    _revoke(ctx, resume_id)
    token = secrets.token_urlsafe(32)
    link = ShareLink(user_id=ctx.user.id, resume_id=resume_id, token_hash=token_hash(token),
                     show_contact=[k for k in CONTACT if k in body.contact], consent_text=CONSENT_TEXT)
    ctx.db.add(link)
    ctx.db.flush()
    ctx.db.add(AuditLog(actor_id=ctx.user.id, action="share_link.created", target=str(link.id)))
    ctx.db.refresh(link)
    view = _link(link)
    ctx.respond(201, view)
    return JSONResponse(jsonable_encoder({**view, "token": token}), 201)


@router.delete("/resumes/{resume_id}/share")
def revoke_share(resume_id: uuid.UUID, ctx: WriteCtxDep):
    _resume(ctx.db, resume_id)
    _revoke(ctx, resume_id)
    return ctx.respond(200, _link(None))


# ---------------------------------------------------------------- public


def limited(key: str) -> bool:
    """shortcut: in-process sliding window keyed on the first X-Forwarded-For hop (the Next page passes the
    viewer's); move to the edge or a shared store when the API runs as several processes or is reachable directly."""
    now = time.monotonic()
    if len(_hits) > 10_000:
        _hits.clear()
    q = _hits[key]
    while q and q[0] <= now - WINDOW_SECONDS:
        q.popleft()
    if len(q) >= LIMIT:
        return True
    q.append(now)
    return False


def public_view(db: Session, r: Resume, draft: ResumeDraft, user: User, contact: list[str]) -> dict:
    """The preview's `Resume` minus everything internal: no ids of facts, statuses, target job, withheld lines."""
    view = resume_view(db, r, draft)
    shown = {"location": user.location, "email": user.email, "phone": user.phone}
    extras = {**view["extras"], "contact": " · ".join(shown[k] for k in CONTACT if k in contact and shown[k])}
    sections = [{**{k: sec[k] for k in ("title", "org", "dates") if k in sec},
                 "lines": [{"id": line["id"], "text": line["text"]} for line in sec["lines"]]}
                for sec in view["sections"]]
    return {"name": user.name or "", "templateId": r.template_id, "sections": sections, "extras": extras}


@router.get("/shared/{token}")
def shared_resume(token: str, request: Request, db: Annotated[Session, Depends(get_db, scope="function")]):
    client = request.headers.get("x-forwarded-for", "").split(",")[0].strip() or getattr(request.client, "host", "")
    if limited(client):
        raise ApiError(429, "RATE_LIMITED", "Too many requests. Try again in a minute.")
    gone = ApiError(404, "NOT_FOUND", "This link doesn't work. Its owner may have turned it off.")
    if not TOKEN_RE.fullmatch(token):
        raise gone
    h = token_hash(token)
    # RLS shows this session only the one live link with this hash (migration 0006).
    db.execute(text("SELECT set_config('app.share_token', :h, true)"), {"h": h})
    link = db.scalars(select(ShareLink).where(ShareLink.token_hash == h, ShareLink.revoked_at.is_(None))).first()
    if link is None:
        raise gone
    set_user(db, link.user_id)  # read the resume as its owner, exactly as the editor preview does
    user, r = db.get(User, link.user_id), db.get(Resume, link.resume_id)
    if user is None or user.deleted_at is not None or r is None:
        raise gone
    draft = db.scalars(select(ResumeDraft).where(ResumeDraft.resume_id == r.id)).one()
    return JSONResponse(jsonable_encoder(public_view(db, r, draft, user, link.show_contact)), headers=HEADERS)
