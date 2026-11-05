"""Sandboxed upload parsing (app/core/parsing.py): subprocess round trip, limits, failures, PDF fallback."""

import io
import subprocess
import sys
from pathlib import Path

import docx
import pypdf
import pytest
import typst

from app.core import parsing


def pdf(body: str) -> bytes:
    return typst.compile(body.encode(), format="pdf")


def test_subprocess_extracts_pdf_and_docx():
    out = parsing.extract(pdf("Led the checkout migration"), "pdf", 10)
    assert out == {"text": "Led the checkout migration", "pages": 1, "extractor": "pdfium"}
    d, buf = docx.Document(), io.BytesIO()
    d.add_paragraph("Frontend Engineer")
    d.save(buf)
    assert parsing.extract(buf.getvalue(), "docx", 10)["text"] == "Frontend Engineer"


def test_page_limit_skips_extraction_and_reports_pages():
    out = parsing.extract(pdf("one" + "#pagebreak() more" * 10), "pdf", 10)
    assert (out["pages"], out["text"]) == (11, "")


def test_damaged_file_is_no_text_and_failures_raise(monkeypatch):
    assert parsing.extract(b"%PDF-1.7 not really", "pdf", 10)["text"] == ""
    with pytest.raises(parsing.ParseFailed):
        parsing.extract(pdf("hi"), "pdf", 10, timeout=0.001)
    monkeypatch.setattr(parsing.sys, "executable", "/usr/bin/false")  # child dies without output
    with pytest.raises(parsing.ParseFailed):
        parsing.extract(pdf("hi"), "pdf", 10)


def test_pdfium_first_and_garbled_text_falls_back_to_pypdf(monkeypatch):
    # PDFium keeps word spacing that pypdf loses on kerned fonts ("Engineered TracX", not "EngineeredT racX").
    data = pdf("Built a date picker used by 3 teams")
    assert parsing.parse(data, "pdf", 10)["extractor"] == "pdfium"
    monkeypatch.setattr(parsing, "_pdfium", lambda d, m: (1, "\x01\x02 ab"))
    out = parsing.parse(data, "pdf", 10)
    assert out["extractor"] == "pypdf" and "date picker used by 3 teams" in out["text"]
    monkeypatch.setattr(parsing, "_pdfium", lambda d, m: (1, ""))
    assert parsing.parse(data, "pdf", 10)["extractor"] == "pypdf"
    assert pypdf.PdfReader  # still the fallback library


def test_good_chars():
    assert parsing.good_chars("Rohan Iyer, 3 teams") == (16, 16)
    assert parsing.good_chars("\x01�ab") == (2, 5)


def run_bpf(prog, arch, nr):
    """Just enough of a classic-BPF interpreter for seccomp_program's opcodes."""
    pc = acc = 0
    while True:
        code, jt, jf, k = prog[pc]
        if code == 0x06:
            return k
        if code == 0x20:
            acc, pc = (arch if k == 4 else nr), pc + 1
        else:
            pc += 1 + (jt if (acc == k if code == 0x15 else acc >= k) else jf)


@pytest.mark.parametrize("machine", ["x86_64", "aarch64"])
def test_seccomp_program_blocks_sockets_only(machine):
    arch, blocked = parsing._SECCOMP_ARCH[machine]
    prog = parsing.seccomp_program(arch, blocked)
    eperm, allow, kill = 0x00050001, 0x7FFF0000, 0x80000000
    assert [run_bpf(prog, arch, nr) for nr in blocked] == [eperm] * 3
    assert run_bpf(prog, arch, 0x40000000 + 41) == eperm  # x32 ABI
    assert run_bpf(prog, arch, 0) == allow and run_bpf(prog, arch, 1) == allow
    assert run_bpf(prog, 0x40000003, 41) == kill  # another ABI (i386) is killed


@pytest.mark.skipif(sys.platform != "linux", reason="seccomp is Linux-only")
def test_child_cannot_open_sockets_on_linux():
    code = ("import sys, socket; sys.path.insert(0, sys.argv[1]); import parsing; parsing._no_network()\n"
            "for make in (socket.socket, lambda: socket.socket(socket.AF_UNIX), socket.socketpair):\n"
            "    try: make(); print('OPEN')\n"
            "    except PermissionError: print('blocked')")
    out = subprocess.run([sys.executable, "-I", "-c", code, str(Path(parsing.__file__).parent)],
                         capture_output=True, text=True, check=True)
    assert out.stdout.split() == ["blocked"] * 3


def test_pdf_spacing_tilde_becomes_ascii(monkeypatch):
    # Live test: "~300 PDFs/day" came out as "˜300" and reached facts and resumes that way.
    monkeypatch.setattr(parsing, "_pdfium", lambda d, m: (1, "saving ˜4 hours, ˜300 PDFs/day"))
    assert parsing.parse(b"%PDF", "pdf", 10)["text"] == "saving ~4 hours, ~300 PDFs/day"
