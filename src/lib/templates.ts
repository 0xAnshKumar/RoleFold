// The six resume templates (PRD §5.3, owner request 2026-10-11).
// All share one ATS-safe structure: single column, standard headings, real text, contact in the body,
// no tables / text boxes / icons / header-footer content. They differ only in type, spacing and section order.
// Defined once in shared/resume-templates.json, which api/app/render.py also loads.
// `pdfFont` is the open font embedded in Typst PDFs. DOCX names a system font every Word install has instead
// (see render.py): Tinos→Times New Roman, Carlito→Calibri, Arimo→Arial are metric-compatible;
// Libertinus Serif→Cambria is only the nearest serif, so that template's DOCX can break lines differently.
// `previewFont` is the browser stand-in.

import templates from "../../shared/resume-templates.json";

export type SectionKey = "summary" | "skillsSummary" | "experience" | "projects" | "education" | "skills" | "achievements" | "publications";

export type Template = {
  id: string;
  name: string;
  modelledOn: string;
  bestFor: string;
  order: SectionKey[];
  pdfFont: string;
  previewFont: string;
  nameAlign: "left" | "center";
  headingStyle: "rule" | "smallcaps-rule" | "accent" | "plain-bold";
  accent?: string; // one muted colour at most, never carrying meaning
  density: "regular" | "compact";
  pages: string;
};

export const TEMPLATES = templates as Template[];

export const HEADINGS: Record<SectionKey, string> = {
  summary: "Summary",
  skillsSummary: "Skills summary",
  experience: "Experience",
  projects: "Projects",
  education: "Education",
  skills: "Skills",
  achievements: "Achievements",
  publications: "Publications",
};
