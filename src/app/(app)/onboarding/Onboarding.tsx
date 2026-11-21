"use client";

import { useRouter } from "next/navigation";
import { AnimatePresence, useReducedMotion } from "motion/react";
import * as m from "motion/react-m";
import { Fragment, useState, useTransition } from "react";
import ResumePaper from "@/components/resume/ResumePaper";
import { BottomActionBar } from "@/components/shell/BottomActionBar";
import { Button, buttonClass } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Checkbox } from "@/components/ui/Choice";
import { ChipRow, FilterChip } from "@/components/ui/Chip";
import { Input, Select, Textarea } from "@/components/ui/Field";
import { Icon } from "@/components/ui/Icon";
import { StageList, type StageState } from "@/components/ui/Progress";
import { Skeleton, SkeletonRegion, SkeletonText } from "@/components/ui/Skeleton";
import { ApiError, api, waitFor, type Operation } from "@/lib/api";
import { fade } from "@/lib/motion";
import { naturalName } from "@/lib/names";
import { LEVELS, type Achievement, type Draft, type DraftGroup, type Education, type Fact, type Goals, type Prefs, type Profile } from "@/lib/mock";
import { buildPreview } from "@/lib/preview";
import { recommendTemplate } from "@/lib/recommend";
import { TEMPLATES } from "@/lib/templates";
import { Experience, splitLinks, type About } from "../profile/Edit";
import s from "./onboarding.module.css";

const STEPS = ["Upload", "Check and build"] as const;
const EXTENSIONS = [".pdf", ".docx", ".txt", ".md"];
const FORMAT_MSG = "That file type isn’t supported. Upload a PDF, Word (.docx), .txt or .md file.";
const MODES = ["Onsite", "Hybrid", "Remote"] as const;
type Level = Fact["responsibility"];

/** Plain-language upload errors (api/app/routes/imports.py). */
function uploadError(err: unknown) {
  if (!(err instanceof ApiError)) return (err as Error).message;
  if (err.code === "FILE_TOO_LARGE" && err.details.max_pages) return `That resume is longer than ${err.details.max_pages} pages. Remove older or extra pages and upload it again, or start from scratch.`;
  if (err.code === "FILE_TOO_LARGE") return `That file is too big. Files can be up to ${err.details.max_mb ?? 10} MB; try saving it as a PDF without images.`;
  if (err.code === "UNSUPPORTED_FORMAT") return FORMAT_MSG;
  if (err.code === "NO_EXTRACTABLE_TEXT" && err.details.reason === "parse_failed") return "We couldn’t read that file: it took too long or may be damaged. Try a PDF exported from Word or Google Docs, a .docx, or start from scratch.";
  if (err.code === "NO_EXTRACTABLE_TEXT") return "We couldn’t find any text in that file. It may be a scan or a photo. Try a PDF exported from Word or Google Docs, or start from scratch.";
  return err.message;
}

/** Keep what's on screen while refreshed props arrive: confirmed drafts leave the server's queue but stay listed here.
 * Groups match by their role or project id, so a re-import that adds a project's year updates the group in place. */
function merge(old: DraftGroup[], next: DraftGroup[]) {
  const seen = new Set(old.flatMap((g) => g.drafts.map((d) => d.id)));
  const key = (g: DraftGroup) => g.experienceId ?? g.projectId ?? `${g.role}|${g.dates}`;
  const out = old.map((g) => {
    const n = next.find((x) => key(x) === key(g));
    return n ? { ...g, ...n, drafts: [...g.drafts, ...n.drafts.filter((d) => !seen.has(d.id))] } : g;
  });
  const fresh = next.filter((n) => !old.some((g) => key(g) === key(n))).map((n) => ({ ...n, drafts: n.drafts.filter((d) => !seen.has(d.id)) }));
  return [...out, ...fresh.filter((n) => n.drafts.length)];
}

type Found = { name?: string | null; email?: string | null; phone?: string | null; location?: string | null; links?: string[] };
const NUM_RE = /\d+(?:[.,]\d+)*/g; // the numbers the API marks (api/app/routes/profile.py _NUM_RE)
const size = (f: File) => (f.size < 1024 * 1024 ? `${Math.max(1, Math.round(f.size / 1024))} KB` : `${(f.size / 1024 / 1024).toFixed(1)} MB`);
const split = (v: string) => v.split(",").map((x) => x.trim()).filter(Boolean);

