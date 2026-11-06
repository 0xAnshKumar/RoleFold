"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import ResumePaper, { shownSections } from "@/components/resume/ResumePaper";
import { BottomActionBar } from "@/components/shell/BottomActionBar";
import { StatusIcon } from "@/components/ui";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Disclosure } from "@/components/ui/Disclosure";
import { Icon } from "@/components/ui/Icon";
import { FactTag, ProofMark } from "@/components/ui/Proof";
import { Segmented } from "@/components/ui/Segmented";
import { ApiError, api, exportResume } from "@/lib/api";
import { resumeExtras, type Fact, type Resume, type StatementPatchResult } from "@/lib/mock";
import { TEMPLATES } from "@/lib/templates";
import { useAction } from "@/lib/useAction";
import { Problem } from "../Actions";
import s from "./editor.module.css";

const RANK: Record<Fact["responsibility"], number> = { Contributed: 1, Owned: 2, Led: 3, Managed: 4 };
const VERB_RANK: [RegExp, number][] = [
  [/^(managed|directed|headed)\b/i, 4],
  [/^(led|spearheaded|trained|mentored)\b/i, 3],
  [/^(owned|ran|built|delivered)\b/i, 2],
];

// Demo-mode stand-in for the server's code checks (TRD §7.4). Live mode uses PATCH /statements.
function mockValidate(text: string, fact: Fact): string | null {
  const nums = text.match(/\d+(\.\d+)?/g) ?? [];
  const bad = nums.find((n) => !fact.text.includes(n));
  if (bad) return `“${bad}” isn't in your confirmed fact ${fact.id}.`;
  const rank = VERB_RANK.find(([re]) => re.test(text.trim()))?.[1] ?? 1;
  if (rank > RANK[fact.responsibility])
    return `Your fact says you “${fact.responsibility.toLowerCase()}” to this. The verb claims more.`;
  return null;
}

