"""Resume rendering (TRD §7.5): the six templates of shared/resume-templates.json, PDF via Typst, DOCX via python-docx.

Every template shares one ATS-safe structure: single column, standard headings, real text, name and
contact in the body (never header/footer), no tables, text boxes, images or icons. Templates differ only
in font, spacing, heading style and section order. Text is passed to Typst as JSON data (sys.inputs),
so statements are never interpreted as markup (I-5). Pure code: no model, no usage (I-12).
"""

import io
import json
from dataclasses import dataclass
from pathlib import Path

import docx
import typst
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Inches, Pt, RGBColor

RENDERER_VERSION = "render-1"


@dataclass(frozen=True)
class Template:
    id: str
    name: str
    best_for: str
    order: tuple[str, ...]
    font: str
    name_align: str  # left | center
    heading: str  # rule | smallcaps-rule | accent | plain-bold
    density: str  # regular | compact
    accent: str | None = None


# The single definition, shared with src/lib/templates.ts. Missing or malformed fails at import.
TEMPLATES_JSON = Path(__file__).resolve().parents[2] / "shared" / "resume-templates.json"


def load_templates(path: Path = TEMPLATES_JSON) -> dict[str, Template]:
    if not path.is_file():
        raise RuntimeError(f"resume templates not found at {path} (the repo-root shared/ dir must ship with the API)")
    return {t["id"]: Template(t["id"], t["name"], t["bestFor"], tuple(t["order"]), t["pdfFont"], t["nameAlign"],
                              t["headingStyle"], t["density"], t.get("accent"))
            for t in json.loads(path.read_text())}


TEMPLATES = load_templates()
HEADINGS = {
    "summary": "Summary", "skillsSummary": "Skills summary", "experience": "Experience", "projects": "Projects",
    "education": "Education", "skills": "Skills", "achievements": "Achievements", "publications": "Publications",
    "languages": "Languages",
}
# PDF: Tinos/Carlito/Arimo (OFL) are vendored in api/fonts and system fonts are ignored, so every machine
# renders the same PDF; Libertinus Serif is bundled with Typst.
# DOCX does not embed fonts. It names a font every Word install has: Times New Roman, Calibri and Arial
# are metric-compatible with Tinos, Carlito and Arimo; Cambria is only the nearest serif to Libertinus,
# so the Compact Tech DOCX may break lines differently from its PDF.
FONT_DIR = Path(__file__).resolve().parent.parent / "fonts"
FONTS = {"Tinos": [], "Carlito": [], "Arimo": [], "Libertinus Serif": []}
DOCX_FONTS = {"Tinos": "Times New Roman", "Carlito": "Calibri", "Arimo": "Arial", "Libertinus Serif": "Cambria"}
DENSITY = {"regular": {"size": 10.5, "margin": 0.75, "gap": 6}, "compact": {"size": 10, "margin": 0.5, "gap": 3}}
CONTENT_TYPES = {"pdf": "application/pdf",
                 "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document"}


def ordered(doc: dict, t: Template) -> list[tuple[str, dict]]:
    """(heading, section) in template order; sections with no content are left out."""
    secs = doc["sections"]
    return [(HEADINGS[k], secs[k]) for k in t.order if secs.get(k) and (secs[k].get("lines") or secs[k].get("entries"))]


# ---------------------------------------------------------------- PDF (Typst)

TYPST = r"""
#let d = json(bytes(sys.inputs.data))
#let s = d.style
#set page(paper: "a4", margin: s.margin * 1in, header: none, footer: none)
#set text(font: s.fonts, size: s.size * 1pt, lang: "en", hyphenate: false, ligatures: false)
#set par(justify: false, leading: 0.55em, spacing: s.gap * 1pt)
#set list(indent: 0.6em, body-indent: 0.5em, spacing: s.gap * 0.6pt)
#let accent = if s.accent == none { black } else { rgb(s.accent) }
#show heading: it => {
  v(s.gap * 1.2pt)
  if s.heading == "smallcaps-rule" { block(below: 3pt, text(size: 1.1em, weight: "bold", smallcaps(it.body))) }
  else if s.heading == "accent" { block(below: 4pt, text(size: 1.1em, weight: "bold", fill: accent, it.body)) }
  else { block(below: 3pt, text(size: 1.1em, weight: "bold", it.body)) }
  if s.heading in ("rule", "smallcaps-rule") { block(above: 0pt, below: s.gap * 1pt, line(length: 100%, stroke: 0.5pt)) }
}
#align(if s.name_align == "center" { center } else { left })[
  #text(size: 1.9em, weight: "bold", d.name) \
  #if d.headline != "" [#d.headline \ ]
  #d.contact.join("  |  ")
]
#for sec in d.sections [
  #heading(level: 1, sec.heading)
  #for line in sec.at("lines", default: ()) [#par(line)]
  #for e in sec.at("entries", default: ()) [
    #block(below: s.gap * 0.8pt)[
      #text(weight: "bold", e.title)#if e.org != "" [, #e.org]#if e.dates != "" [ #h(1fr) #e.dates]
    ]
    #for b in e.bullets [- #b
    ]
  ]
]
"""