// Numbers are what people most often confirm without reading, so they're highlighted.
function markNumbers(text: string) {
  const numbers: string[] = text.match(NUM_RE) ?? [];
  if (!numbers.length) return text;
  const re = new RegExp(`(${numbers.map((n) => n.replace(/\W/g, "\\$&")).join("|")})`, "g");
  return text.split(re).map((part, i) => (numbers.includes(part) ? <strong key={i} className={s.num}>{part}</strong> : <Fragment key={i}>{part}</Fragment>));
}

export default function Onboarding({
  groups: liveGroups,
  education,
  achievements,
  demo,
  about: initialAbout,
  goals,
  prefs,
  experience,
  hasResume,
  initialStep = 0,
}: {
  groups: DraftGroup[];
  education: Education[];
  /** Imported achievements and publications: drafts are offered here, confirmed ones show in the preview. */
  achievements: Achievement[];
  demo: boolean;
  about: About;
  goals: Goals;
  prefs: Prefs;
  /** Roles, projects and confirmed facts: the preview shows these too, and "start from scratch" writes them here. */
  experience: { roles: Profile["roles"]; projects: Profile["projects"]; facts: Fact[]; confirmed: number };
  /** With a resume already made, building again would add a second one: the button confirms and opens Resumes instead. */
  hasResume: boolean;
  /** 1 opens the review (links that say "to confirm" use ?step=confirm). */
  initialStep?: number;
}) {
  const reduce = useReducedMotion();
  const router = useRouter();
  const [refreshing, startRefresh] = useTransition();
  const [step, setStep] = useState(initialStep);
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  // What's in flight: "upload", "queued", "running" (the reader's task state), "build", or "edit:<id>".
  const [busy, setBusy] = useState<string | null>(null);
  const [buildStage, setBuildStage] = useState(0); // 0 confirming, 1 saving details, 2 writing
  const [error, setError] = useState<string | null>(null);
  // Review state: every draft is in unless unticked; the level shown is what gets confirmed.
  const [off, setOff] = useState<Set<string>>(new Set());
  const [levels, setLevels] = useState<Record<string, Level>>({});
  const [done, setDone] = useState<Set<string>>(new Set()); // confirmed or left out on this screen (a retry skips them)
  const [pending, setPending] = useState<Operation | null>(null); // the resume build in flight
  // A task back in the queue with an error is retrying (Gemini busy or rate-limited): say so instead of "waiting".
  const [retrying, setRetrying] = useState(false);
  const watch = (o: Operation) => setRetrying(o.state === "queued" && !!o.error);
  const [editing, setEditing] = useState<{ id: string; text: string } | null>(null);
  const [edits, setEdits] = useState<Record<string, { text: string; version?: number }>>({});
  const [about, setAbout] = useState(initialAbout);
  const [found, setFound] = useState<(keyof About)[]>([]);
  const [links, setLinks] = useState((initialAbout.links ?? []).join(", "));
  const [role, setRole] = useState(goals.roles.join(", "));
  const [where, setWhere] = useState(prefs.locations.join(", "));
  const [modes, setModes] = useState<string[]>(prefs.modes);
  const [visa, setVisa] = useState(prefs.visa === "Need sponsorship");

  const [groups, setGroups] = useState(liveGroups);
  const [prevGroups, setPrevGroups] = useState(liveGroups);
  if (liveGroups !== prevGroups) {
    setPrevGroups(liveGroups);
    setGroups(merge(groups, liveGroups));
  }
  const [edu, setEdu] = useState(() => education.filter((e) => e.status === "draft"));
  const [prevEdu, setPrevEdu] = useState(education);
  if (education !== prevEdu) {
    setPrevEdu(education);
    setEdu([...edu, ...education.filter((e) => e.status === "draft" && !edu.some((x) => x.id === e.id))]);
  }

  const reading = busy === "upload" || busy === "queued" || busy === "running" || (refreshing && !groups.length);
  const drafts = groups.flatMap((g) => g.drafts);
  // The reader suggests a level from the line's own verb; a verb that claims no level (Shipped, Gave…) reads as your own work.
  const level = (d: Draft): Level => levels[d.id] ?? d.suggested ?? "Owned";
  const ticked = drafts.filter((d) => !off.has(d.id));
  const eduTicked = edu.filter((e) => e.id && !off.has(e.id));
  const [wins] = useState(() => achievements.filter((x) => x.status === "draft")); // what's listed doesn't shrink on refresh
  const winsTicked = wins.filter((x) => !off.has(x.id));
  const target = split(role)[0] || about.headline || "Master resume";
  // No goal yet: recommend from the latest job title, which says as much about the field.
  const latest = experience.roles[0]?.title || groups.find((g) => g.kind !== "project")?.role.split(" · ")[0] || "";
  const templateId = recommendTemplate(target === "Master resume" ? latest : target, experience.roles.length > 0 || groups.some((g) => g.kind !== "project"));
  const template = TEMPLATES.find((t) => t.id === templateId) ?? TEMPLATES[0];

  const preview = buildPreview({
    about: { ...about, links: splitLinks(links) },
    target,
    roles: experience.roles,
    projects: experience.projects,
    facts: experience.facts,
    groups,
    off,
    edits: Object.fromEntries(Object.entries(edits).map(([id, e]) => [id, e.text])),
    education: [...education.filter((e) => e.status !== "draft"), ...eduTicked],
    achievements: [...achievements.filter((x) => x.status !== "draft" && !wins.some((w) => w.id === x.id)), ...winsTicked].filter((x) => x.kind === "achievement").map((x) => x.text),
  });

  const toggle = (id: string) => setOff((o) => (o.has(id) ? new Set([...o].filter((x) => x !== id)) : new Set([...o, id])));

  function pick(f: File | null | undefined) {
    if (busy || !f) return;
    setError(EXTENSIONS.some((x) => f.name.toLowerCase().endsWith(x)) ? null : FORMAT_MSG);
    setFile(f);
  }

  // POST /v1/imports stores the file and queues the reader; the drafts it makes arrive with the refresh.
  async function readResume() {
    if (demo || !file) return setStep(1);
    if (busy) return;
    setBusy("upload");
    setError(null);
    setStep(1);
    window.scrollTo({ top: 0 });
    try {
      const body = new FormData();
      body.append("file", file);
      const r = await api<{ operation: Operation }>("/imports", { method: "POST", body });
      const op = await waitFor(r.operation, 300_000, (o) => {
        watch(o);
        setBusy(o.state === "queued" && !o.error ? "queued" : "running");
      });
      setRetrying(false);
      // Contact details the redaction step found (never sent to a model): fill the empty fields only.
      const c = (op.result?.contact ?? {}) as Found;
      // Empty fields only; the city also replaces the profile's guess from the latest job's location, since the
      // file says where the person is.
      const fill = (["name", "email", "phone"] as const).filter((k) => c[k] && !about[k]);
      const city = c.location && c.location !== about.location ? c.location : null;
      const newLinks = (c.links ?? []).filter((l) => !splitLinks(links).includes(l));
      setAbout({ ...about, ...Object.fromEntries(fill.map((k) => [k, k === "name" ? naturalName(c[k]!) : c[k]])), ...(city ? { location: city } : {}) });
      if (newLinks.length) setLinks(splitLinks([links, ...newLinks].join(", ")).join(", "));
      setFound([...fill, ...(city ? (["location"] as const) : []), ...(newLinks.length ? (["links"] as const) : [])]);
      setBusy(null);
      startRefresh(() => router.refresh());
    } catch (err) {
      setError(uploadError(err));
      setRetrying(false);
      setBusy(null);
      setStep(0);
    }
  }

  // PATCH /v1/facts/{id}: a new version of the draft, in the user's words; it's confirmed with that version.
  async function saveEdit(d: Draft) {
    const text = editing?.text.trim();
    if (!text || busy) return;
    setError(null);
    let version = edits[d.id]?.version ?? d.version;
    if (!demo) {
      setBusy(`edit:${d.id}`);
      try {
        version = (await api<{ version: number }>(`/facts/${d.id}`, { method: "PATCH", body: { version, description: text } })).version;
      } catch (err) {
        setError((err as Error).message);
        return;
      } finally {
        setBusy(null);
      }
    }
    setEdits((e) => ({ ...e, [d.id]: { text, version } }));
    setEditing(null);
  }

  // One button does what four steps used to: confirm the ticked lines (each at the level shown) and the roles they sit
  // under, mark unticked lines "not mine" (kept, never deleted; reversible from the profile by adding the line again),
  // save details and goals, then build the first master in the recommended template and open Improve.
  async function build() {
    if (busy) return;
    setError(null);
    if (!ticked.length && !experience.confirmed) return setError("Tick at least one line to build your resume.");
    if (demo) return router.push("/improve");
    setBusy("build");
    window.scrollTo({ top: 0 });
    try {
      setBuildStage(0);
      const now = new Set(done);
      const once = async (id: string, path: string, body: object) => {
        if (now.has(id)) return;
        await api(path, { method: "POST", body });
        now.add(id);
        setDone(new Set(now));
      };
      for (const d of drafts) {
        const version = edits[d.id]?.version ?? d.version;
        if (off.has(d.id)) await once(d.id, `/facts/${d.id}/reject`, { version });
        else await once(d.id, `/facts/${d.id}/confirm`, { version, responsibility_level: LEVELS.indexOf(level(d)) + 1 });
      }
      // Job checks count years and titles from confirmed roles only (api/app/tasks/match.py).
      for (const g of groups)
        if (g.kind === "experience" && g.status === "draft" && g.experienceId && g.drafts.some((d) => !off.has(d.id)))
          await once(g.experienceId, `/experiences/${g.experienceId}/confirm`, { version: g.experienceVersion });
      for (const e of edu) await once(e.id!, `/education/${e.id}/${off.has(e.id!) ? "reject" : "confirm"}`, { version: e.version });
      for (const x of wins) if (!off.has(x.id)) await once(x.id, `/achievements/${x.id}/confirm`, { version: x.version });

      setBuildStage(1);
      const next = { name: about.name.trim(), headline: about.headline.trim(), location: about.location.trim(), email: about.email.trim(), phone: about.phone.trim(), links: splitLinks(links) };
      if (JSON.stringify(next) !== JSON.stringify(initialAbout)) await api("/me", { method: "PATCH", body: next });
      await api("/goals", { method: "PUT", body: { ...goals, roles: split(role) } satisfies Goals });
      await api("/preferences", {
        method: "PUT",
        body: { ...prefs, locations: split(where), modes, visa: visa ? "Need sponsorship" : prefs.visa === "Need sponsorship" ? "Not needed" : prefs.visa } satisfies Prefs,
      });
      if (hasResume) return router.push("/resumes");

      setBuildStage(2);
      // A retry after a timeout waits on the same build instead of starting a second resume.
      let op = pending;
      if (!op) {
        op = (await api<{ resume_id: string; operation: Operation }>("/resumes", { method: "POST", body: { template: templateId, target } })).operation;
        setPending(op);
      } else op = await api<Operation>(`/tasks/${op.id}`);
      try {
        await waitFor(op, 300_000, watch);
      } catch (err) {
        if (!(err instanceof ApiError && err.code === "TIMEOUT")) setPending(null); // failed: the next click starts afresh
        throw err instanceof ApiError && err.code === "TIMEOUT"
          ? new Error("Your resume is still being written: the AI service is slow right now. Keep this page open and click the button again to keep waiting.")
          : err;
      }
      router.push("/improve");
    } catch (err) {
      setRetrying(false);
      setError(err instanceof ApiError && err.status === 409 ? "Something changed in another tab. Reload the page and try again; what you confirmed is saved." : (err as Error).message);
      setBusy(null);
      router.refresh();
    }
  }

  const problem = (msg: string | null) =>
    msg && (
      <p role="alert" className={s.problem}>
        <Icon name="alert" size={18} />
        {msg}
      </p>
    );

  const count = ticked.length + eduTicked.length + winsTicked.length;
  const stage = (on: boolean, past: boolean): StageState => (past ? "done" : on ? "current" : "pending");
  const readStages = [
    { label: "Uploading your file", state: stage(busy === "upload", busy !== "upload") },
    { label: "Waiting for a free reader", state: stage(busy === "queued", busy === "running" || refreshing) },
    { label: retrying ? "The AI service is busy. Retrying on its own…" : "Finding your roles, dates and numbers", state: stage(busy === "running", refreshing) },
    { label: "Laying out your preview", state: stage(refreshing, false) },
  ];
  const buildStages = [
    { label: `Confirming ${count} line${count === 1 ? "" : "s"}`, state: stage(buildStage === 0, buildStage > 0) },
    { label: "Saving your details and goals", state: stage(buildStage === 1, buildStage > 1) },
    ...(hasResume ? [] : [{ label: retrying ? "The AI service is busy. Retrying on its own…" : `Writing your resume in ${template.name}, then checking every line`, state: stage(buildStage === 2, false) }]),
  ];

  const nothing = !drafts.length && !edu.length && !wins.length;
  const label = hasResume ? `Confirm ${count} and update my resume` : count ? `Build my resume with ${count} line${count === 1 ? "" : "s"}` : "Build my resume";

  return (
    <div className={`${s.wrap} ${step === 1 ? s.wide : ""}`}>
      <div className={s.strip}>
        <ol className={s.ticks} aria-hidden>
          {STEPS.map((st, i) => (
            <li key={st} data-state={i < step ? "done" : i === step ? "current" : undefined} />
          ))}
        </ol>
        <p className={s.stepText}>
          Step {step + 1} of {STEPS.length} · {STEPS[step]}
        </p>
      </div>

      <AnimatePresence mode="wait" initial={false}>
        <m.section key={step} initial={{ opacity: 0, y: reduce ? 0 : 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={fade}>
          {step === 0 && (
            <div className={s.narrow}>
              <header className={s.head}>
                <h1 className={s.h1}>Start with the resume you have</h1>
                <p className={s.sub}>We read it and show it back as a resume. You check it once, then it’s built.</p>
              </header>

              <label
                className={s.drop}
                data-state={dragging ? "over" : error ? "error" : file ? "chosen" : undefined}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragging(false);
                  pick(e.dataTransfer.files[0]);
                }}
              >
                <input
                  type="file"
                  accept={`${EXTENSIONS.join(",")},application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/markdown`}
                  className="sr-only"
                  onChange={(e) => pick(e.target.files?.[0])}
                />
                <Icon name={error ? "alert" : "doc"} size={40} className={s.dropIcon} />
                {file && !dragging ? (
                  <span className={s.fileRow}>
                    <span className={s.fileName}>{file.name}</span>
                    <span className={s.fileSize}>{size(file)}</span>
                  </span>
                ) : (
                  <span className={s.dropTitle}>
                    {dragging ? (
                      "Drop to upload"
                    ) : (
                      <>
                        <span className={s.desk}>Drop your resume here</span>
                        <span className={s.phone}>Choose your resume</span>
                      </>
                    )}
                  </span>
                )}
                <span className={s.fine}>PDF, Word or text, up to 10 pages. Scanned PDFs aren’t supported yet.</span>
                <span className={buttonClass(file ? "secondary" : "primary", "md", s.chooseBtn)} aria-hidden>
                  {file ? "Choose another file" : "Choose file"}
                </span>
              </label>
              {problem(error)}
              {file && (
                <div className={s.actions}>
                  <Button variant="primary" disabled={!!busy || error === FORMAT_MSG} onClick={readResume}>
                    Read my resume
                  </Button>
                  {demo && <span className={s.fine}>Sample data: nothing is uploaded; you’ll see example lines.</span>}
                </div>
              )}

              <button type="button" className={s.textLink} onClick={() => setStep(1)}>
                No resume? Start from scratch
                <Icon name="arrowRight" size={18} />
              </button>
              <p className={s.lock}>
                <Icon name="lock" size={16} />
                Free PDF and Word export. Your file is read in a sealed sandbox and never shared.
              </p>

              <section className={s.next} aria-labelledby="next-h">
                <h2 id="next-h" className={s.h3}>
                  What happens next
                </h2>
                <ol>
                  <li>We read your roles, dates and numbers, word for word</li>
                  <li>You see it as a resume and untick anything that’s wrong</li>
                  <li>One click builds it, then we suggest improvements</li>
                </ol>
              </section>
            </div>
          )}

          {step === 1 && (
            <div className={s.split}>
              <div className={s.left}>
                {reading ? (
                  <>
                    <header className={s.head}>
                      <h1 className={s.h1}>Reading your resume</h1>
                      <p className={s.sub}>Usually under a minute. Your preview fills in on the right when it’s done.</p>
                    </header>
                    <Card className={s.reading} aria-live="polite">
                      {file && (
                        <div className={s.fileRow}>
                          <Icon name="doc" size={24} />
                          <span className={s.fileName}>{file.name}</span>
                          <span className={s.fileSize}>{size(file)}</span>
                        </div>
                      )}
                      <StageList label="Reading your resume" stages={readStages} />
                    </Card>
                    <section className={s.next} aria-labelledby="how-h">
                      <h2 id="how-h" className={s.h3}>
                        What we’re doing with it
                      </h2>
                      <ol>
                        <li>Removing your contact details before any AI reads the text</li>
                        <li>Copying every line as you wrote it. Nothing is reworded.</li>
                        <li>Checking every number against your file</li>
                      </ol>
                    </section>
                  </>
                ) : busy === "build" ? (
                  <>
                    <header className={s.head}>
                      <h1 className={s.h1}>{hasResume ? "Saving" : "Building your resume"}</h1>
                      <p className={s.sub}>Every line is checked against what you confirmed. This can take a minute.</p>
                    </header>
                    <Card className={s.reading} aria-live="polite">
                      <StageList label="Building your resume" stages={buildStages} />
                    </Card>
                  </>
                ) : (
                  <>
                    <header className={s.head}>
                      <h1 className={s.h1}>{nothing ? "Add your experience" : "Check what we read"}</h1>
                      <p className={s.sub}>
                        {nothing
                          ? "Add each role, then what you did there, with real numbers. The preview fills in as you go."
                          : "Ticked lines go on your resume exactly as written. Untick anything that’s wrong; numbers are highlighted so you can check them."}
                      </p>
                    </header>

                    {nothing ? (
                      <Experience roles={experience.roles} projects={experience.projects} facts={experience.facts} confirmed={experience.confirmed} demo={demo} />
                    ) : (
                      groups.map((g) => (
                        <Card key={`${g.role}-${g.dates}`} flush className={s.group}>
                          <h2 className={s.groupHead}>
                            {g.role}
                            {g.dates && <span className={s.dates}>{g.dates}</span>}
                          </h2>
                          <ul className={s.lines}>
                            {g.drafts.map((d) => {
                              const text = edits[d.id]?.text ?? d.text;
                              const isOn = !off.has(d.id);
                              return (
                                <li key={d.id} className={s.line} data-off={!isOn || undefined}>
                                  {editing?.id === d.id ? (
                                    <form
                                      className={s.editForm}
                                      onSubmit={(e) => {
                                        e.preventDefault();
                                        saveEdit(d);
                                      }}
                                    >
                                      <Textarea label="Fix what we read" rows={3} maxLength={2000} required autoFocus value={editing.text} onChange={(e) => setEditing({ id: d.id, text: e.target.value })} />
                                      <div className={s.row}>
                                        <Button type="submit" size="sm" variant="primary" loading={busy === `edit:${d.id}`} disabled={!editing.text.trim()}>
                                          Save
                                        </Button>
                                        <Button size="sm" variant="ghost" disabled={!!busy} onClick={() => setEditing(null)}>
                                          Cancel
                                        </Button>
                                      </div>
                                    </form>
                                  ) : (
                                    <>
                                      <Checkbox label={<span className={s.lineText}>{markNumbers(text)}</span>} checked={isOn} disabled={done.has(d.id)} onChange={() => toggle(d.id)} />
                                      {isOn && (
                                        <div className={s.lineTools}>
                                          <Select label="Your part" hideLabel className={s.level} value={level(d)} disabled={done.has(d.id)} onChange={(e) => setLevels({ ...levels, [d.id]: e.target.value as Level })}>
                                            {LEVELS.map((l) => (
                                              <option key={l} value={l}>
                                                {l === "Contributed" ? "I contributed" : l === "Owned" ? "I did it myself" : l === "Led" ? "I led it" : "I managed people on it"}
                                              </option>
                                            ))}
                                          </Select>
                                          {!done.has(d.id) && (
                                            <Button size="sm" variant="ghost" onClick={() => setEditing({ id: d.id, text })}>
                                              Edit
                                            </Button>
                                          )}
                                        </div>
                                      )}
                                    </>
                                  )}
                                </li>
                              );
                            })}
                          </ul>
                        </Card>
                      ))
                    )}

                    {edu.length > 0 && (
                      <Card flush className={s.group}>
                        <h2 className={s.groupHead}>Education</h2>
                        <ul className={s.lines}>
                          {edu.map((e) => (
                            <li key={e.id} className={s.line} data-off={off.has(e.id!) || undefined}>
                              <Checkbox
                                label={<span className={s.lineText}>{[e.degree || "Degree not read", e.org, e.dates].filter(Boolean).join(" · ")}</span>}
                                checked={!off.has(e.id!)}
                                disabled={done.has(e.id!)}
                                onChange={() => toggle(e.id!)}
                              />
                            </li>
                          ))}
                        </ul>
                      </Card>
                    )}

                    {wins.length > 0 && (
                      <Card flush className={s.group}>
                        <h2 className={s.groupHead}>Achievements</h2>
                        <ul className={s.lines}>
                          {wins.map((x) => (
                            <li key={x.id} className={s.line} data-off={off.has(x.id) || undefined}>
                              <Checkbox label={<span className={s.lineText}>{markNumbers(x.text)}</span>} checked={!off.has(x.id)} disabled={done.has(x.id)} onChange={() => toggle(x.id)} />
                            </li>
                          ))}
                        </ul>
                      </Card>
                    )}

                    <Card className={s.form}>
                      <h2 className={s.h3}>Top of your resume</h2>
                      {found.length > 0 && <p className={s.fine}>We filled in {found.map((k) => (k === "location" ? "city" : k)).join(", ")} from your file. Check before you build.</p>}
                      <div className={s.pair}>
                        <Input label="Name" value={about.name} onChange={(e) => setAbout({ ...about, name: e.target.value })} autoComplete="name" />
                        <Input label="City" value={about.location} onChange={(e) => setAbout({ ...about, location: e.target.value })} autoComplete="address-level2" />
                        <Input label="Email" type="email" value={about.email} onChange={(e) => setAbout({ ...about, email: e.target.value })} autoComplete="email" />
                        <Input label="Phone" type="tel" value={about.phone} onChange={(e) => setAbout({ ...about, phone: e.target.value })} autoComplete="tel" />
                      </div>
                      <Input label="Links" value={links} onChange={(e) => setLinks(e.target.value)} placeholder="e.g. github.com/you, linkedin.com/in/you" helper="GitHub, LinkedIn or portfolio, separated by commas (up to 4)." />
                      <p className={s.fine}>Contact details are never sent to an AI model.</p>
                    </Card>

                    <Card className={s.form}>
                      <h2 className={s.h3}>What you’re aiming for</h2>
                      <Input label="Target role" value={role} onChange={(e) => setRole(e.target.value)} placeholder="e.g. Senior Frontend Engineer" helper="Picks your template and builds your job searches. Separate more than one with commas." />
                      <Input label="Where can you work?" value={where} onChange={(e) => setWhere(e.target.value)} placeholder="e.g. Bengaluru, Pune" />
                      <fieldset className={s.fieldset}>
                        <legend>Work mode</legend>
                        <ChipRow>
                          {MODES.map((mode) => {
                            const on = modes.includes(mode);
                            return (
                              <FilterChip key={mode} pressed={on} onClick={() => setModes(on ? modes.filter((x) => x !== mode) : [...modes, mode])}>
                                {mode}
                              </FilterChip>
                            );
                          })}
                        </ChipRow>
                      </fieldset>
                      <Checkbox label="I need visa sponsorship" checked={visa} onChange={(e) => setVisa(e.target.checked)} />
                    </Card>

                    <div className={s.footer}>
                      {problem(error)}
                      <p id="build-note" className={s.fine}>
                        {off.size ? "Unticked lines are marked “not mine” and left out. You can add a line again from your profile." : "You can change any line later from your profile."}
                      </p>
                      <BottomActionBar label="Build">
                        <Button variant="primary" aria-describedby="build-note" disabled={!!busy} onClick={build}>
                          {label}
                        </Button>
                      </BottomActionBar>
                    </div>
                  </>
                )}
              </div>

              <aside className={s.right} aria-label="Resume preview">
                <p className={s.previewHead}>
                  {reading ? "Your resume" : `Preview · ${template.name}`}
                  {!reading && <span className={s.fine}>Recommended for {target === "Master resume" ? latest || "your experience" : target}. You can switch later.</span>}
                </p>
                <div className={s.sheet}>
                  {reading ? (
                    <SkeletonRegion label="Your preview is on its way" className={s.skeleton}>
                      <Skeleton width="45%" height={22} />
                      <Skeleton width="70%" height={10} />
                      {[0, 1].map((i) => (
                        <div key={i} className={s.skelBlock}>
                          <Skeleton width="35%" height={12} />
                          <SkeletonText lines={4} lineHeight={16} />
                        </div>
                      ))}
                    </SkeletonRegion>
                  ) : (
                    <div className={s.fit}>
                      <ResumePaper resume={{ ...preview.resume, template: template.name, templateId: template.id }} template={template} extras={preview.extras} />
                    </div>
                  )}
                </div>
              </aside>
            </div>
          )}
        </m.section>
      </AnimatePresence>
    </div>
  );
}
