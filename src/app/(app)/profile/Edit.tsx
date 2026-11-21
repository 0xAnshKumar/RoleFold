"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import PageHeader from "@/components/app/PageHeader";
import a from "@/components/app/app.module.css";
import { StatusIcon } from "@/components/ui";
import { SignatureLine } from "@/components/ui/Proof";
import { EmptyState } from "@/components/ui/State";
import { ApiError, api } from "@/lib/api";
import { LEVELS, type Education, type Fact, type Goals, type Prefs, type Profile } from "@/lib/mock";
import { useAction } from "@/lib/useAction";
import s from "./profile.module.css";

// Demo mode: every edit here applies locally (sample data, nothing sent). Live: saved, then the page re-reads.

export type About = { name: string; headline: string; location: string; email: string; phone: string; links?: string[] };

export const OPTIONS = {
  seniority: ["Entry", "Mid", "Senior", "Lead", "Manager", "Director"],
  type: ["Full-time", "Part-time", "Contract", "Internship"],
  visa: ["Not needed", "Need sponsorship"],
  notice: ["Immediate", "15 days", "30 days", "60 days", "90 days"],
  modes: ["Onsite", "Hybrid", "Remote"],
};

const or = (v: string) => v || "Not set yet";
export const splitList = (v: string) =>
  v
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);

export function Problem({ error }: { error: string | null }) {
  return error ? (
    <p role="alert" className={a.problem}>
      {error}
    </p>
  ) : null;
}

