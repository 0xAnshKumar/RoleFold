"""POST /v1/imports: store the upload, extract its text, enqueue the import task (app/tasks/imports.py).

Two bodies: multipart/form-data with a `file` field (PDF, DOCX, TXT, MD; text is extracted here), or
JSON `{filename, size_bytes, text}` where the client already read the text (TXT/MD/LinkedIn CSV).
"""

import email.parser
import email.policy
import io
import uuid
import zipfile
from pathlib import PurePosixPath
from typing import Annotated

from fastapi import APIRouter, Depends, Request
from fastapi.exceptions import RequestValidationError
from pydantic import BaseModel, Field, ValidationError
from sqlalchemy import event

from app.core import parsing, storage
from app.core.config import get_settings
from app.core.errors import ApiError
from app.core.idempotency import WriteCtxDep
from app.db.models import Import
from app.tasks.queue import enqueue, operation

router = APIRouter(tags=["profile"])

# Extension -> format. Uploaded files are also sniffed by magic bytes; extension alone is never trusted.
FORMATS = {".pdf": "pdf", ".docx": "docx", ".txt": "txt", ".md": "md", ".csv": "linkedin_csv"}
UPLOAD_FORMATS = {"pdf", "docx", "txt", "md"}
MAX_TEXT = 200_000
NO_TEXT = "We couldn't find any text in this file. If it's a scanned PDF, upload a DOCX or TXT version instead."


class ImportIn(BaseModel):
    filename: str = Field(min_length=1, max_length=255)
    size_bytes: int = Field(gt=0)
    text: str | None = Field(None, max_length=MAX_TEXT)


def unsupported() -> ApiError:
    return ApiError(415, "UNSUPPORTED_FORMAT", "Upload a PDF, DOCX, TXT or MD file.")


def too_large(size: int) -> None:
    max_mb = get_settings().upload_max_mb
    if size > max_mb * 1024 * 1024:
        raise ApiError(413, "FILE_TOO_LARGE", f"Files can be up to {max_mb} MB.", {"max_mb": max_mb})


def sniff(data: bytes) -> str | None:
    """Real type from content: pdf, docx, or text (UTF-8 with no NUL bytes); None for anything else."""
    if data.startswith(b"%PDF-"):
        return "pdf"
    if data.startswith(b"PK\x03\x04"):
        try:
            return "docx" if "word/document.xml" in zipfile.ZipFile(io.BytesIO(data)).namelist() else None
        except zipfile.BadZipFile:
            return None
    try:
        data.decode("utf-8")
    except UnicodeDecodeError:
        return None
    return None if b"\x00" in data else "text"


def too_long(pages: int | None = None) -> ApiError:
    n = get_settings().upload_max_pages
    return ApiError(413, "FILE_TOO_LARGE", f"Resumes can be up to {n} pages. Remove extra pages and try again.",
                    {"max_pages": n, "pages": pages})


def extract_text(data: bytes, fmt: str) -> str:
    """NO_EXTRACTABLE_TEXT for unreadable, encrypted, scanned or empty files (OCR is later, T-OQ-7).

    PDF/DOCX parsers run in a sandboxed child process (app/core/parsing.py); TXT/MD is already proven UTF-8.
    """
    settings = get_settings()
    if fmt not in ("pdf", "docx"):
        text, pages = data.decode("utf-8-sig"), None
    else:
        try:
            out = parsing.extract(data, fmt, settings.upload_max_pages)
        except parsing.ParseFailed:
            raise ApiError(422, "NO_EXTRACTABLE_TEXT", "We couldn't read this file: it took too long or is damaged. "
                           "Upload a DOCX or TXT version instead.", {"reason": "parse_failed"}) from None
        text, pages = out["text"], out["pages"]
        if (pages or 0) > settings.upload_max_pages:
            raise too_long(pages)
    if not text.strip():
        raise ApiError(422, "NO_EXTRACTABLE_TEXT", NO_TEXT)
    if pages is None and len(text) > settings.upload_max_chars:
        raise too_long()
    return text


def read_upload(content_type: str, body: bytes) -> tuple[str, bytes]:
    """(filename, bytes) of the `file` field; stdlib parser, so no multipart dependency."""
    msg = email.parser.BytesParser(policy=email.policy.HTTP).parsebytes(
        b"Content-Type: " + content_type.encode() + b"\r\n\r\n" + body)
    for part in msg.iter_parts() if msg.is_multipart() else []:
        if part.get_param("name", header="content-disposition") == "file":
            return part.get_filename() or "", part.get_payload(decode=True) or b""
    raise ApiError(422, "VALIDATION_ERROR", "Attach the file in a form field named `file`.")


async def raw_body(request: Request) -> bytes:
    return await request.body()  # already read (and cached) for the Idempotency-Key fingerprint


@router.post("/imports", status_code=202)
def create_import(request: Request, raw: Annotated[bytes, Depends(raw_body)], ctx: WriteCtxDep):
    content_type = request.headers.get("content-type", "")
    if content_type.startswith("multipart/form-data"):
        too_large(len(raw))
        filename, data = read_upload(content_type, raw)
        filename = PurePosixPath(filename.replace("\\", "/")).name[:255]
        fmt = FORMATS.get(PurePosixPath(filename).suffix.lower())
        if fmt not in UPLOAD_FORMATS:
            raise unsupported()
        too_large(len(data))
        if not data:
            raise ApiError(422, "NO_EXTRACTABLE_TEXT", NO_TEXT)
        real = sniff(data)
        if real != fmt and not (real == "text" and fmt in ("txt", "md")):
            raise unsupported()
        text, size = extract_text(data, fmt), len(data)
    else:
        try:
            body = ImportIn.model_validate_json(raw)
        except ValidationError as e:
            raise RequestValidationError(e.errors()) from None
        filename, fmt, text, size, data = body.filename, FORMATS.get(PurePosixPath(body.filename).suffix.lower()), \
            body.text, body.size_bytes, None
        if fmt is None:
            raise ApiError(415, "UNSUPPORTED_FORMAT", "Upload a PDF, DOCX, TXT, MD or LinkedIn CSV file.")
        too_large(size)

    import_id = uuid.uuid4()
    # Keys are prefixed by user_id (TRD §3); the user's filename never enters the key.
    key = f"{ctx.user.id}/imports/{import_id}/original.{fmt}"
    if data is not None:
        storage.put(key, data)
        # A failed request or commit rolls the Import row back: take the file with it (no savepoints here).
        event.listen(ctx.db, "after_rollback", lambda _db: storage.delete_prefix(key.rsplit("/", 1)[0]), once=True)
    imp = Import(id=import_id, user_id=ctx.user.id, source_file_key=key, filename=filename, format=fmt,
                 size_bytes=size)
    ctx.db.add(imp)
    ctx.db.flush()
    task = enqueue(ctx.db, user_id=ctx.user.id, type="import", payload={"import_id": str(import_id), "text": text},
                   key=f"import:{import_id}")
    return ctx.respond(202, {"import": imp.as_dict(), "operation": operation(task)})
