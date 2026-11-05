"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Fragment, useState } from "react";
import a from "@/components/app/app.module.css";
import { StatusIcon } from "@/components/ui";
import { ApiError, api, waitFor, type Operation } from "@/lib/api";
import { naturalName } from "@/lib/names";
import { LEVELS, type Draft, type DraftGroup, type Education, type Fact, type Goals, type Prefs, type Profile, type Question } from "@/lib/mock";
import { useAction } from "@/lib/useAction";
import { AboutForm, EducationRow, Experience, useEducation, type About } from "../profile/Edit";
import s from "./onboarding.module.css";

const STEPS = [
  { label: "Upload", hint: "Bring the resume you have" },
  { label: "Confirm", hint: "Check what we read" },
  { label: "You", hint: "Name and headline" },
  { label: "Goals", hint: "What you’re aiming for" },
] as const;
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
  const [step, setStep] = useState(initialStep);
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [confirmed, setConfirmed] = useState<Record<string, boolean>>({});
  const [levels, setLevels] = useState<Record<string, Fact["responsibility"]>>({});
  const [busy, setBusy] = useState<string | null>(null); // what's in flight: "import" or a draft id
  const [error, setError] = useState<string | null>(null);
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
  const eduDone = edu.list.filter((e) => edu.status(e) === "confirmed").length;
  const total = groups.reduce((n, g) => n + g.drafts.length, 0) + edu.list.length;
  const done = Object.values(confirmed).filter(Boolean).length + eduDone;
  const level = (d: Draft) => levels[d.id] ?? d.suggested;
  const [editing, setEditing] = useState<{ id: string; text: string } | null>(null);
  const [asked, setAsked] = useState<string[]>([]); // answered or skipped on this screen
  const question = questions.find((q) => !asked.includes(q.id));
  const [answer, setAnswer] = useState("");
  const [answerNote, setAnswerNote] = useState("");
  const ask = useAction();

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

  // POST /v1/enrichment-questions/{id}/answer saves the answer as a draft fact under the same role; it then arrives in the list above.
  const reply = (q: Question, skip: boolean) =>
    ask.run(skip ? "skip" : "answer", async () => {
      if (!demo) {
        await api(`/enrichment-questions/${q.id}/${skip ? "skip" : "answer"}`, { method: "POST", body: skip ? undefined : { answer: answer.trim() } });
        if (!skip) router.refresh();
      }
      setAsked((x) => [...x, q.id]);
      setAnswer("");
      setAnswerNote(skip ? "" : demo ? "Sample data: nothing was sent. In your account your answer is saved as a draft fact to confirm." : "Saved as a draft fact in the list above. Confirm it like the others.");
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
      // Contact details the redaction step found (never sent to a model): offered on the "You" step, empty fields only.
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

  // Live confirms are one-way: undoing a confirmed fact is a reject, done from the profile.
  async function confirm(ds: Draft[]) {
    if (busy) return;
    setError(null);
    for (const d of ds) {
      if (confirmed[d.id]) continue;
      // The reader doesn't always suggest a level; the API requires one (RESPONSIBILITY_LEVEL_REQUIRED).
      if (!level(d)) {
        setError(`Choose how much of “${d.text.length > 60 ? `${d.text.slice(0, 60)}…` : d.text}” was yours (Contributed, Owned, Led or Managed), then confirm it.`);
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
      setConfirmed((c) => ({ ...c, [d.id]: true }));
    }
    setBusy(null);
    if (!demo) router.refresh(); // the nav's "entries to confirm" count
  }

  return (
    <div className={s.wrap}>
      <ol className={s.steps} aria-label="Setup steps">
        {STEPS.map((st, i) => (
          <li key={st.label} aria-current={i === step ? "step" : undefined} className={i < step ? s.past : undefined}>
            <span className={s.stepNum}>{i < step ? <StatusIcon name="check" /> : i + 1}</span>
            <span className={s.stepText}>
              <b>{st.label}</b>
              <span>{st.hint}</span>
            </span>
          </li>
        ))}
      </ol>

      <AnimatePresence mode="wait" initial={false}>
        <motion.section
          key={step}
          className={s.stage}
          initial={reduce ? { opacity: 0 } : { opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={reduce ? { opacity: 0 } : { opacity: 0, y: -8 }}
          transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
        >
          {step === 0 && (
            <>
              <div className={s.head}>
                <h1 className={s.h1}>Start with the resume you already have.</h1>
                <p className={s.sub}>We turn it into separate facts for you to check. Nothing is used until you confirm it.</p>
              </div>
              <label
                className={`${s.drop} ${file || dragging ? s.dropOn : ""}`}
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
                  disabled={!!busy}
                  onChange={(e) => pick(e.target.files?.[0])}
                />
                <span className={s.doc} aria-hidden>
                  <span />
                  <span />
                  <span />
                  <span />
                </span>
                <span className={s.dropTitle}>{dragging ? "Drop it here" : file ? file.name : "Choose your resume, or drop it here"}</span>
                {file && !dragging && <span className={s.fine}>{file.size < 1024 * 1024 ? `${Math.max(1, Math.round(file.size / 1024))} KB` : `${(file.size / 1024 / 1024).toFixed(1)} MB`} · choose again to replace it</span>}
                <span className={s.formats}>
                  {["PDF", "Word", "Text", "Markdown"].map((f) => (
                    <span key={f}>{f}</span>
                  ))}
                </span>
                <span className={s.fine}>Up to 10 MB. Scanned PDFs aren&apos;t supported yet.</span>
              </label>
              {error && (
                <p role="alert" className={a.problem}>
                  {error}
                </p>
              )}
              <div className={s.actions}>
                <button className="btn btn-primary" type="button" disabled={!file || !!busy || error === FORMAT_MSG} onClick={readResume}>
                  {busy === "upload" ? "Uploading…" : busy === "read" ? "Reading your resume…" : "Read my resume"}
                </button>
                <button className="btn btn-secondary" type="button" disabled={!!busy} onClick={() => setStep(1)}>
                  Start from scratch
                </button>
                <span className={s.fine} role="status">
                  {busy === "upload"
                    ? `Uploading ${file?.name}…`
                    : busy === "read"
                      ? "Uploaded. Reading it and splitting it into facts; this can take a minute."
                      : demo && file
                        ? "With sample data, nothing is uploaded: you’ll see example entries."
                        : ""}
                </span>
              </div>
            </>
          )}

          {step === 1 && (
            <>
              <div className={s.head}>
                {total === 0 ? (
                  <>
                    <h1 className={s.h1}>Add your experience.</h1>
                    <p className={s.sub}>
                      Add each role, then write what you did there with real <strong className={s.num}>numbers</strong>. Your resume is
                      made only from what you write here.
                    </p>
                  </>
                ) : (
                  <>
                    <h1 className={s.h1}>Check what we read.</h1>
                    <p className={s.sub}>
                      Only confirmed entries go into your resume. Check the <strong className={s.num}>numbers</strong> and how
                      much of each one was yours.
                    </p>
                    <div className={s.progress} aria-label={`${done} of ${total} confirmed`}>
                      <span style={{ width: `${(done / total) * 100}%` }} />
                    </div>
                    <p className={s.fine}>
                      {done} of {total} confirmed
                    </p>
                  </>
                )}
              </div>

              {total === 0 && <Experience roles={experience.roles} projects={experience.projects} facts={experience.facts} confirmed={experience.confirmed} demo={demo} />}
              {groups.map((g) => (
                <div key={g.drafts[0]?.id ?? g.role} className={s.group}>
                  <div className={s.groupHead}>
                    <div>
                      <h2>{g.role}</h2>
                      <p className={s.dates}>{g.dates}</p>
                    </div>
                    <button
                      type="button"
                      className="btn btn-small btn-secondary"
                      disabled={!!busy}
                      onClick={() => confirm(g.drafts)}
                    >
                      Confirm all {g.drafts.length}
                    </button>
                  </div>
                  {g.drafts.map((d) => {
                    const on = !!confirmed[d.id];
                    return (
                      <div key={d.id} className={`${s.draft} ${on ? s.draftOn : ""}`}>
                        {editing?.id === d.id ? (
                          <form
                            className={s.editForm}
                            onSubmit={(e) => {
                              e.preventDefault();
                              saveEdit(d);
                            }}
                          >
                            <label className={s.field}>
                              <span>Fix what we read</span>
                              <textarea rows={3} maxLength={2000} required value={editing.text} onChange={(e) => setEditing({ id: d.id, text: e.target.value })} />
                            </label>
                            <div className={s.draftRow}>
                              <button type="submit" className="btn btn-primary btn-small" disabled={!!busy || !editing.text.trim()}>
                                {busy === `edit:${d.id}` ? "Saving…" : "Save"}
                              </button>
                              <button type="button" className="btn btn-secondary btn-small" disabled={!!busy} onClick={() => setEditing(null)}>
                                Cancel
                              </button>
                            </div>
                          </form>
                        ) : (
                          <p className={s.draftText}>{markNumbers(d.text, d.numbers)}</p>
                        )}
                        <div className={s.draftRow}>
                          <div className={s.levels} role="radiogroup" aria-label="How much of this was yours">
                            {LEVELS.map((l) => (
                              <button
                                key={l}
                                type="button"
                                role="radio"
                                aria-checked={level(d) === l}
                                disabled={!demo && on}
                                className={s.level}
                                onClick={() => setLevels({ ...levels, [d.id]: l })}
                              >
                                {l}
                              </button>
                            ))}
                          </div>
                          <button type="button" className={s.editBtn} disabled={!!busy || (!demo && on) || editing?.id === d.id} onClick={() => setEditing({ id: d.id, text: d.text })}>
                            Edit<span className="sr-only"> this entry</span>
                          </button>
                          <button
                            type="button"
                            className={on ? s.confirmOn : s.confirm}
                            aria-pressed={on}
                            disabled={!!busy || (!demo && on)}
                            onClick={() => (on ? setConfirmed({ ...confirmed, [d.id]: false }) : confirm([d]))}
                          >
                            {on ? (
                              <>
                                <StatusIcon name="check" /> Confirmed
                              </>
                            ) : busy === d.id ? (
                              "Confirming…"
                            ) : (
                              "Confirm"
                            )}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))}

              {edu.list.length > 0 && (
                <div className={s.group}>
                  <div className={s.groupHead}>
                    <div>
                      <h2>Education</h2>
                      <p className={s.fine}>Confirm a degree so jobs that ask for it can count it.</p>
                    </div>
                  </div>
                  {edu.list.map((e) => (
                    <div key={e.id} className={`${s.draft} ${edu.status(e) === "confirmed" ? s.draftOn : ""}`}>
                      <EducationRow bare e={e} status={edu.status(e)} busy={edu.busy} onSet={(to) => edu.set(e, to)} />
                    </div>
                  ))}
                  {edu.error && (
                    <p role="alert" className={a.problem}>
                      {edu.error}
                    </p>
                  )}
                </div>
              )}

              {question && (
                <form
                  className={s.mentor}
                  aria-labelledby="quick-q"
                  onSubmit={(e) => {
                    e.preventDefault();
                    reply(question, false);
                  }}
                >
                  <h2 id="quick-q" className={s.mentorLabel}>
                    One quick question
                  </h2>
                  <p className="margin-note">{question.question}</p>
                  <label className={s.field}>
                    <span className="sr-only">Your answer</span>
                    <textarea rows={2} maxLength={2000} value={answer} onChange={(e) => setAnswer(e.target.value)} placeholder="Your answer becomes a draft fact you confirm, e.g. Checkout conversion rose from 2.1% to 2.6%" />
                  </label>
                  <div className={s.draftRow}>
                    <button type="submit" className="btn btn-primary btn-small" disabled={!answer.trim() || !!ask.busy}>
                      {ask.busy === "answer" ? "Saving…" : "Save as draft fact"}
                    </button>
                    <button type="button" className="btn btn-secondary btn-small" disabled={!!ask.busy} onClick={() => reply(question, true)}>
                      {ask.busy === "skip" ? "Skipping…" : "Skip"}
                    </button>
                  </div>
                  {ask.error && (
                    <p role="alert" className={a.problem}>
                      {ask.error}
                    </p>
                  )}
                </form>
              )}
              {answerNote && (
                <p role="status" className={s.fine}>
                  {answerNote}
                </p>
              )}

              {error && (
                <p role="alert" className={a.problem}>
                  {error}
                </p>
              )}
              <div className={s.actions}>
                <button className="btn btn-primary" type="button" disabled={!done && total > 0} onClick={() => setStep(2)}>
                  {total === 0 ? "Continue" : `Continue with ${done} confirmed`}
                </button>
                <span className={s.fine}>{total === 0 ? "You can add more later from your profile." : "You can confirm the rest later from your profile."}</span>
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <div className={s.head}>
                <h1 className={s.h1}>How should your resume introduce you?</h1>
                <p className={s.sub}>This is the top of every resume you make. You can change it later from your profile.</p>
              </div>
              <div className={s.form}>
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
              </div>
              <div className={s.actions}>
                <button className="btn btn-secondary" type="button" onClick={() => setStep(3)}>
                  Skip for now
                </button>
              </div>
            </>
          )}

          {step === 3 && (
            <>
              <div className={s.head}>
                <h1 className={s.h1}>What are you aiming for?</h1>
                <p className={s.sub}>These decide which jobs are a real fit. Skip anything; we mark it unknown, never guess.</p>
              </div>
              <form className={s.form} onSubmit={saveGoals}>
                <label className={s.field}>
                  <span>Target role</span>
                  <input value={role} onChange={(e) => setRole(e.target.value)} placeholder="e.g. Senior Frontend Engineer" />
                </label>
                <label className={s.field}>
                  <span>Where can you work?</span>
                  <input value={where} onChange={(e) => setWhere(e.target.value)} placeholder="e.g. Bengaluru, Pune" />
                </label>
                <fieldset className={s.field}>
                  <legend>Work mode</legend>
                  <div className={s.chips}>
                    {MODES.map((m) => {
                      const on = modes.includes(m);
                      return (
                        <button
                          key={m}
                          type="button"
                          className={s.chip}
                          aria-pressed={on}
                          onClick={() => setModes(on ? modes.filter((x) => x !== m) : [...modes, m])}
                        >
                          {m}
                        </button>
                      );
                    })}
                  </div>
                </fieldset>
                <label className={s.check}>
                  <input type="checkbox" checked={visa} onChange={(e) => setVisa(e.target.checked)} /> I need visa sponsorship
                </label>
                {error && (
                  <p role="alert" className={a.problem}>
                    {error}
                  </p>
                )}
                <div className={s.actions}>
                  <button type="submit" className="btn btn-primary" disabled={!!busy}>
                    {busy === "goals" ? "Saving…" : busy === "build" ? "Building your resume…" : "Save and build my resume"}
                  </button>
                  <Link href={demo ? "/resumes/frontend-engineer" : "/resumes"} className="btn btn-secondary">
                    Skip for now
                  </Link>
                  <span className={s.fine} role="status">
                    {busy === "build" ? "Choosing and wording your confirmed facts, then checking every line. This can take a minute." : ""}
                  </span>
                </div>
              </form>
            </>
          )}
        </motion.section>
      </AnimatePresence>
    </div>
  );
}