/** A select that keeps a value the API returned even if it isn't one of ours. */
export function Choice({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (v: string) => void }) {
  const all = value && !options.includes(value) ? [value, ...options] : options;
  return (
    <label className={a.field}>
      <span>{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">Not set</option>
        {all.map((o) => (
          <option key={o}>{o}</option>
        ))}
      </select>
    </label>
  );
}

export function ModeChips({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  return (
    <fieldset className={a.field}>
      <legend>Work mode</legend>
      <div className={a.chips}>
        {OPTIONS.modes.map((m) => {
          const on = value.includes(m);
          return (
            <button key={m} type="button" className={a.chip} aria-pressed={on} onClick={() => onChange(on ? value.filter((x) => x !== m) : [...value, m])}>
              {m}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

/** Name, headline, location: PATCH /v1/me. Shared with onboarding. */
/** "a, b c" -> up to 4 links (the API's limit), split on commas or spaces. */
export const splitLinks = (v: string) => [...new Set(v.split(/[\s,]+/).map((x) => x.trim()).filter(Boolean))].slice(0, 4);

export function AboutForm({
  initial,
  demo,
  onSaved,
  onCancel,
  submitLabel = "Save details",
  fromResume = [],
}: {
  initial: About;
  demo: boolean;
  onSaved: (v: About) => void;
  onCancel?: () => void;
  submitLabel?: string;
  /** Fields filled from the uploaded resume (by the redaction step, never a model): flagged so the user checks them. */
  fromResume?: (keyof About)[];
}) {
  const router = useRouter();
  const [v, setV] = useState(initial);
  const [links, setLinks] = useState((initial.links ?? []).join(", "));
  const { busy, error, run } = useAction();
  const set = (k: keyof About) => (e: React.ChangeEvent<HTMLInputElement>) => setV({ ...v, [k]: e.target.value });
  const read = (k: keyof About) => (fromResume.includes(k) ? <span className={a.hint}>Read from your resume. Check it before saving.</span> : null);

  return (
    <form
      className={a.form}
      onSubmit={(e) => {
        e.preventDefault();
        const next = { name: v.name.trim(), headline: v.headline.trim(), location: v.location.trim(), email: v.email.trim(), phone: v.phone.trim(), links: splitLinks(links) };
        run("save", async () => {
          if (!demo) {
            await api("/me", { method: "PATCH", body: next });
            router.refresh();
          }
          onSaved(next);
        });
      }}
    >
      <label className={a.field}>
        <span>Your name</span>
        <input value={v.name} onChange={set("name")} autoComplete="name" maxLength={120} />
        {read("name") ?? <span className={a.hint}>Goes on your resumes. Never sent to an AI model.</span>}
      </label>
      <label className={a.field}>
        <span>Headline</span>
        <input value={v.headline} onChange={set("headline")} maxLength={200} placeholder="e.g. Frontend Engineer · React, TypeScript" />
      </label>
      <label className={a.field}>
        <span>Where you live</span>
        <input value={v.location} onChange={set("location")} autoComplete="address-level2" maxLength={120} placeholder="e.g. Bengaluru" />
      </label>
      <label className={a.field}>
        <span>Email for your resume</span>
        <input type="email" value={v.email} onChange={set("email")} autoComplete="email" maxLength={254} placeholder="e.g. you@example.com" />
        {read("email") ?? <span className={a.hint}>Only on your resume’s contact line. Never sent to an AI model.</span>}
      </label>
      <label className={a.field}>
        <span>Phone for your resume</span>
        <input type="tel" value={v.phone} onChange={set("phone")} autoComplete="tel" maxLength={40} placeholder="e.g. +91 98765 43210" />
        {read("phone")}
      </label>
      <label className={a.field}>
        <span>Links</span>
        <input value={links} onChange={(e) => setLinks(e.target.value)} maxLength={820} placeholder="e.g. github.com/you, linkedin.com/in/you" />
        <span className={a.hint}>GitHub, LinkedIn or portfolio, separated by commas (up to 4). Shown on your resume’s contact line.</span>
      </label>
      <Problem error={error} />
      <div className={a.formActions}>
        <button className="btn btn-primary" type="submit" disabled={!!busy}>
          {busy ? "Saving…" : submitLabel}
        </button>
        {onCancel && (
          <button className="btn btn-secondary" type="button" disabled={!!busy} onClick={onCancel}>
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}

export function ProfileHeader({ initial, demo }: { initial: About; demo: boolean }) {
  const [about, setAbout] = useState(initial);
  const [editing, setEditing] = useState(false);
  return (
    <>
      <PageHeader
        title={about.name || "Your profile"}
        context={[about.headline, about.location].filter(Boolean).join(" · ") || undefined}
        sub="Everything your resumes and job checks are allowed to use. Only confirmed facts count; drafts wait for you."
      >
        <Link href="/onboarding" className="btn btn-secondary">
          Import a resume
        </Link>
        <button type="button" className="btn btn-secondary" aria-expanded={editing} onClick={() => setEditing(!editing)}>
          Edit your details
        </button>
      </PageHeader>
      {editing && (
        <div className={`${a.card} ${s.aboutCard}`}>
          <AboutForm
            initial={about}
            demo={demo}
            onSaved={(v) => {
              setAbout(v);
              setEditing(false);
            }}
            onCancel={() => setEditing(false)}
          />
        </div>
      )}
    </>
  );
}

/** Edit-in-place side card: a definition list, or its form. */
function SideCard({ title, note, children, form, editLabel }: { title: string; note?: string; children: React.ReactNode; form: ((close: () => void) => React.ReactNode) | null; editLabel: string }) {
  const [editing, setEditing] = useState(false);
  return (
    <div className={`${a.card} ${s.goals}`}>
      <h2 className={s.sideTitle}>{title}</h2>
      {note && <p className={a.note}>{note}</p>}
      {editing && form ? (
        form(() => setEditing(false))
      ) : (
        <>
          {children}
          <button type="button" className="btn btn-secondary btn-small" onClick={() => setEditing(true)}>
            {editLabel}
          </button>
        </>
      )}
    </div>
  );
}

function useSave<T>(path: string, demo: boolean, initial: T) {
  const router = useRouter();
  const [value, setValue] = useState(initial);
  const action = useAction();
  const save = (next: T, close: () => void) =>
    action.run("save", async () => {
      if (!demo) {
        await api(path, { method: "PUT", body: next });
        router.refresh();
      }
      setValue(next);
      close();
    });
  return { value, save, ...action };
}

function FormButtons({ busy, close }: { busy: boolean; close: () => void }) {
  return (
    <div className={a.formActions}>
      <button className="btn btn-primary btn-small" type="submit" disabled={busy}>
        {busy ? "Saving…" : "Save"}
      </button>
      <button className="btn btn-secondary btn-small" type="button" disabled={busy} onClick={close}>
        Cancel
      </button>
    </div>
  );
}

export function GoalsCard({ initial, demo }: { initial: Goals; demo: boolean }) {
  const { value: g, save, busy, error } = useSave("/goals", demo, initial);
  return (
    <SideCard
      title="What you’re aiming for"
      editLabel="Edit goals"
      form={(close) => <GoalsForm initial={g} busy={!!busy} error={error} close={close} onSubmit={(next) => save(next, close)} />}
    >
      <dl className={s.dl}>
        <dt>Target role</dt>
        <dd>{or(g.roles.join(", "))}</dd>
        <dt>Industries</dt>
        <dd>{or(g.industries.join(", "))}</dd>
        <dt>Seniority</dt>
        <dd>{or(g.seniority)}</dd>
      </dl>
    </SideCard>
  );
}

function GoalsForm({ initial, busy, error, close, onSubmit }: { initial: Goals; busy: boolean; error: string | null; close: () => void; onSubmit: (g: Goals) => void }) {
  const [roles, setRoles] = useState(initial.roles.join(", "));
  const [industries, setIndustries] = useState(initial.industries.join(", "));
  const [seniority, setSeniority] = useState(initial.seniority);
  return (
    <form
      className={a.form}
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit({ roles: splitList(roles), industries: splitList(industries), seniority });
      }}
    >
      <label className={a.field}>
        <span>Target roles</span>
        <input value={roles} onChange={(e) => setRoles(e.target.value)} placeholder="e.g. Senior Frontend Engineer" />
        <span className={a.hint}>Separate several with commas.</span>
      </label>
      <label className={a.field}>
        <span>Industries</span>
        <input value={industries} onChange={(e) => setIndustries(e.target.value)} placeholder="e.g. Fintech, E-commerce" />
      </label>
      <Choice label="Seniority" value={seniority} options={OPTIONS.seniority} onChange={setSeniority} />
      <Problem error={error} />
      <FormButtons busy={busy} close={close} />
    </form>
  );
}

export function PrefsCard({ initial, demo }: { initial: Prefs; demo: boolean }) {
  const { value: p, save, busy, error } = useSave("/preferences", demo, initial);
  return (
    <SideCard
      title="Your must-haves"
      note="Jobs that conflict with these are marked not eligible."
      editLabel="Edit must-haves"
      form={(close) => <PrefsForm initial={p} busy={!!busy} error={error} close={close} onSubmit={(next) => save(next, close)} />}
    >
      <dl className={s.dl}>
        <dt>Where</dt>
        <dd>{or(p.locations.join(", "))}</dd>
        <dt>Work mode</dt>
        <dd>{or(p.modes.join(" or "))}</dd>
        <dt>Type</dt>
        <dd>{or(p.type)}</dd>
        <dt>Visa</dt>
        <dd>{or(p.visa)}</dd>
        <dt>Notice period</dt>
        <dd>{or(p.notice)}</dd>
      </dl>
    </SideCard>
  );
}

function PrefsForm({ initial, busy, error, close, onSubmit }: { initial: Prefs; busy: boolean; error: string | null; close: () => void; onSubmit: (p: Prefs) => void }) {
  const [p, setP] = useState(initial);
  const [locations, setLocations] = useState(initial.locations.join(", "));
  return (
    <form
      className={a.form}
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit({ ...p, locations: splitList(locations) });
      }}
    >
      <label className={a.field}>
        <span>Where can you work?</span>
        <input value={locations} onChange={(e) => setLocations(e.target.value)} placeholder="e.g. Bengaluru, Pune" />
        <span className={a.hint}>Cities or “Anywhere in India”, separated by commas.</span>
      </label>
      <ModeChips value={p.modes} onChange={(modes) => setP({ ...p, modes })} />
      <Choice label="Type" value={p.type} options={OPTIONS.type} onChange={(type) => setP({ ...p, type })} />
      <Choice label="Visa" value={p.visa} options={OPTIONS.visa} onChange={(visa) => setP({ ...p, visa })} />
      <Choice label="Notice period" value={p.notice} options={OPTIONS.notice} onChange={(notice) => setP({ ...p, notice })} />
      <Problem error={error} />
      <FormButtons busy={busy} close={close} />
    </form>
  );
}

// ---- Experience: confirmed facts, add and edit.

type Role = Profile["roles"][number];
type FactDraft = { roleId: string; text: string; level: Fact["responsibility"] };

function FactForm({
  roles,
  initial,
  busy,
  error,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  roles?: Role[];
  initial: FactDraft;
  busy: boolean;
  error: string | null;
  submitLabel: string;
  onSubmit: (v: FactDraft) => void;
  onCancel: () => void;
}) {
  const [v, setV] = useState(initial);
  return (
    <form
      className={a.form}
      onSubmit={(e) => {
        e.preventDefault();
        if (v.text.trim()) onSubmit({ ...v, text: v.text.trim() });
      }}
    >
      {roles && (
        <label className={a.field}>
          <span>Which role or project was this?</span>
          <select value={v.roleId} onChange={(e) => setV({ ...v, roleId: e.target.value })}>
            {roles.map((r) => (
              <option key={r.id} value={r.id}>
                {[r.title, r.org].filter(Boolean).join(" · ")}
              </option>
            ))}
          </select>
        </label>
      )}
      <label className={a.field}>
        <span>What happened</span>
        <textarea rows={3} required maxLength={2000} value={v.text} onChange={(e) => setV({ ...v, text: e.target.value })} placeholder="e.g. Cut product-page load time from 4.2s to 2.1s by moving images to a CDN" />
        <span className={a.hint}>Write it as it was, with real numbers. Resumes can only reword what you write here.</span>
      </label>
      <fieldset className={a.field}>
        <legend>How much of it was yours?</legend>
        <div className={a.chips} role="radiogroup" aria-label="How much of it was yours">
          {LEVELS.map((l) => (
            <button key={l} type="button" role="radio" aria-checked={v.level === l} className={a.chip} onClick={() => setV({ ...v, level: l })}>
              {l}
            </button>
          ))}
        </div>
      </fieldset>
      <Problem error={error} />
      <div className={a.formActions}>
        <button className="btn btn-primary btn-small" type="submit" disabled={busy || !v.text.trim()}>
          {busy ? "Saving…" : submitLabel}
        </button>
        <button className="btn btn-secondary btn-small" type="button" disabled={busy} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}

const today = () => new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

type RoleDraft = { title: string; org: string; location: string; from: string; to: string };
const monthLabel = (v: string) => (v ? new Date(`${v}-01T00:00:00Z`).toLocaleDateString("en-GB", { month: "short", year: "numeric", timeZone: "UTC" }) : "Present");

/** A role you add yourself (no resume to import, or one it missed). Facts are then added under it. */
function RoleForm({ busy, error, onSubmit, onCancel }: { busy: boolean; error: string | null; onSubmit: (v: RoleDraft) => void; onCancel: () => void }) {
  const [v, setV] = useState<RoleDraft>({ title: "", org: "", location: "", from: "", to: "" });
  const ready = v.title.trim() && v.org.trim() && v.from;
  return (
    <form
      className={a.form}
      onSubmit={(e) => {
        e.preventDefault();
        if (ready) onSubmit(v);
      }}
    >
      <label className={a.field}>
        <span>Job title</span>
        <input required maxLength={200} value={v.title} onChange={(e) => setV({ ...v, title: e.target.value })} placeholder="e.g. Frontend Engineer" />
      </label>
      <label className={a.field}>
        <span>Employer</span>
        <input required maxLength={200} value={v.org} onChange={(e) => setV({ ...v, org: e.target.value })} placeholder="e.g. Northwind Commerce" />
      </label>
      <label className={a.field}>
        <span>Location (optional)</span>
        <input maxLength={200} value={v.location} onChange={(e) => setV({ ...v, location: e.target.value })} placeholder="e.g. Bengaluru" />
      </label>
      <div className={s.monthPair}>
        <label className={a.field}>
          <span>From</span>
          <input type="month" required value={v.from} max={v.to || undefined} onChange={(e) => setV({ ...v, from: e.target.value })} />
        </label>
        <label className={a.field}>
          <span>To</span>
          <input type="month" value={v.to} min={v.from || undefined} onChange={(e) => setV({ ...v, to: e.target.value })} />
          <span className={a.hint}>Leave empty if you still work here.</span>
        </label>
      </div>
      <Problem error={error} />
      <div className={a.formActions}>
        <button className="btn btn-primary btn-small" type="submit" disabled={busy || !ready}>
          {busy ? "Saving…" : "Save role"}
        </button>
        <button className="btn btn-secondary btn-small" type="button" disabled={busy} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}

export function Experience({
  roles: liveRoles,
  projects = [],
  facts: liveFacts,
  confirmed,
  demo,
}: {
  roles: Role[];
  projects?: Profile["projects"];
  facts: Fact[];
  confirmed: number;
  demo: boolean;
}) {
  const router = useRouter();
  // Live renders from the server's data (refreshed after each save); demo keeps its edits locally.
  const [local, setLocal] = useState({ roles: liveRoles, facts: liveFacts });
  // Projects are listed (and can take new facts) like roles, live only: sample projects have no facts.
  const projectRows: Role[] = demo ? [] : projects.map((p) => ({ id: p.id, title: p.name, org: "Project", dates: p.dates, factIds: p.factIds ?? [] }));
  const isProject = (id: string) => projectRows.some((p) => p.id === id);
  const { roles, facts } = demo ? local : { roles: [...liveRoles, ...projectRows], facts: liveFacts };
  const [adding, setAdding] = useState(false);
  const [addingRole, setAddingRole] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const { busy, error, setError, run } = useAction();
  const findFact = (id: string) => facts.find((f) => f.id === id);
  const level = (l: Fact["responsibility"]) => LEVELS.indexOf(l) + 1;
  const conflict = (err: unknown) => {
    if (err instanceof ApiError && err.status === 409) {
      router.refresh();
      return new Error("This fact changed somewhere else since you opened the page. We’ve reloaded it; check it and try again.");
    }
    return err;
  };

  // POST /v1/experiences, then confirm it: a role you type yourself is yours, like a fact you write.
  const addRole = (v: RoleDraft) =>
    run("role", async () => {
      const [title, org, location] = [v.title.trim(), v.org.trim(), v.location.trim()];
      if (demo) {
        const role: Role = { id: `exp-local-${Date.now()}`, title, org: [org, location].filter(Boolean).join(", "), dates: `${monthLabel(v.from)} – ${monthLabel(v.to)}`, factIds: [] };
        setLocal({ ...local, roles: [role, ...local.roles] });
      } else {
        const e = await api<{ id: string; version: number }>("/experiences", {
          method: "POST",
          body: { title, employer: org, location: location || null, start_month: `${v.from}-01`, end_month: v.to ? `${v.to}-01` : null },
        });
        try {
          await api(`/experiences/${e.id}/confirm`, { method: "POST", body: { version: e.version } });
        } finally {
          router.refresh();
        }
      }
      setAddingRole(false);
    });
  const openForm = (role: boolean) => {
    setError(null);
    setEditing(null);
    setAdding(!role);
    setAddingRole(role);
  };

  // A fact you write yourself is confirmed as you save it: the button says so.
  const add = (v: FactDraft) =>
    run("add", async () => {
      if (demo) {
        const id = `F-${30 + local.facts.length}`;
        const role = local.roles.find((r) => r.id === v.roleId)!;
        setLocal({
          facts: [...local.facts, { id, role: [role.title, role.org].join(" · "), text: v.text, responsibility: v.level, confirmedOn: today() }],
          roles: local.roles.map((r) => (r.id === v.roleId ? { ...r, factIds: [...r.factIds, id] } : r)),
        });
      } else {
        const f = await api<{ id: string; version: number }>("/facts", {
          method: "POST",
          body: { owner_type: isProject(v.roleId) ? "project" : "experience", owner_id: v.roleId, description: v.text, responsibility_level: level(v.level) },
        });
        try {
          await api(`/facts/${f.id}/confirm`, { method: "POST", body: { version: f.version, responsibility_level: level(v.level) } });
        } catch (err) {
          router.refresh();
          throw new Error(`Saved as a draft, but not confirmed yet: ${(err as Error).message} You can confirm it from your queue.`);
        }
        router.refresh();
      }
      setAdding(false);
    });

  const edit = (f: Fact, v: FactDraft) =>
    run(f.id, async () => {
      if (demo) {
        setLocal({ ...local, facts: local.facts.map((x) => (x.id === f.id ? { ...x, text: v.text, responsibility: v.level, confirmedOn: today() } : x)) });
      } else {
        try {
          await api(`/facts/${f.id}`, { method: "PATCH", body: { version: f.version, description: v.text, responsibility_level: level(v.level) } });
        } catch (err) {
          throw conflict(err);
        }
        router.refresh();
      }
      setEditing(null);
    });

  return (
    <section className={a.section} aria-labelledby="exp">
      <div className={a.sectionHead}>
        <h2 id="exp" className={a.h2}>
          Experience
        </h2>
        <div className={s.sectionActions}>
          <p className={a.note}>{demo ? facts.length + (confirmed - liveFacts.length) : confirmed} confirmed facts</p>
          {roles.length > 0 && !addingRole && (
            <button type="button" className="btn btn-secondary btn-small" onClick={() => openForm(true)}>
              Add a role
            </button>
          )}
          {roles.length > 0 && !adding && (
            <button type="button" className="btn btn-primary btn-small" onClick={() => openForm(false)}>
              Add a fact
            </button>
          )}
        </div>
      </div>
      {addingRole && (
        <div className={`${a.card} ${s.factForm}`}>
          <h3 className={s.sideTitle}>Add a role</h3>
          <RoleForm busy={busy === "role"} error={error} onSubmit={addRole} onCancel={() => setAddingRole(false)} />
        </div>
      )}
      {adding && (
        <div className={`${a.card} ${s.factForm}`}>
          <h3 className={s.sideTitle}>Add a fact</h3>
          <FactForm
            roles={roles}
            initial={{ roleId: roles[0].id, text: "", level: "Owned" }}
            busy={busy === "add"}
            error={error}
            submitLabel="Save as a confirmed fact"
            onSubmit={add}
            onCancel={() => setAdding(false)}
          />
        </div>
      )}
      {roles.length === 0 && !addingRole && (
        <EmptyState
          level={3}
          title="Nothing confirmed yet"
          action={
            <Link href="/onboarding" className="btn btn-primary btn-small">
              Import my resume
            </Link>
          }
          secondary={
            <button type="button" className="btn btn-secondary btn-small" onClick={() => openForm(true)}>
              Add a role
            </button>
          }
        >
          Import the resume you have and confirm what we read, or add a role and write its facts yourself. Only confirmed facts are used.
        </EmptyState>
      )}
      {roles.map((r) => (
        <article key={r.id ?? `${r.title}-${r.org}-${r.dates}`} className={s.role}>
          <header className={s.roleHead}>
            <div>
              <h3>{r.title || "Untitled role"}</h3>
              <p>{r.org}</p>
            </div>
            <span className={a.mono}>{r.dates}</span>
          </header>
          <ul className={s.facts}>
            {r.factIds.length === 0 && <li className={`${s.fact} ${a.note}`}>No confirmed facts here yet.</li>}
            {r.factIds.map((id) => {
              const f = findFact(id);
              if (!f) return null;
              return (
                <li key={id} className={s.fact}>
                  <div className={s.factMeta}>
                    <span className="tag" title={f.id}>
                      {f.id.length > 8 ? f.id.slice(0, 6) : f.id}
                    </span>
                    <span className={s.level}>{f.responsibility}</span>
                    <SignatureLine date={f.confirmedOn} />
                  </div>
                  {editing === f.id ? (
                    <FactForm
                      initial={{ roleId: r.id, text: f.text, level: f.responsibility }}
                      busy={busy === f.id}
                      error={error}
                      submitLabel="Save and confirm"
                      onSubmit={(v) => edit(f, v)}
                      onCancel={() => setEditing(null)}
                    />
                  ) : (
                    <>
                      <p className={s.factText}>{f.text}</p>
                      <button
                        type="button"
                        className={s.edit}
                        disabled={!!busy}
                        aria-label={`Edit fact: ${f.text.split(/\s+/).length > 6 ? `${f.text.split(/\s+/).slice(0, 6).join(" ")}…` : f.text}`}
                        onClick={() => {
                          setError(null);
                          setAdding(false);
                          setEditing(f.id);
                        }}
                      >
                        Edit
                      </button>
                    </>
                  )}
                </li>
              );
            })}
          </ul>
        </article>
      ))}
    </section>
  );
}

// ---- Education: imported rows wait for the user like facts do. Only confirmed ones count in job checks and resumes.

/** POST /v1/education/{id}/confirm|reject, then a refresh (profile counts, the nav's queue). Demo: applied locally. */
export function useEducation(initial: Education[], demo: boolean) {
  const router = useRouter();
  const [local, setLocal] = useState<Record<string, "confirmed" | "rejected">>({});
  const action = useAction();
  const set = (e: Education, to: "confirmed" | "rejected") =>
    action.run(`${e.id}:${to}`, async () => {
      if (!demo) {
        try {
          await api(`/education/${e.id}/${to === "confirmed" ? "confirm" : "reject"}`, { method: "POST", body: { version: e.version } });
        } catch (err) {
          if (err instanceof ApiError && err.status === 409) router.refresh();
          throw err;
        }
        router.refresh();
      }
      setLocal((l) => ({ ...l, [e.id!]: to }));
    });
  const status = (e: Education) => local[e.id ?? ""] ?? e.status ?? "confirmed";
  return { list: initial.filter((e) => status(e) !== "rejected"), status, set, ...action };
}

export function EducationRow({ e, status, busy, onSet, bare }: { e: Education; status: string; busy: string | null; onSet: (to: "confirmed" | "rejected") => void; bare?: boolean }) {
  return (
    <div className={bare ? s.edu : `${a.card} ${s.edu}`}>
      <div>
        <p className={s.eduDegree}>{e.degree || "Degree not read"}</p>
        <p className={a.note}>{e.org}</p>
        {status === "confirmed" ? (
          <p className={s.confirmed}>
            <StatusIcon name="check" /> Confirmed
          </p>
        ) : (
          <div className={s.eduActions}>
            <button type="button" className="btn btn-primary btn-small" disabled={!!busy || !e.id} onClick={() => onSet("confirmed")}>
              {busy === `${e.id}:confirmed` ? "Confirming…" : "Confirm"}
            </button>
            <button type="button" className="btn btn-secondary btn-small" disabled={!!busy || !e.id} onClick={() => onSet("rejected")}>
              {busy === `${e.id}:rejected` ? "Removing…" : "Not mine, remove"}
            </button>
          </div>
        )}
      </div>
      <span className={a.mono}>{e.dates}</span>
    </div>
  );
}

export function EducationList({ initial, demo }: { initial: Education[]; demo: boolean }) {
  const { list, status, set, busy, error } = useEducation(initial, demo);
  return (
    <>
      {list.length === 0 && <p className={a.note}>None recorded yet.</p>}
      {list.map((e, i) => (
        <EducationRow key={e.id ?? `${i}-${e.degree}`} e={e} status={status(e)} busy={busy} onSet={(to) => set(e, to)} />
      ))}
      <Problem error={error} />
    </>
  );
}