/** Resume editor + preview (DESIGN.md 4.4, 3.13). `share` is the Share button and its drawer, placed in the page bar. */
export default function Editor({ resume, facts, demo, share }: { resume: Resume; facts: Fact[]; demo: boolean; share?: React.ReactNode }) {
  const initial = () => Object.fromEntries(resume.sections.flatMap((sec) => sec.lines.map((l) => [l.id, l.text])));
  const [lines, setLines] = useState(initial);
  const [saved, setSaved] = useState(initial); // last text the server checked, per line
  const [checking, setChecking] = useState<Record<string, boolean>>({});
  const [active, setActive] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string | null>>({});
  const [version, setVersion] = useState(resume.version);
  const [pane, setPane] = useState<"edit" | "preview">("edit"); // phone and tablet: one pane at a time
  // "code_checked_only": your edit passed the rule checks; the reviewer model hasn't re-read it.
  const [statuses, setStatuses] = useState(() => Object.fromEntries(resume.sections.flatMap((sec) => sec.lines.map((l) => [l.id, l.status]))));
  // The chosen template is saved on the resume (PATCH, live) and sent with each export, so the file matches the preview.
  const [templateId, setTemplateId] = useState(resume.templateId ?? TEMPLATES.find((t) => t.name === resume.template)?.id ?? "classic");
  const exp = useAction();
  const tpl = useAction();
  // "Save as a new fact": a blocked edit becomes a draft fact (POST /v1/facts) under the line's role or project.
  const draft = useAction();
  const router = useRouter();
  const [draftLine, setDraftLine] = useState<string | null>(null);
  const [drafted, setDrafted] = useState<Record<string, string>>({}); // line id -> text saved as a draft
  const saveAsFact = (id: string, owner: { type: string; id: string }) => {
    const text = lines[id].trim();
    setDraftLine(id);
    draft.run(id, async () => {
      if (!demo) {
        await api("/facts", { method: "POST", body: { owner_type: owner.type, owner_id: owner.id, description: text } });
        router.refresh(); // the nav's "N entries to confirm" count now includes this draft
      }
      setDrafted((d) => ({ ...d, [id]: lines[id] }));
    });
  };
  const pickTemplate = (id: string) => {
    const before = templateId;
    setTemplateId(id);
    setPicking(false);
    if (demo || id === before) return;
    tpl.run("save", async () => {
      try {
        await api(`/resumes/${resume.id}`, { method: "PATCH", body: { templateId: id } });
      } catch (err) {
        setTemplateId(before);
        throw new Error(`We couldn’t save the template: ${(err as Error).message}`);
      }
    });
  };
  const [picking, setPicking] = useState(false);
  const template = TEMPLATES.find((t) => t.id === templateId)!;
  const factOf = (id: string): Fact => facts.find((f) => f.id === id) ?? { id, role: "", text: "This fact is no longer confirmed.", responsibility: "Contributed", confirmedOn: "" };
  const blocked = Object.values(errors).filter(Boolean).length;
  const pending = Object.values(checking).some(Boolean);
  const extras = demo ? resumeExtras : (resume.extras ?? null);
  const shown = shownSections(resume, template, extras).length;
  const employers = resume.sections.filter((sec) => sec.org).length;
  const ranges = resume.sections.filter((sec) => sec.dates).length;
  const total = resume.sections.reduce((n, sec) => n + sec.lines.length, 0);

  async function check(id: string, text: string, fact: Fact) {
    if (demo) return setErrors((e) => ({ ...e, [id]: mockValidate(text, fact) }));
    if (text === saved[id] || checking[id]) return;
    setChecking((c) => ({ ...c, [id]: true }));
    try {
      const r = await api<StatementPatchResult>(`/resumes/${resume.id}/statements/${id}`, { method: "PATCH", body: { text, version } });
      setVersion(r.resume.version);
      setSaved((v) => ({ ...v, [id]: r.statement.text }));
      setStatuses((v) => ({ ...v, [id]: r.statement.status }));
      setErrors((e) => ({ ...e, [id]: r.statement.reasons.join(" ") || null }));
    } catch (err) {
      const stale = err instanceof ApiError && err.code === "VERSION_CONFLICT";
      if (stale && typeof err.details.version === "number") setVersion(err.details.version);
      setErrors((e) => ({
        ...e,
        [id]: stale ? "This resume changed in another tab. Click into the line and out again to check it." : `We couldn’t check this line: ${(err as Error).message}`,
      }));
    } finally {
      setChecking((c) => ({ ...c, [id]: false }));
    }
  }

  const downloadNote = demo
    ? "Sample data can’t be downloaded. Once your own profile is set up, downloads are free and unlimited."
    : pending
      ? "Checking your edit…"
      : blocked
        ? `Fix ${blocked} line${blocked > 1 ? "s" : ""} to download.`
        : exp.busy
          ? `Rendering in the ${template.name} template. This takes a few seconds.`
          : `Downloads use the ${template.name} template.`;

  return (
    <>
      <div className={s.bar}>
        <div className={s.barText}>
          <h1 className={s.title}>{resume.target || "Master resume"}</h1>
          <p className={s.meta}>
            {template.name} template{version ? ` · version ${version}` : ""}
          </p>
        </div>
        <div className={s.barActions}>
          {share}
          <BottomActionBar label="Download">
            {(["docx", "pdf"] as const).map((fmt) => (
              <Button
                key={fmt}
                variant={fmt === "pdf" ? "primary" : "secondary"}
                loading={exp.busy === fmt}
                disabled={demo || blocked > 0 || pending || !!exp.busy}
                aria-describedby="download-note"
                onClick={() => exp.run(fmt, () => exportResume(resume.id, fmt, templateId))}
              >
                {fmt === "pdf" ? "Download PDF" : "Word"}
              </Button>
            ))}
          </BottomActionBar>
        </div>
      </div>

      <div className={s.checks}>
        <ul className={s.checkList} aria-label="Checks">
          <li className={blocked ? s.bad : s.ok}>
            <StatusIcon name={blocked ? "alert" : "check"} />
            {blocked ? `${blocked} line${blocked > 1 ? "s" : ""} blocked` : total === 1 ? "1 line traced to a confirmed fact" : `All ${total} lines traced to confirmed facts`}
          </li>
          <li className={s.ok}>
            <StatusIcon name="check" /> Readable by screening software
          </li>
          {demo && (
            <li>
              <Icon name="info" size={16} /> 1 suggestion: add a result to your Pixelcraft line
            </li>
          )}
          {resume.freshness === "outdated" && (
            <li className={s.warn}>
              <StatusIcon name="half" /> Outdated: {resume.outdatedReason ?? "your facts changed since this version"}
            </li>
          )}
        </ul>
        <p id="download-note" className={s.note} role="status">
          {downloadNote}
        </p>
        <Problem error={exp.error} />
      </div>

      {!!resume.withheld?.length && (
        <Disclosure
          className={s.withheld}
          summary={`${resume.withheld.length} line${resume.withheld.length > 1 ? "s" : ""} held back because ${resume.withheld.length > 1 ? "they" : "it"} claimed more than your facts say`}
        >
          <ul className={s.withheldList}>
            {resume.withheld.map((w) => (
              <li key={w.id}>
                <p>{w.text}</p>
                <p className={s.note}>{w.reasons.join(" ")}</p>
              </li>
            ))}
          </ul>
        </Disclosure>
      )}

      <Segmented
        label="Show"
        hideLabel
        className={s.paneSwitch}
        options={[
          { value: "edit", label: "Edit" },
          { value: "preview", label: "Preview" },
        ]}
        value={pane}
        onChange={setPane}
      />

      <div className={s.split} data-pane={pane}>
        <section aria-label="Resume lines and their proof" className={s.lines}>
          <p className={s.note}>Tap or hover a line to see the fact it came from. Edit freely: every change is checked against that fact before you can download.</p>
          {resume.sections.map((sec) => (
            <section key={sec.lines[0]?.id ?? `${sec.title}-${sec.dates}`} className={s.group} aria-labelledby={`h-${sec.lines[0]?.id ?? sec.title}`}>
              <div className={s.groupHead}>
                <h2 id={`h-${sec.lines[0]?.id ?? sec.title}`} className={s.h2}>
                  {sec.title}
                </h2>
                {sec.org && (
                  <p className={s.note}>
                    {sec.org} · <span className={s.nums}>{sec.dates}</span>
                  </p>
                )}
              </div>
              <Card flush>
                {sec.lines.map((l, n) => {
                  const cited = (l.factIds?.length ? l.factIds : [l.factId]).map(factOf);
                  const fact = cited[0];
                  const err = errors[l.id];
                  const on = active === l.id;
                  return (
                    <div
                      key={l.id}
                      className={s.line}
                      data-active={on || undefined}
                      data-bad={err ? true : undefined}
                      onMouseEnter={() => setActive(l.id)}
                      onMouseLeave={() => setActive(null)}
                    >
                      <label className="sr-only" htmlFor={l.id}>
                        {sec.title}, line {n + 1}
                      </label>
                      <textarea
                        id={l.id}
                        rows={2}
                        value={lines[l.id]}
                        onFocus={() => setActive(l.id)}
                        onChange={(e) => setLines({ ...lines, [l.id]: e.target.value })}
                        onBlur={(e) => check(l.id, e.target.value, fact)}
                        aria-busy={!!checking[l.id]}
                        aria-invalid={!!err}
                        aria-describedby={`${l.id}-src`}
                        className={s.input}
                      />
                      <div id={`${l.id}-src`} className={s.src}>
                        {cited.map((f) => (
                          <div key={f.id} className={s.cite}>
                            <div className={s.citeHead}>
                              <FactTag id={f.id} date={f.confirmedOn.replace(/ \d{4}$/, "") || undefined} fact={f.text} linked={on} onClick={() => setActive(on ? null : l.id)} />
                              <span className={s.level}>{f.responsibility}</span>
                              {f === fact && (
                                <span className={s.state}>
                                  {checking[l.id] ? (
                                    "Checking…"
                                  ) : err ? null : (
                                    <>
                                      <StatusIcon name="check" />
                                      {statuses[l.id] === "code_checked_only" ? "Your edit passed the checks" : "Checked"}
                                    </>
                                  )}
                                </span>
                              )}
                            </div>
                            <p className={s.factText}>
                              <ProofMark on={on}>{f.text}</ProofMark>
                            </p>
                          </div>
                        ))}
                      </div>
                      {err && (
                        <div role="alert" className={s.blocked}>
                          <p className={s.blockedText}>
                            <StatusIcon name="alert" />
                            <span>
                              <b>Blocked.</b> {err}
                            </span>
                          </p>
                          <div className={s.blockedActions}>
                            <Button
                              size="sm"
                              variant="primary"
                              disabled={!!checking[l.id]}
                              onClick={() => {
                                setLines({ ...lines, [l.id]: l.text });
                                // Already what the server has (e.g. the failed check was a network error): nothing to re-check.
                                if (demo || l.text === saved[l.id]) setErrors({ ...errors, [l.id]: null });
                                else check(l.id, l.text, fact);
                              }}
                            >
                              Use the original line
                            </Button>
                            {sec.owner && (
                              <Button size="sm" loading={draft.busy === l.id} disabled={!!draft.busy || drafted[l.id] === lines[l.id]} onClick={() => saveAsFact(l.id, sec.owner!)}>
                                Save as a new fact to confirm
                              </Button>
                            )}
                          </div>
                          {drafted[l.id] === lines[l.id] && (
                            <p role="status" className={s.note}>
                              {demo ? "Sample data: nothing was sent." : "Saved as a draft fact."} Confirm it from <Link href="/onboarding?step=confirm">your queue</Link>, then use the line.
                            </p>
                          )}
                          {draftLine === l.id && <Problem error={draft.error} />}
                        </div>
                      )}
                    </div>
                  );
                })}
              </Card>
            </section>
          ))}
        </section>

        <section aria-label="Preview" className={s.previewCol}>
          <div className={s.previewHead}>
            <p className={s.note}>
              {picking ? (
                "Choose a template"
              ) : (
                <>
                  Preview · <b className={s.strong}>{template.name}</b> · {template.pages} page{template.pages === "1" ? "" : "s"}
                </>
              )}
            </p>
            <Button size="sm" aria-expanded={picking} onClick={() => setPicking(!picking)}>
              {picking ? "Back to preview" : "Change template"}
            </Button>
          </div>
          <Problem error={tpl.error} />

          {picking ? (
            <div className={s.gallery}>
              <div className={s.galleryGrid} role="radiogroup" aria-label="Resume templates">
                {TEMPLATES.map((t) => (
                  <button key={t.id} type="button" role="radio" aria-checked={t.id === templateId} className={s.tpl} disabled={!!tpl.busy} onClick={() => pickTemplate(t.id)}>
                    <span className={s.tplThumb} aria-hidden>
                      <span className={s.fit}>
                        <ResumePaper resume={resume} template={t} lines={lines} extras={extras} />
                      </span>
                      {t.id === templateId && (
                        <span className={s.tplCheck}>
                          <Icon name="check" size={16} />
                        </span>
                      )}
                    </span>
                    <span className={s.tplName}>
                      {t.name}
                      {t.id === templateId && <span className="sr-only"> (selected)</span>}
                    </span>
                    <span className={s.tplFor}>{t.bestFor}</span>
                    <span className={s.tplMeta}>Modelled on: {t.modelledOn}</span>
                  </button>
                ))}
              </div>
              <p className={s.note}>
                Every template is single-column with standard headings and real text, so screening software reads them all the same way. Pick the one that suits your field.
              </p>
            </div>
          ) : (
            <>
              <div className={s.stage}>
                <div className={s.sheet}>
                  <div className={s.fit}>
                    <ResumePaper resume={resume} template={template} lines={lines} activeLine={active} extras={extras} />
                  </div>
                </div>
              </div>
              <p className={s.note}>
                <b className={s.strong}>Read back like screening software:</b> {demo ? "Name, email, phone, link" : extras?.contact ? "Name, contact details" : "Name"} · {shown} section
                {shown === 1 ? "" : "s"} · {employers} employer{employers === 1 ? "" : "s"} · {ranges} date range{ranges === 1 ? "" : "s"}. <span className={s.okText}>Nothing lost.</span>
              </p>
            </>
          )}
        </section>
      </div>
    </>
  );
}
