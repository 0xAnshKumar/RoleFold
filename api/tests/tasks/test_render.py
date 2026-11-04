"""TRD §7.5/§7.6 round trip: every template renders to PDF and DOCX whose extracted text has the
headings in template order, the name and contact in the body, and every statement verbatim."""

import io

import docx
import pypdf
import pytest

from app.render import HEADINGS, TEMPLATES, render

STATEMENTS = {
    "summary": "Frontend engineer focused on React and web performance.",
    "experience": "Led the checkout migration from AngularJS to React, cutting the bundle from 1.8 MB to 640 KB "
                  "and keeping *markup* like #this and [that] as plain text.",
    "projects": "Built an open-source date picker used by 3 internal teams.",
    "education": "Thesis on incremental rendering.",
    "skills": "React, TypeScript, Jest",
    "achievements": "Won the 2019 college hackathon.",
    "publications": "Iyer R. Incremental rendering on low-end devices. 2020.",
    "languages": "English (Fluent), Hindi (Native)",
    "skillsSummary": "Skills: React, TypeScript. Moved from support into frontend work.",
}
DOC = {
    "name": "Rohan Iyer", "headline": "Frontend engineer", "contact": ["rohan@example.com", "Bengaluru"],
    "sections": {
        "summary": {"lines": [STATEMENTS["summary"]]},
        "skillsSummary": {"lines": [STATEMENTS["skillsSummary"]]},
        "experience": {"entries": [{"title": "Frontend Engineer", "org": "Northwind Commerce, Bengaluru",
                                    "dates": "Jul 2021 – Present", "bullets": [STATEMENTS["experience"]]}]},
        "projects": {"entries": [{"title": "Datepick", "org": "", "dates": "", "bullets": [STATEMENTS["projects"]]}]},
        "education": {"entries": [{"title": "B.Tech", "org": "PES University", "dates": "2015 – 2019",
                                   "bullets": [STATEMENTS["education"]]}]},
        "skills": {"lines": [STATEMENTS["skills"]]},
        "achievements": {"lines": [STATEMENTS["achievements"]]},
        "publications": {"lines": [STATEMENTS["publications"]]},
        "languages": {"lines": [STATEMENTS["languages"]]},
    },
}


def text_of(data: bytes, fmt: str) -> list[str]:
    if fmt == "pdf":
        reader = pypdf.PdfReader(io.BytesIO(data))
        return [line for page in reader.pages for line in page.extract_text().splitlines()]
    return [p.text for p in docx.Document(io.BytesIO(data)).paragraphs]


@pytest.mark.parametrize("fmt", ["pdf", "docx"])
@pytest.mark.parametrize("template_id", list(TEMPLATES))
def test_round_trip(template_id, fmt):
    t = TEMPLATES[template_id]
    lines = text_of(render(DOC, template_id, fmt), fmt)
    flat = " ".join(" ".join(lines).split())
    headings = [HEADINGS[k] for k in t.order]
    found = [line.strip() for line in lines if line.strip() in HEADINGS.values()]
    assert found == headings
    assert lines[0].strip() == "Rohan Iyer" and "rohan@example.com" in flat  # contact in the body
    for key in t.order:
        assert " ".join(STATEMENTS[key].split()) in flat, key
    for key in set(STATEMENTS) - set(t.order):  # sections outside the template are not rendered
        assert STATEMENTS[key] not in flat, key


def test_docx_is_single_column_with_no_tables_or_header_content():
    d = docx.Document(io.BytesIO(render(DOC, "modern", "docx")))
    assert d.tables == [] and len(d.sections) == 1
    assert not any(p.text for s in d.sections for p in (*s.header.paragraphs, *s.footer.paragraphs))
    assert not d.inline_shapes


def test_templates_load_from_the_shared_json_in_order():
    from app.render import TEMPLATES_JSON, load_templates

    assert list(load_templates()) == ["classic", "tech", "modern", "campus", "combination", "academic"]
    with pytest.raises(RuntimeError, match="resume templates not found"):
        load_templates(TEMPLATES_JSON.with_name("missing.json"))


W = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"
SLOTS = ("ascii", "hAnsi", "eastAsia", "cs")


@pytest.mark.parametrize("template_id", list(TEMPLATES))
def test_docx_names_the_mapped_system_font_everywhere(template_id):
    """No embedding: every rFonts (defaults, styles, runs) names the Word font for the template's PDF font."""
    from app.render import DOCX_FONTS

    font = DOCX_FONTS[TEMPLATES[template_id].font]
    d = docx.Document(io.BytesIO(render(DOC, template_id, "docx")))
    used = {p.style.style_id for p in d.paragraphs}
    roots = [d.styles.element.find(f"{W}docDefaults"), *(s.element for s in d.styles if s.style_id in used | {"Normal"})]
    rfonts = [f for root in roots for f in root.iter(f"{W}rFonts")] + list(d.element.body.iter(f"{W}rFonts"))
    assert rfonts
    for f in rfonts:
        assert {k: f.get(f"{W}{k}") for k in SLOTS} == dict.fromkeys(SLOTS, font)
        assert not [a for a in f.attrib if a.endswith(("Theme", "theme"))]
    for p in d.paragraphs:  # every run gets its font from its own rFonts or its paragraph style chain
        style = p.style
        while style is not None and style.element.find(f"{W}rPr/{W}rFonts") is None:
            style = style.base_style
        for run in p.runs:
            assert run._r.find(f"{W}rPr/{W}rFonts") is not None or style is not None
