import { resumeExtras, type Resume } from "@/lib/mock";
import { HEADINGS, type SectionKey, type Template } from "@/lib/templates";
import s from "./resumePaper.module.css";

const NO_EXTRAS = { contact: "", summary: "", skillsSummary: [], projects: [], education: [], skills: [], achievements: [], publications: [], languages: [] };

/** The template's sections that have content, in its order (the export leaves empty ones out too: api/app/render.py). */
export function shownSections(resume: Resume, template: Template, extras: typeof resumeExtras | null) {
  const x = extras ?? NO_EXTRAS;
  const summary = resume.sections.some((sec) => sec.title === "Summary" && !sec.org && sec.lines.length) || !!x.summary;
  const has: Record<SectionKey, boolean> = {
    summary,
    skillsSummary: x.skillsSummary.length > 0,
    experience: resume.sections.some((sec) => sec.org !== undefined),
    projects: x.projects.length > 0,
    education: x.education.length > 0,
    skills: x.skills.length > 0,
    achievements: x.achievements.length > 0,
    publications: x.publications.length > 0,
    languages: x.languages.length > 0,
  };
  return template.order.filter((key) => has[key]);
}

/**
 * One resume, rendered in one template. Plain, single-column, real text: the brand never styles it.
 * ponytail: HTML stand-in for the Typst preview (eng D5); the Typst/DOCX templates read the same Template record.
 */
export default function ResumePaper({
  resume,
  template,
  lines,
  activeLine,
  extras = resumeExtras,
}: {
  resume: Resume;
  template: Template;
  lines?: Record<string, string>;
  activeLine?: string | null;
  /** Contact, summary, skills, education… Null until the API serves them: only experience is shown. */
  extras?: typeof resumeExtras | null;
}) {
  const x = extras ?? NO_EXTRAS;
  // Roles and career breaks carry `org` (possibly ""); the Summary and project sections don't.
  const roles = resume.sections.filter((sec) => sec.org !== undefined);
  const text = (id: string, fallback: string) => lines?.[id] ?? fallback;
  // The Summary section's lines are editable, so the preview follows the edits.
  const summaryLines = resume.sections.find((sec) => sec.title === "Summary" && !sec.org)?.lines;
  const summary = summaryLines?.length ? summaryLines.map((l) => text(l.id, l.text)).join(" ") : x.summary;

  const section: Record<SectionKey, React.ReactNode> = {
    summary: <p>{summary}</p>,
    skillsSummary: (
      <ul className={s.list}>
        {x.skillsSummary.map((k) => (
          <li key={k.area}>
            <b>{k.area}:</b> {k.proof.replace(/ \(F-\d+\)$/, "")}
          </li>
        ))}
      </ul>
    ),
    experience: roles.map((r) => (
      <div key={r.lines[0]?.id ?? `${r.title}-${r.dates}`} className={s.entry}>
        <p className={s.entryHead}>
          <b>{r.title}</b>
          <span>{r.dates}</span>
        </p>
        <p className={s.org}>{r.org}</p>
        <ul className={s.list}>
          {r.lines.map((l) => (
            <li key={l.id} className={activeLine === l.id ? s.active : undefined}>
              {text(l.id, l.text)}
            </li>
          ))}
        </ul>
      </div>
    )),
    projects: x.projects.map((p) => (
      <div key={p.name} className={s.entry}>
        <p className={s.entryHead}>
          <span>
            <b>{p.name}</b>
            {p.stack && (
              <>
                {" "}
                | <i>{p.stack}</i>
              </>
            )}
          </span>
        </p>
        <ul className={s.list}>
          <li>{p.line}</li>
        </ul>
      </div>
    )),
    education: x.education.map((e, i) => (
      <div key={`${i}-${e.degree}`} className={s.entry}>
        <p className={s.entryHead}>
          <b>{e.org}</b>
          <span>{e.dates}</span>
        </p>
        <p className={s.org}>
          {[e.degree, e.detail].filter(Boolean).join(" · ")}
        </p>
      </div>
    )),
    skills: (
      <ul className={s.plain}>
        {x.skills.map((k) => (
          <li key={k.group || k.items}>
            {k.group && <b>{k.group}: </b>}
            {k.items}
          </li>
        ))}
      </ul>
    ),
    achievements: (
      <ul className={s.list}>
        {x.achievements.map((a) => (
          <li key={a}>{a}</li>
        ))}
      </ul>
    ),
    publications: (
      <ul className={s.list}>
        {x.publications.map((p) => (
          <li key={p}>{p}</li>
        ))}
      </ul>
    ),
    languages: x.languages.map((l) => <p key={l}>{l}</p>),
  };

  return (
    <article
      className={`${s.paper} ${s[template.headingStyle.replace("-", "_")]} ${template.density === "compact" ? s.compact : ""}`}
      style={{ fontFamily: template.previewFont, ["--accent" as string]: template.accent ?? "#111" }}
      aria-label={`${resume.name}, ${template.name} template`}
    >
      <header className={s.head} style={{ textAlign: template.nameAlign }}>
        <h3 className={s.name}>{resume.name}</h3>
        {x.contact && <p className={s.contact}>{x.contact}</p>}
      </header>
      {shownSections(resume, template, extras).map((key) => (
        <section key={key} className={s.section}>
          <h4 className={s.h}>{HEADINGS[key]}</h4>
          {section[key]}
        </section>
      ))}
    </article>
  );
}
