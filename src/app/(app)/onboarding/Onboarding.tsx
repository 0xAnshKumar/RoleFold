"use client";

import { useRouter } from "next/navigation";
import { AnimatePresence, useReducedMotion } from "motion/react";
import * as m from "motion/react-m";
import { Fragment, useEffect, useRef, useState } from "react";
import { BottomActionBar } from "@/components/shell/BottomActionBar";
import { Button, ButtonLink, buttonClass } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Checkbox } from "@/components/ui/Choice";
import { ChipRow, FilterChip } from "@/components/ui/Chip";
import { Dialog } from "@/components/ui/Dialog";
import { Input, Textarea } from "@/components/ui/Field";
import { Icon } from "@/components/ui/Icon";
import { ProgressBar, StageList } from "@/components/ui/Progress";
import { SignatureLine } from "@/components/ui/Proof";
import { Segmented } from "@/components/ui/Segmented";
import { useToast } from "@/components/ui/Toast";
import { ApiError, api, waitFor, type Operation } from "@/lib/api";
import { fade } from "@/lib/motion";
import { naturalName } from "@/lib/names";
import { LEVELS, type Draft, type DraftGroup, type Education, type Fact, type Goals, type Prefs, type Profile, type Question } from "@/lib/mock";
import { useAction } from "@/lib/useAction";
import { AboutForm, EducationRow, Experience, useEducation, type About } from "../profile/Edit";
import s from "./onboarding.module.css";

const STEPS = ["Upload", "Confirm facts", "About you", "Goals"] as const;
const EXTENSIONS = [".pdf", ".docx", ".txt", ".md"];
const FORMAT_MSG = "That file type isn’t supported. Upload a PDF, Word (.docx), .txt or .md file.";

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
const MODES = ["Onsite", "Hybrid", "Remote"] as const;

/** Keep what's on screen while refreshed props arrive: confirmed drafts leave the server's queue but stay listed here. */
function merge(old: DraftGroup[], next: DraftGroup[]) {
  const seen = new Set(old.flatMap((g) => g.drafts.map((d) => d.id)));
  const same = (a: DraftGroup, b: DraftGroup) => a.role === b.role && a.dates === b.dates;
  const out = old.map((g) => ({ ...g, drafts: [...g.drafts, ...(next.find((n) => same(n, g))?.drafts.filter((d) => !seen.has(d.id)) ?? [])] }));
  return [...out, ...next.filter((n) => !old.some((g) => same(n, g)))];
}

type Found = { name?: string | null; email?: string | null; phone?: string | null };
const NUM_RE = /\d+(?:[.,]\d+)*/g; // the numbers the API marks (api/app/routes/profile.py _NUM_RE)
const short = (t: string) => (t.length > 60 ? `${t.slice(0, 60)}…` : t);
const today = () => new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short" });
const size = (f: File) => (f.size < 1024 * 1024 ? `${Math.max(1, Math.round(f.size / 1024))} KB` : `${(f.size / 1024 / 1024).toFixed(1)} MB`);

// Numbers are what users most often confirm without reading, so they get called out.
function markNumbers(text: string, numbers: string[]) {
  if (!numbers.length) return text;
  const re = new RegExp(`(${numbers.map((n) => n.replace(/\W/g, "\\$&")).join("|")})`, "g");
  return text.split(re).map((part, i) =>
    numbers.includes(part) ? (
      <strong key={i} className={s.num}>
        {part}
      </strong>
    ) : (
      <Fragment key={i}>{part}</Fragment>
    ),
  );
}

