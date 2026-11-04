"""Sandboxed upload parsing (app/core/parsing.py): subprocess round trip, limits, failures, PDF fallback."""

import io

import docx
import pypdf
import pytest
import typst

from app.core import parsing


def pdf(body: str) -> bytes:
    return typst.compile(body.encode(), format="pdf")


def test_subprocess_extracts_pdf_and_docx():
    out = parsing.extract(pdf("Led the checkout migration"), "pdf", 10)
    assert out == {"text": "Led the checkout migration", "pages": 1, "extractor": "pypdf"}
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


def test_garbled_pypdf_text_falls_back_to_pdfium(monkeypatch):
    data = pdf("Built a date picker used by 3 teams")
    assert parsing.parse(data, "pdf", 10)["extractor"] == "pypdf"
    monkeypatch.setattr(pypdf.PageObject, "extract_text", lambda self, *a, **k: "\x01\x02 ab")
    out = parsing.parse(data, "pdf", 10)
    assert out["extractor"] == "pdfium" and "date picker used by 3 teams" in out["text"]
    monkeypatch.setattr(pypdf.PageObject, "extract_text", lambda self, *a, **k: "")
    assert parsing.parse(data, "pdf", 10)["extractor"] == "pdfium"


def test_good_chars():
    assert parsing.good_chars("Rohan Iyer, 3 teams") == (16, 16)
    assert parsing.good_chars("\x01�ab") == (2, 5)
