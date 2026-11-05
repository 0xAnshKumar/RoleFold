"""Sandboxed text extraction for untrusted PDF/DOCX uploads (TRD §5.1 step 2, §12.1).

`extract` (API process) runs this file as a separate `python -I` process: bytes in on stdin, JSON out on
stdout, a wall-clock timeout here, and CPU/memory limits the child sets on itself before reading any input.
The child runs this file by path without the app package, so module level imports only the stdlib.

No network (Linux): before reading input the child installs a seccomp filter that makes socket(), socketpair()
and io_uring_setup() fail, so a parser exploit can reach neither the network nor local sockets (the DB, the
Docker socket). It needs no privileges and works under Docker's default seccomp profile, which blocks
`unshare --net` (checked: "unshare failed: Operation not permitted"). On Linux the child refuses to parse if
the filter can't be installed. Other OSes (macOS dev) parse without it; never deploy on them.
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
    """Runs in the child. PDF: PDFium first (it keeps word spacing pypdf loses on kerned fonts: "Engineered
    TracX", not "EngineeredT racX"); if its text is empty or garbled, pypdf, keeping the better one."""
    if fmt == "docx":
        import docx

        d = docx.Document(io.BytesIO(data))
        cells = [c.text for t in d.tables for row in t.rows for c in row.cells]
        return {"text": "\n".join([p.text for p in d.paragraphs] + cells), "pages": None, "extractor": "python-docx"}
    pages, text = _pdfium(data, max_pages)
    text = text.replace("\u02dc", "~")  # PDF fonts often map "~" to the spacing tilde: "\u02dc300 PDFs/day"
    good, total = good_chars(text)
    if (pages or 0) > max_pages or (good and good >= GOOD_SHARE * total):
        return {"text": text, "pages": pages, "extractor": "pdfium"}
    alt_pages, alt = _pypdf(data, max_pages)
    alt = alt.replace("\u02dc", "~")
    if (alt_pages or 0) > max_pages or good_chars(alt)[0] > good:
        return {"text": alt, "pages": alt_pages, "extractor": "pypdf"}
    return {"text": text, "pages": pages, "extractor": "pdfium"}


def _limit() -> None:
    import resource

    for res, value in ((resource.RLIMIT_AS, MEMORY_BYTES), (resource.RLIMIT_CPU, TIMEOUT_S)):
        try:
            resource.setrlimit(res, (value, value))
        except (ValueError, OSError):  # unsupported on this OS
            pass


# platform.machine() -> (AUDIT_ARCH_*, syscall numbers of socket, socketpair, io_uring_setup)
_SECCOMP_ARCH = {"x86_64": (0xC000003E, (41, 53, 425)), "aarch64": (0xC00000B7, (198, 199, 425))}


def seccomp_program(arch: int, blocked: tuple[int, ...]) -> list[tuple[int, int, int, int]]:
    """Classic BPF (code, jt, jf, k): other ABIs are killed, x32 calls and `blocked` get EPERM, the rest run."""
    ld_arch, ld_nr, jeq, jge, ret = (0x20, 0, 0, 4), (0x20, 0, 0, 0), 0x15, 0x35, 0x06
    checks = [(jge, 0x40000000), *((jeq, nr) for nr in blocked)]  # nr >= 0x40000000: x86_64 x32 ABI
    n = len(checks)
    return [ld_arch, (jeq, 1, 0, arch), (ret, 0, 0, 0x80000000), ld_nr,  # 0x80000000 = SECCOMP_RET_KILL_PROCESS
            *((code, n - i, 0, k) for i, (code, k) in enumerate(checks)),
            (ret, 0, 0, 0x7FFF0000), (ret, 0, 0, 0x00050000 | 1)]  # SECCOMP_RET_ALLOW, SECCOMP_RET_ERRNO | EPERM


def _no_network() -> None:
    import ctypes
    import platform

    class Insn(ctypes.Structure):
        _fields_ = [("code", ctypes.c_ushort), ("jt", ctypes.c_ubyte), ("jf", ctypes.c_ubyte), ("k", ctypes.c_uint32)]

    class Prog(ctypes.Structure):
        _fields_ = [("len", ctypes.c_ushort), ("filter", ctypes.POINTER(Insn))]

    insns = [Insn(*i) for i in seccomp_program(*_SECCOMP_ARCH[platform.machine()])]
    prog = Prog(len(insns), (Insn * len(insns))(*insns))
    libc = ctypes.CDLL(None, use_errno=True)
    ul = ctypes.c_ulong
    # PR_SET_NO_NEW_PRIVS (38) lets an unprivileged process install a filter; PR_SET_SECCOMP (22), mode FILTER (2).
    if libc.prctl(38, ul(1), ul(0), ul(0), ul(0)) or libc.prctl(22, ul(2), ctypes.byref(prog), ul(0), ul(0)):
        raise OSError(ctypes.get_errno(), "seccomp filter not installed")


if __name__ == "__main__":
    _limit()
    if sys.platform == "linux":
        _no_network()  # an exception here exits non-zero: the parent raises ParseFailed, nothing is parsed
    fmt, max_pages = sys.argv[1], int(sys.argv[2])
    try:
        result = parse(sys.stdin.buffer.read(), fmt, max_pages)
    except Exception:  # noqa: BLE001 - any parser failure on untrusted input is "no readable text"
        result = {"text": "", "pages": None, "extractor": None}
    sys.stdout.write(json.dumps(result))