export default function Onboarding({
  groups: liveGroups,
  education,
  demo,
  about: initialAbout,
  goals,
  prefs,
  questions,
  experience,
  initialStep = 0,
}: {
  groups: DraftGroup[];
  education: Education[];
  demo: boolean;
  about: About;
  goals: Goals;
  prefs: Prefs;
  /** Guided enrichment (GET /v1/enrichment-questions): each answer becomes a draft fact. */
  questions: Question[];
  /** Roles and confirmed facts: with nothing to confirm (started from scratch), step 1 is where they're written. */
  experience: { roles: Profile["roles"]; projects: Profile["projects"]; facts: Fact[]; confirmed: number };
  /** 1 opens the confirm queue (links that say "to confirm" use ?step=confirm). */
  initialStep?: number;
}) {
  const reduce = useReducedMotion();
  const router = useRouter();
  const toast = useToast();
  const [step, setStep] = useState(initialStep);
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [confirmed, setConfirmed] = useState<Record<string, boolean>>({});
  const [rejected, setRejected] = useState<Record<string, boolean>>({});
  const [skipped, setSkipped] = useState<string[]>([]); // "Skip for now": these go to the back of the queue
  const [picked, setPicked] = useState<string | null>(null); // chosen from the list beside the card
  const [levels, setLevels] = useState<Record<string, Fact["responsibility"]>>({});
  const [busy, setBusy] = useState<string | null>(null); // what's in flight: "upload", "read", "goals", "build" or a draft id
  const [error, setError] = useState<string | null>(null);
  const [confirmAll, setConfirmAll] = useState(false);
  const [section, setSection] = useState<"facts" | "education">("facts");
  const [modes, setModes] = useState<string[]>(prefs.modes);
  const [role, setRole] = useState(goals.roles.join(", "));
  const [where, setWhere] = useState(prefs.locations.join(", "));
  const [visa, setVisa] = useState(prefs.visa === "Need sponsorship");
  // Each confirm refreshes the server data (so the nav's "entries to confirm" count is current);
  // what's listed here only grows, so a confirmed entry doesn't vanish mid-review.
  const [groups, setGroups] = useState(liveGroups);
  const [prevGroups, setPrevGroups] = useState(liveGroups);
  if (liveGroups !== prevGroups) {
    setPrevGroups(liveGroups);
    setGroups(merge(groups, liveGroups));
  }
  const [eduShown, setEduShown] = useState(() => education.filter((e) => e.status === "draft"));
  const [prevEdu, setPrevEdu] = useState(education);
  if (education !== prevEdu) {
    setPrevEdu(education);
    setEduShown([...eduShown, ...education.filter((e) => e.status === "draft" && !eduShown.some((x) => x.id === e.id))]);
  }
  const edu = useEducation(eduShown, demo);
  const [about, setAbout] = useState(initialAbout);
  const [found, setFound] = useState<(keyof About)[]>([]);
  const [editing, setEditing] = useState<{ id: string; text: string; select?: string } | null>(null);
  const [asked, setAsked] = useState<string[]>([]); // answered or skipped on this screen
  const question = questions.find((q) => !asked.includes(q.id));
  const [answer, setAnswer] = useState("");
  const [answerNote, setAnswerNote] = useState("");
  const ask = useAction();

  // The queue: every draft fact in reading order, minus the ones marked "not mine".
  const queue = groups.flatMap((g) => g.drafts.map((d) => ({ g, d }))).filter(({ d }) => !rejected[d.id]);
  const open = queue.filter(({ d }) => !confirmed[d.id]).sort((x, y) => skipped.indexOf(x.d.id) - skipped.indexOf(y.d.id));
  const cur = open.find(({ d }) => d.id === picked) ?? open[0];
  const factsDone = queue.length - open.length;
  const eduDone = edu.list.filter((e) => edu.status(e) === "confirmed").length;
  const total = queue.length + edu.list.length;
  const done = factsDone + eduDone;
  const level = (d: Draft) => levels[d.id] ?? d.suggested;
  // "Confirm all" takes only the facts a glance can check: no numbers, and a level already chosen.
  const easy = open.filter(({ d }) => !d.numbers.length && level(d)).map(({ d }) => d);
  const showEdu = section === "education" || !queue.length;

  // After a confirm, skip or "not mine", focus moves to the next card's heading (keyboard and screen readers follow).
  const heading = useRef<HTMLHeadingElement>(null);
  const moveFocus = useRef(false);
  useEffect(() => {
    if (moveFocus.current) heading.current?.focus();
    moveFocus.current = false;
  }, [cur?.d.id]);
  const next = () => {
    moveFocus.current = true;
    setPicked(null);
  };

  // PATCH /v1/facts/{id} appends a new version of the draft; the confirm below then uses its new version.
  async function saveEdit(d: Draft) {
    const text = editing?.text.trim();
    if (!text || busy) return;
    setError(null);
    let version = d.version;
    if (!demo) {
      setBusy(`edit:${d.id}`);
      try {
        version = (await api<{ version: number }>(`/facts/${d.id}`, { method: "PATCH", body: { version: d.version, description: text } })).version;
      } catch (err) {
        setError((err as Error).message);
        return;
      } finally {
        setBusy(null);
      }
    }
    setGroups((gs) => gs.map((g) => ({ ...g, drafts: g.drafts.map((x) => (x.id === d.id ? { ...x, text, numbers: text.match(NUM_RE) ?? [], version } : x)) })));
    setEditing(null);
  }

  // POST /v1/enrichment-questions/{id}/answer saves the answer as a draft fact under the same role; it then arrives in the queue.
  const reply = (q: Question, skip: boolean) =>
    ask.run(skip ? "skip" : "answer", async () => {
      if (!demo) {
        await api(`/enrichment-questions/${q.id}/${skip ? "skip" : "answer"}`, { method: "POST", body: skip ? undefined : { answer: answer.trim() } });
        if (!skip) router.refresh();
      }
      setAsked((x) => [...x, q.id]);
      setAnswer("");
      setAnswerNote(skip ? "" : demo ? "Sample data: nothing was sent. In your account your answer is saved as a draft fact to confirm." : "Saved as a draft fact. It joins the queue above; confirm it like the others.");
    });

  function pick(f: File | null | undefined) {
    if (busy || !f) return;
    setError(EXTENSIONS.some((x) => f.name.toLowerCase().endsWith(x)) ? null : FORMAT_MSG);
    setFile(f);
  }

  // POST /v1/imports (multipart) stores the file and queues the reader; the drafts it makes arrive via refresh.
  // Demo: sample drafts, nothing uploaded.
  async function readResume() {
    if (demo || !file) return setStep(1);
    if (busy) return;
    setBusy("upload");
    setError(null);
    try {
      const body = new FormData();
      body.append("file", file);
      const r = await api<{ operation: Operation }>("/imports", { method: "POST", body });
      setBusy("read");
      const op = await waitFor(r.operation);
      // Contact details the redaction step found (never sent to a model): offered on the "About you" step, empty fields only.
      const c = (op.result?.contact ?? {}) as Found;
      const fill = (["name", "email", "phone"] as const).filter((k) => c[k] && !about[k]);
      setAbout({ ...about, ...Object.fromEntries(fill.map((k) => [k, k === "name" ? naturalName(c[k]!) : c[k]])) });
      setFound(fill);
      router.refresh();
      setStep(1);
    } catch (err) {
      setError(uploadError(err));
    } finally {
      setBusy(null);
    }
  }

  // PUT /v1/goals and /v1/preferences replace the whole record: untouched fields keep their current values.
  // Then the first master resume: POST /v1/resumes {template, target} -> wait -> open it. Demo opens the sample.
  async function saveGoals(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (demo) return router.push("/resumes/frontend-engineer");
    setBusy("goals");
    setError(null);
    const split = (v: string) => v.split(",").map((x) => x.trim()).filter(Boolean);
    try {
      await api("/goals", { method: "PUT", body: { ...goals, roles: split(role) } satisfies Goals });
      await api("/preferences", {
        method: "PUT",
        body: { ...prefs, locations: split(where), modes, visa: visa ? "Need sponsorship" : prefs.visa === "Need sponsorship" ? "Not needed" : prefs.visa } satisfies Prefs,
      });
      setBusy("build");
      const target = split(role)[0] || about.headline || "Master resume";
      const r = await api<{ resume_id: string; operation: Operation }>("/resumes", { method: "POST", body: { template: "classic", target } });
      const op = await waitFor(r.operation);
      router.push(`/resumes/${(op.result?.resume_id as string | undefined) ?? r.resume_id}`);
    } catch (err) {
      setError(
        err instanceof ApiError && err.code === "UNCONFIRMED_ENTRY"
          ? "Your goals are saved. To build a resume, confirm at least one entry first: go back a step, or confirm them from your profile."
          : (err as Error).message,
      );
      setBusy(null);
    }
  }

  // Live confirms are one-way: undoing a confirmed fact is a reject, done from the profile. Sample data can undo.
  async function confirm(ds: Draft[]) {
    if (busy) return;
    setError(null);
    const ok: string[] = [];
    for (const d of ds) {
      if (confirmed[d.id]) continue;
      // The reader doesn't always suggest a level; the API requires one (RESPONSIBILITY_LEVEL_REQUIRED).
      if (!level(d)) {
        setError(`Choose how much of “${short(d.text)}” was yours (Contributed, Owned, Led or Managed), then confirm it.`);
        break;
      }
      if (!demo) {
        setBusy(d.id);
        try {
          await api(`/facts/${d.id}/confirm`, { method: "POST", body: { version: d.version, responsibility_level: LEVELS.indexOf(level(d)) + 1 } });
        } catch (err) {
          setError((err as Error).message);
          break;
        }
      }
      ok.push(d.id);
      setConfirmed((c) => ({ ...c, [d.id]: true }));
    }
    setBusy(null);
    if (!ok.length) return;
    next();
    const what = ok.length === 1 ? "Fact confirmed" : `${ok.length} facts confirmed`;
    toast(
      demo
        ? { message: what, action: { label: "Undo", onClick: () => setConfirmed((c) => ({ ...c, ...Object.fromEntries(ok.map((id) => [id, false])) })) } }
        : { message: `${what}. To take one back, reject it from your profile.` },
    );
    if (!demo) router.refresh(); // the nav's "entries to confirm" count
  }

  // "Not mine": POST /v1/facts/{id}/reject marks the draft rejected (kept, never silently deleted).
  async function reject(d: Draft) {
    if (busy) return;
    setError(null);
    if (!demo) {
      setBusy(`reject:${d.id}`);
      try {
        await api(`/facts/${d.id}/reject`, { method: "POST", body: { version: d.version } });
      } catch (err) {
        setError((err as Error).message);
        return;
      } finally {
        setBusy(null);
      }
    }
    setRejected((r) => ({ ...r, [d.id]: true }));
    next();
    toast(demo ? { message: "Marked as not yours", action: { label: "Undo", onClick: () => setRejected((r) => ({ ...r, [d.id]: false })) } } : { message: "Marked as not yours. It stays out of your resumes." });
    if (!demo) router.refresh();
  }

  const onCardKey = (e: React.KeyboardEvent, d: Draft) => {
    if (editing || (e.target as HTMLElement).closest("button, input, textarea, select, a, label")) return;
    if (e.key === "Enter") confirm([d]);
    else if (e.key === "e" || e.key === "E") setEditing({ id: d.id, text: d.text });
    else if (e.key === "n" || e.key === "N") reject(d);
    else return;
    e.preventDefault();
  };

  const problem = (msg: string | null) =>
    msg && (
      <p role="alert" className={s.problem}>
        <Icon name="alert" size={18} />
        {msg}
      </p>
    );

  return (
    <div className={`${s.wrap} ${step === 1 && total > 0 ? s.wide : ""}`}>
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
                <p className={s.sub}>We read it, you confirm what’s true, then we write.</p>
              </header>

              {busy === "upload" || busy === "read" ? (
                <Card className={s.reading} aria-live="polite">
                  <div className={s.fileRow}>
                    <Icon name="doc" size={24} />
                    <span className={s.fileName}>{file?.name}</span>
                    <span className={s.fileSize}>{file && size(file)}</span>
                  </div>
                  <StageList
                    label="Reading your resume"
                    stages={[
                      { label: "Uploading your file", state: busy === "upload" ? "current" : "done" },
                      { label: "Finding your roles, dates and numbers", state: busy === "read" ? "current" : "pending" },
                      { label: "Getting facts ready to confirm", state: "pending" },
                    ]}
                  />
                  <p className={s.fine}>This can take up to a minute.</p>
                </Card>
              ) : (
                <>
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
                      {demo && <span className={s.fine}>Sample data: nothing is uploaded; you’ll see example facts.</span>}
                    </div>
                  )}
                </>
              )}

              {!busy && (
                <button type="button" className={s.textLink} onClick={() => setStep(1)}>
                  No resume? Start from scratch
                  <Icon name="arrowRight" size={18} />
                </button>
              )}
              <p className={s.lock}>
                <Icon name="lock" size={16} />
                Free PDF and Word export. Your file is read in a sealed sandbox and never shared.
              </p>

              <section className={s.next} aria-labelledby="next-h">
                <h2 id="next-h" className={s.h3}>
                  What happens next
                </h2>
                <ol>
                  <li>We find your roles, dates and numbers</li>
                  <li>You confirm each fact (about 5 minutes)</li>
                  <li>Your resume is written from those facts only</li>
                </ol>
              </section>
            </div>
          )}

          {step === 1 && total === 0 && (
            <div className={s.narrow}>
              <header className={s.head}>
                <h1 className={s.h1}>Add your experience</h1>
                <p className={s.sub}>Add each role, then write what you did there, with real numbers. Your resume is made only from what you write here.</p>
              </header>
              <Experience roles={experience.roles} projects={experience.projects} facts={experience.facts} confirmed={experience.confirmed} demo={demo} />
            </div>
          )}

          {step === 1 && total > 0 && (
            <>
              <header className={s.confirmHead}>
                <div className={s.headText}>
                  <h1 className={s.h1}>Confirm what’s really yours</h1>
                  <p className={s.sub}>Only confirmed facts go into your resume. Check the numbers and how much of each one was yours.</p>
                </div>
                <div className={s.count}>
                  <ProgressBar value={done} max={total} label={`${done} of ${total} confirmed`} />
                </div>
              </header>

              {queue.length > 0 && edu.list.length > 0 && (
                <ChipRow label="Sections" className={s.chips}>
                  <FilterChip pressed={section === "facts"} onClick={() => setSection("facts")}>
                    Roles {factsDone}/{queue.length}
                  </FilterChip>
                  <FilterChip pressed={section === "education"} onClick={() => setSection("education")}>
                    Education {eduDone}/{edu.list.length}
                  </FilterChip>
                </ChipRow>
              )}

              {showEdu ? (
                <div className={s.eduCol}>
                  <Card flush>
                    <div className={s.eduHead}>
                      <h2 className={s.h3}>Education</h2>
                      <p className={s.fine}>Confirm a degree so jobs that ask for it can count it.</p>
                    </div>
                    <ul className={s.eduList}>
                      {edu.list.map((e) => (
                        <li key={e.id}>
                          <EducationRow bare e={e} status={edu.status(e)} busy={edu.busy} onSet={(to) => edu.set(e, to)} />
                        </li>
                      ))}
                    </ul>
                  </Card>
                  {problem(edu.error)}
                </div>
              ) : (
                <div className={s.queue}>
                  <div className={s.main}>
                    {open.length > 0 && (
                      <div className={s.allBar}>
                        <p>
                          {open.length} fact{open.length === 1 ? "" : "s"} left.
                          {!easy.length ? " Facts with numbers are checked one by one." : easy.length < open.length ? ` ${open.length - easy.length} with numbers stay for one-by-one review.` : ""}
                        </p>
                        {easy.length > 0 && (
                          <Button size="sm" disabled={!!busy} onClick={() => setConfirmAll(true)}>
                            Confirm all {easy.length} without numbers
                          </Button>
                        )}
                      </div>
                    )}

                    <AnimatePresence mode="wait" initial={false}>
                      {cur ? (
                        <m.div
                          key={cur.d.id}
                          initial={{ opacity: 0, x: 24 }}
                          animate={{ opacity: 1, x: 0, transition: reduce ? { duration: 0 } : { duration: 0.25, ease: [0.23, 1, 0.32, 1] } }}
                          exit={{ opacity: 0, x: -24, transition: reduce ? { duration: 0 } : { duration: 0.18, ease: [0.4, 0, 1, 1] } }}
                        >
                          <Card className={s.fact} onKeyDown={(e: React.KeyboardEvent) => onCardKey(e, cur.d)}>
                            <div className={s.factTop}>
                              <span>
                                Fact {queue.indexOf(cur) + 1} of {queue.length}
                              </span>
                              {open.length > 1 && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  disabled={!!busy}
                                  onClick={() => {
                                    setSkipped((x) => [...x.filter((id) => id !== cur.d.id), cur.d.id]);
                                    setEditing(null);
                                    next();
                                  }}
                                >
                                  Skip for now
                                </Button>
                              )}
                            </div>
                            <h2 ref={heading} tabIndex={-1} className={s.role}>
                              {cur.g.role}
                              <span className={s.dates}>{cur.g.dates}</span>
                            </h2>

                            {editing?.id === cur.d.id ? (
                              <form
                                id="fact-edit"
                                onSubmit={(e) => {
                                  e.preventDefault();
                                  saveEdit(cur.d);
                                }}
                              >
                                <Textarea
                                  label="Fix what we read"
                                  rows={3}
                                  maxLength={2000}
                                  required
                                  autoFocus
                                  value={editing.text}
                                  onChange={(e) => setEditing({ id: cur.d.id, text: e.target.value })}
                                  onFocus={(e) => {
                                    const i = editing.select ? e.target.value.indexOf(editing.select) : -1;
                                    if (i >= 0) e.target.setSelectionRange(i, i + editing.select!.length);
                                  }}
                                />
                              </form>
                            ) : (
                              <p className={s.factText}>{markNumbers(cur.d.text, cur.d.numbers)}</p>
                            )}

                            {cur.d.numbers.length > 0 && editing?.id !== cur.d.id && (
                              <div className={s.numbers}>
                                <Icon name="alert" size={18} />
                                <span>Check these numbers:</span>
                                {cur.d.numbers.map((n) => (
                                  <button key={n} type="button" className={s.numChip} onClick={() => setEditing({ id: cur.d.id, text: cur.d.text, select: n })}>
                                    {n}
                                    <span className="sr-only">: edit this number</span>
                                  </button>
                                ))}
                              </div>
                            )}

                            <Segmented
                              label="Your part"
                              size="sm"
                              options={LEVELS.map((l) => ({ value: l, label: l }))}
                              value={level(cur.d)}
                              onChange={(l) => setLevels({ ...levels, [cur.d.id]: l })}
                              className={s.levels}
                            />

                            {problem(error)}

                            <div className={s.factActions}>
                              {editing?.id === cur.d.id ? (
                                <>
                                  <Button variant="ghost" disabled={!!busy} onClick={() => setEditing(null)}>
                                    Cancel
                                  </Button>
                                  <Button variant="primary" type="submit" form="fact-edit" loading={busy === `edit:${cur.d.id}`} disabled={!editing.text.trim()}>
                                    Save
                                  </Button>
                                </>
                              ) : (
                                <>
                                  <Button variant="ghost" loading={busy === `reject:${cur.d.id}`} disabled={!!busy} onClick={() => reject(cur.d)}>
                                    Not mine
                                  </Button>
                                  <span className={s.grow} />
                                  <Button disabled={!!busy} onClick={() => setEditing({ id: cur.d.id, text: cur.d.text })}>
                                    Edit
                                  </Button>
                                  <Button variant="primary" loading={busy === cur.d.id} disabled={!!busy} onClick={() => confirm([cur.d])}>
                                    Confirm
                                  </Button>
                                </>
                              )}
                            </div>
                          </Card>
                        </m.div>
                      ) : (
                        <m.div key="done" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={fade}>
                          <Card className={s.allDone}>
                            <Icon name="check" size={40} />
                            <h2 className={s.h2}>All facts confirmed</h2>
                            <p className={s.sub}>Your resume is written only from these. Continue when you’re ready.</p>
                          </Card>
                        </m.div>
                      )}
                    </AnimatePresence>

                    {question && (
                      <Card
                        as="form"
                        className={s.question}
                        aria-labelledby="quick-q"
                        onSubmit={(e: React.FormEvent) => {
                          e.preventDefault();
                          reply(question, false);
                        }}
                      >
                        <h2 id="quick-q" className={s.h3}>
                          One quick question
                        </h2>
                        <p className={s.questionText}>{question.question}</p>
                        <Textarea
                          label="Your answer"
                          hideLabel
                          rows={2}
                          maxLength={2000}
                          value={answer}
                          onChange={(e) => setAnswer(e.target.value)}
                          helper="Your answer becomes a draft fact you confirm, e.g. Checkout conversion rose from 2.1% to 2.6%"
                        />
                        <div className={s.row}>
                          <Button type="submit" size="sm" variant="secondary" loading={ask.busy === "answer"} disabled={!answer.trim() || !!ask.busy}>
                            Save as draft fact
                          </Button>
                          <Button size="sm" variant="ghost" loading={ask.busy === "skip"} disabled={!!ask.busy} onClick={() => reply(question, true)}>
                            Skip
                          </Button>
                        </div>
                        {problem(ask.error)}
                      </Card>
                    )}
                    {answerNote && (
                      <p role="status" className={s.fine}>
                        {answerNote}
                      </p>
                    )}
                  </div>

                  <aside className={s.side} aria-labelledby="list-h">
                    <h2 id="list-h" className={s.h3}>
                      Your facts
                    </h2>
                    <ul className={s.list}>
                      {queue.map((x) => {
                        const on = !!confirmed[x.d.id];
                        return (
                          <li key={x.d.id} data-current={x === cur || undefined} data-done={on || undefined}>
                            {on ? (
                              <div className={s.item}>
                                <span className={s.itemText}>{x.d.text}</span>
                                <SignatureLine date={today()} reveal={!reduce} />
                              </div>
                            ) : (
                              <button
                                type="button"
                                className={s.item}
                                aria-current={x === cur ? "true" : undefined}
                                onClick={() => {
                                  setPicked(x.d.id);
                                  setEditing(null);
                                }}
                              >
                                <span className={s.itemText}>{x.d.text}</span>
                                {x.d.numbers.length > 0 && <span className={s.itemNote}>Has numbers to check</span>}
                              </button>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  </aside>
                </div>
              )}
            </>
          )}

          {step === 1 && (
            <div className={total > 0 ? s.footer : `${s.footer} ${s.narrow}`}>
              <p id="continue-note" className={s.fine}>
                {total > 0 && !done ? "Confirm at least one fact first." : total === 0 ? "You can add more later from your profile." : "You can confirm the rest later from your profile."}
              </p>
              <BottomActionBar label="Next step">
                <Button
                  variant={open.length || total === 0 ? "secondary" : "primary"}
                  disabled={!done && total > 0}
                  aria-describedby="continue-note"
                  onClick={() => setStep(2)}
                 
                >
                  {total === 0 ? "Continue" : `Continue with ${done} confirmed`}
                </Button>
              </BottomActionBar>
            </div>
          )}

          {step === 2 && (
            <div className={s.narrow}>
              <header className={s.head}>
                <h1 className={s.h1}>How should your resume introduce you?</h1>
                <p className={s.sub}>This is the top of every resume you make. You can change it later from your profile.</p>
              </header>
              <Card>
                <AboutForm
                  initial={about}
                  fromResume={found}
                  demo={demo}
                  onSaved={(v) => {
                    setAbout(v);
                    setStep(3);
                  }}
                  submitLabel="Save and continue"
                />
              </Card>
              <div className={s.actions}>
                <Button variant="ghost" onClick={() => setStep(3)}>
                  Skip for now
                </Button>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className={s.narrow}>
              <header className={s.head}>
                <h1 className={s.h1}>What are you aiming for?</h1>
                <p className={s.sub}>These decide which jobs are a real fit. Skip anything; we mark it unknown, never guess.</p>
              </header>
              <Card as="form" className={s.form} onSubmit={saveGoals}>
                <Input label="Target role" value={role} onChange={(e) => setRole(e.target.value)} placeholder="e.g. Senior Frontend Engineer" helper="Separate more than one with commas." />
                <Input label="Where can you work?" value={where} onChange={(e) => setWhere(e.target.value)} placeholder="e.g. Bengaluru, Pune" autoComplete="address-level2" />
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
                {problem(error)}
                <div className={s.actions}>
                  <Button type="submit" variant="primary" loading={busy === "goals" || busy === "build"}>
                    {busy === "build" ? "Building your resume…" : "Save and build my resume"}
                  </Button>
                  <ButtonLink href={demo ? "/resumes/frontend-engineer" : "/resumes"} variant="ghost">
                    Skip for now
                  </ButtonLink>
                </div>
                <p className={s.fine} role="status">
                  {busy === "build" ? "Choosing and wording your confirmed facts, then checking every line. This can take a minute." : ""}
                </p>
              </Card>
            </div>
          )}
        </m.section>
      </AnimatePresence>

      <Dialog
        open={confirmAll}
        onClose={() => setConfirmAll(false)}
        title={`Confirm ${easy.length} fact${easy.length === 1 ? "" : "s"}?`}
        description="These have no numbers to check. Each keeps the level shown."
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmAll(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={() => {
                setConfirmAll(false);
                confirm(easy);
              }}
            >
              Confirm {easy.length}
            </Button>
          </>
        }
      >
        <ul className={s.dialogList}>
          {easy.map((d) => (
            <li key={d.id}>
              <span>{d.text}</span>
              <span className={s.itemNote}>{level(d)}</span>
            </li>
          ))}
        </ul>
      </Dialog>
    </div>
  );
}