def _style(t: Template) -> dict:
    return {"fonts": FONTS[t.font] + [t.font, "Libertinus Serif"], "name_align": t.name_align,
            "heading": t.heading, "accent": t.accent, **DENSITY[t.density]}


def render_pdf(doc: dict, t: Template) -> bytes:
    data = {"name": doc["name"], "headline": doc.get("headline") or "", "contact": doc["contact"],
            "style": _style(t), "sections": [{"heading": h, **sec} for h, sec in ordered(doc, t)]}
    return typst.compile(TYPST.encode(), format="pdf", sys_inputs={"data": json.dumps(data)},
                         font_paths=[str(FONT_DIR)], ignore_system_fonts=True)


# ---------------------------------------------------------------- DOCX (python-docx)


def _rule_below(paragraph) -> None:
    """A bottom border on the heading paragraph: a line, not a shape or table."""
    border = OxmlElement("w:pBdr")
    bottom = OxmlElement("w:bottom")
    for k, v in {"w:val": "single", "w:sz": "4", "w:space": "1", "w:color": "000000"}.items():
        bottom.set(qn(k), v)
    border.append(bottom)
    paragraph._p.get_or_add_pPr().append(border)


def _set_font(rfonts, font: str) -> None:
    """All four rFonts slots (ascii, hAnsi, east-asian, complex script), and no theme fonts, so Word
    never substitutes another face for any script."""
    for k in ("ascii", "hAnsi", "eastAsia", "cs"):
        rfonts.set(qn(f"w:{k}"), font)
    for k in ("asciiTheme", "hAnsiTheme", "eastAsiaTheme", "cstheme"):
        rfonts.attrib.pop(qn(f"w:{k}"), None)


def render_docx(doc: dict, t: Template) -> bytes:
    dens = DENSITY[t.density]
    font = DOCX_FONTS[t.font]
    out = docx.Document()
    for section in out.sections:
        section.left_margin = section.right_margin = section.top_margin = section.bottom_margin = Inches(dens["margin"])
    normal = out.styles["Normal"]
    normal.font.size = Pt(dens["size"])
    normal.paragraph_format.space_after = Pt(dens["gap"] * 0.5)
    _set_font(out.styles.element.find(qn("w:docDefaults")).find(f"{qn('w:rPrDefault')}/{qn('w:rPr')}/{qn('w:rFonts')}"),
              font)
    for name in ("Normal", "Heading 1", "List Bullet"):
        _set_font(out.styles[name].element.get_or_add_rPr().get_or_add_rFonts(), font)
    h1 = out.styles["Heading 1"]
    h1.font.size, h1.font.bold, h1.font.small_caps = Pt(dens["size"] * 1.15), True, t.heading == "smallcaps-rule"
    h1.font.color.rgb = RGBColor.from_string(t.accent.lstrip("#")) if t.accent else RGBColor(0, 0, 0)
    h1.paragraph_format.space_before, h1.paragraph_format.space_after = Pt(dens["gap"] * 1.5), Pt(dens["gap"] * 0.5)
    align = WD_ALIGN_PARAGRAPH.CENTER if t.name_align == "center" else WD_ALIGN_PARAGRAPH.LEFT

    p = out.add_paragraph()
    p.alignment = align
    run = p.add_run(doc["name"])
    run.bold, run.font.size = True, Pt(dens["size"] * 1.9)
    _set_font(run._r.get_or_add_rPr().get_or_add_rFonts(), font)
    for line in [doc.get("headline") or "", "  |  ".join(doc["contact"])]:
        if line:
            out.add_paragraph(line).alignment = align

    for heading, sec in ordered(doc, t):
        h = out.add_paragraph(heading, style="Heading 1")
        if t.heading in ("rule", "smallcaps-rule"):
            _rule_below(h)
        for line in sec.get("lines") or []:
            out.add_paragraph(line)
        for e in sec.get("entries") or []:
            p = out.add_paragraph()
            p.add_run(e["title"]).bold = True
            p.add_run("".join([f", {e['org']}" if e["org"] else "", f"    {e['dates']}" if e["dates"] else ""]))
            for b in e["bullets"]:
                out.add_paragraph(b, style="List Bullet")
    buf = io.BytesIO()
    out.save(buf)
    return buf.getvalue()


def render(doc: dict, template_id: str, fmt: str) -> bytes:
    t = TEMPLATES[template_id]
    return render_pdf(doc, t) if fmt == "pdf" else render_docx(doc, t)
