"""Sandboxed text extraction for untrusted PDF/DOCX uploads (TRD §5.1 step 2, §12.1).

`extract` (API process) runs this file as a separate `python -I` process: bytes in on stdin, JSON out on
stdout, a wall-clock timeout here, and CPU/memory limits the child sets on itself before reading any input.
The child runs this file by path without the app package, so module level imports only the stdlib.
shortcut: no network namespace or seccomp (the child just never opens sockets); use a container/nsjail at deploy.
"""

import io
import json
import subprocess
import sys
import unicodedata

TIMEOUT_S = 15
MEMORY_BYTES = 1024**3  # RLIMIT_AS; macOS ignores it, Linux enforces it
GOOD_SHARE = 0.95  # pypdf text below this share of real characters counts as garbled


class ParseFailed(Exception):
    """The parser process timed out, crashed or hit a resource limit."""


def extract(data: bytes, fmt: str, max_pages: int, timeout: float = TIMEOUT_S) -> dict:
    """{"text", "pages" (PDF only, else None), "extractor"}; text is "" when nothing is readable."""
    try:
        out = subprocess.run([sys.executable, "-I", __file__, fmt, str(max_pages)], input=data,
                             capture_output=True, timeout=timeout, env={}, check=True)
        return json.loads(out.stdout)
    except (OSError, subprocess.SubprocessError, ValueError) as e:
        raise ParseFailed(type(e).__name__) from None


def good_chars(text: str) -> tuple[int, int]:
    """(real characters, all non-space characters). Glyph codes from fonts without a Unicode map come
    out as control, private-use or replacement characters.
    shortcut: mojibake made of ordinary letters passes; add a dictionary-word check if that shows up."""
    chars = [c for c in text if not c.isspace()]
    bad = sum(c == "�" or unicodedata.category(c) in ("Cc", "Co", "Cn", "Cs") for c in chars)
    return len(chars) - bad, len(chars)


def _pypdf(data: bytes, max_pages: int) -> tuple[int | None, str]:
    import pypdf

    try:
        reader = pypdf.PdfReader(io.BytesIO(data))
        pages = len(reader.pages)
        return pages, "" if pages > max_pages else "\n".join(p.extract_text() or "" for p in reader.pages)
    except Exception:  # noqa: BLE001 - malformed input: let the second extractor try
        return None, ""


def _pdfium(data: bytes, max_pages: int) -> tuple[int | None, str]:
    import pypdfium2

    try:
        pdf = pypdfium2.PdfDocument(data)
        pages = len(pdf)
        return pages, "" if pages > max_pages else "\n".join(p.get_textpage().get_text_bounded() for p in pdf)
    except Exception:  # noqa: BLE001
        return None, ""


def parse(data: bytes, fmt: str, max_pages: int) -> dict:
    """Runs in the child. PDF: pypdf first; if its text is empty or garbled, PDFium, keeping the better one."""
    if fmt == "docx":
        import docx

        d = docx.Document(io.BytesIO(data))
        cells = [c.text for t in d.tables for row in t.rows for c in row.cells]
        return {"text": "\n".join([p.text for p in d.paragraphs] + cells), "pages": None, "extractor": "python-docx"}
    pages, text = _pypdf(data, max_pages)
    good, total = good_chars(text)
    if (pages or 0) > max_pages or (good and good >= GOOD_SHARE * total):
        return {"text": text, "pages": pages, "extractor": "pypdf"}
    alt_pages, alt = _pdfium(data, max_pages)
    if (alt_pages or 0) > max_pages or good_chars(alt)[0] > good:
        return {"text": alt, "pages": alt_pages, "extractor": "pdfium"}
    return {"text": text, "pages": pages, "extractor": "pypdf"}


def _limit() -> None:
    import resource

    for res, value in ((resource.RLIMIT_AS, MEMORY_BYTES), (resource.RLIMIT_CPU, TIMEOUT_S)):
        try:
            resource.setrlimit(res, (value, value))
        except (ValueError, OSError):  # unsupported on this OS
            pass


if __name__ == "__main__":
    _limit()
    fmt, max_pages = sys.argv[1], int(sys.argv[2])
    try:
        result = parse(sys.stdin.buffer.read(), fmt, max_pages)
    except Exception:  # noqa: BLE001 - any parser failure on untrusted input is "no readable text"
        result = {"text": "", "pages": None, "extractor": None}
    sys.stdout.write(json.dumps(result))
