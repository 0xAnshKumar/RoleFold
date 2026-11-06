"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import a from "@/components/app/app.module.css";
import { StatusIcon } from "@/components/ui";
import { EmptyState } from "@/components/ui/State";
import { ApiError, api } from "@/lib/api";
import type { Achievement, CareerBreak, Language } from "@/lib/mock";
import { useAction } from "@/lib/useAction";
import { Problem } from "./Edit";
import s from "./profile.module.css";

// Career breaks, achievements/publications and languages. Demo: applied locally. Live: sent, then the page re-reads.

type Row = { id: string; version?: number };

function useRows<T extends Row>(live: T[], demo: boolean) {
  const router = useRouter();
  const [local, setLocal] = useState(live);
  const action = useAction();
  const send = (key: string, method: "POST" | "DELETE", path: string, body: unknown, apply: (rows: T[]) => T[]) =>
    action.run(key, async () => {
      if (demo) return setLocal(apply(local));
      try {
        await api(path, { method, body });
      } catch (err) {
        if (err instanceof ApiError && err.status === 409) router.refresh();
        throw err;
      }
      router.refresh();
    });
  const remove = (path: string, row: T) => send(`rm:${row.id}`, "DELETE", `${path}/${row.id}`, { version: row.version }, (l) => l.filter((x) => x.id !== row.id));
  const confirm = (path: string, row: T) =>
    send(`confirm:${row.id}`, "POST", `${path}/${row.id}/confirm`, { version: row.version }, (l) => l.map((x) => (x.id === row.id ? { ...x, status: "confirmed" } : x)));
  return { list: demo ? local : live, send, remove, confirm, ...action };
}

// Imported rows wait as drafts: confirm one, or remove it if it isn't yours.
function DraftActions({ busy, id, label, onConfirm, onRemove }: { busy: string | null; id: string; label: string; onConfirm: () => void; onRemove: () => void }) {
  return (
    <div className={s.eduActions}>
      <button type="button" className="btn btn-primary btn-small" disabled={!!busy} onClick={onConfirm}>
        {busy === `confirm:${id}` ? "Confirming…" : "Confirm"}
        <span className="sr-only"> {label}</span>
      </button>
      <button type="button" className="btn btn-secondary btn-small" disabled={!!busy} onClick={onRemove}>
        Not mine, remove<span className="sr-only"> {label}</span>
      </button>
    </div>
  );
}

const localId = () => `local-${Date.now()}`;
const monthLabel = (v: string) => (v ? new Date(`${v}-01T00:00:00Z`).toLocaleDateString("en-GB", { month: "short", year: "numeric", timeZone: "UTC" }) : "Present");

function RemoveButton({ busy, onClick, label }: { busy: boolean; onClick: () => void; label: string }) {
  return (
    <button type="button" className="btn btn-secondary btn-small" disabled={busy} onClick={onClick}>
      Remove<span className="sr-only"> {label}</span>
    </button>
  );
}

function SaveButtons({ busy, disabled, onCancel }: { busy: boolean; disabled?: boolean; onCancel: () => void }) {
  return (
    <div className={a.formActions}>
      <button className="btn btn-primary btn-small" type="submit" disabled={busy || disabled}>
        {busy ? "Saving…" : "Save"}
      </button>
      <button className="btn btn-secondary btn-small" type="button" disabled={busy} onClick={onCancel}>
        Cancel
      </button>
    </div>
  );
}

// ---- Career breaks (CEO D25): dates, the user's own words, and whether the resume shows it.

export function CareerBreaks({ initial, demo }: { initial: CareerBreak[]; demo: boolean }) {
  const { list, send, remove, confirm, busy, error } = useRows(initial, demo);
  const [adding, setAdding] = useState(false);
  const [v, setV] = useState({ from: "", to: "", reason: "", show: false });
  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    const body = { start_month: `${v.from}-01`, end_month: v.to ? `${v.to}-01` : null, reason_text: v.reason.trim() || null, show_on_resume: v.show };
    const row: CareerBreak = { id: localId(), dates: `${monthLabel(v.from)} – ${monthLabel(v.to)}`, reason: v.reason.trim(), showOnResume: v.show };
    if (await send("add", "POST", "/career-gaps", body, (l) => [row, ...l])) {
      setAdding(false);
      setV({ from: "", to: "", reason: "", show: false });
    }
  };
  const form = (
    <form className={`${a.card} ${a.form}`} onSubmit={add}>
      <div className={s.monthPair}>
        <label className={a.field}>
          <span>From</span>
          <input type="month" required value={v.from} max={v.to || undefined} onChange={(e) => setV({ ...v, from: e.target.value })} />
        </label>
        <label className={a.field}>
          <span>To</span>
          <input type="month" value={v.to} min={v.from || undefined} onChange={(e) => setV({ ...v, to: e.target.value })} />
          <span className={a.hint}>Leave empty if it’s ongoing.</span>
        </label>
      </div>
      <label className={a.field}>
        <span>In your words (optional)</span>
        <input value={v.reason} maxLength={200} onChange={(e) => setV({ ...v, reason: e.target.value })} placeholder="e.g. Caring for a family member" />
        <span className={a.hint}>Shown next to the dates only if you put the break on your resume.</span>
      </label>
      <label className={s.check}>
        <input type="checkbox" checked={v.show} onChange={(e) => setV({ ...v, show: e.target.checked })} /> Show it on my resumes as a dated career break
      </label>
      <Problem error={error} />
      <SaveButtons busy={busy === "add"} disabled={!v.from} onCancel={() => setAdding(false)} />
    </form>
  );

  if (list.length === 0 && !adding)
    return (
      <EmptyState
        level={3}
        icon="doc"
        title="No breaks recorded"
        className={s.emptyCard}
        action={
          <button type="button" className="btn btn-secondary btn-small" onClick={() => setAdding(true)}>
            Add a career break
          </button>
        }
      >
        Took time off? Add it your way and choose whether it shows on your resume. The reason is never used to judge job fit.
      </EmptyState>
    );
  return (
    <>
      {list.length > 0 && (
        <ul className={`${a.cardFlat} ${a.rows}`}>
          {list.map((g) => (
            <li key={g.id}>
              <div className={a.rowMain}>
                <span className={a.mono}>{g.dates}</span>
                {g.reason && <span>{g.reason}</span>}
                <span className={a.note}>{g.status === "draft" ? "Read from your resume. Confirm it’s yours." : g.showOnResume ? "Shown on your resumes" : "Kept off your resumes"}</span>
              </div>
              {g.status === "draft" ? (
                <DraftActions busy={busy} id={g.id} label={`career break ${g.dates}`} onConfirm={() => confirm("/career-gaps", g)} onRemove={() => remove("/career-gaps", g)} />
              ) : (
                <RemoveButton busy={!!busy} label={`career break ${g.dates}`} onClick={() => remove("/career-gaps", g)} />
              )}
            </li>
          ))}
        </ul>
      )}
      {adding ? (
        form
      ) : (
        <button type="button" className={`btn btn-secondary btn-small ${s.addMore}`} onClick={() => setAdding(true)}>
          Add a career break
        </button>
      )}
      {!adding && <Problem error={error} />}
    </>
  );
}

// ---- Achievements and publications: one line each, used on resumes exactly as written.

const KINDS = { achievement: "Achievement", publication: "Publication" } as const;

export function Achievements({ initial, demo }: { initial: Achievement[]; demo: boolean }) {
  const { list, send, remove, confirm, busy, error } = useRows(initial, demo);
  const [adding, setAdding] = useState(false);
  const [v, setV] = useState({ kind: "achievement" as Achievement["kind"], text: "" });
  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = v.text.trim();
    if (await send("add", "POST", "/achievements", { kind: v.kind, description: text }, (l) => [...l, { id: localId(), kind: v.kind, text }])) {
      setAdding(false);
      setV({ ...v, text: "" });
    }
  };
  return (
    <>
      {list.length === 0 && !adding && <p className={a.note}>None yet. Awards, rankings, talks, patents and publications go here.</p>}
      {list.length > 0 && (
        <ul className={`${a.cardFlat} ${a.rows}`}>
          {list.map((x) => (
            <li key={x.id}>
              <div className={a.rowMain}>
                <span>{x.text}</span>
                <span className={a.note}>{KINDS[x.kind]}</span>
                {x.status === "draft" && <span className={a.note}>Read from your resume. Confirm it’s yours.</span>}
              </div>
              {x.status === "draft" ? (
                <DraftActions busy={busy} id={x.id} label={x.text} onConfirm={() => confirm("/achievements", x)} onRemove={() => remove("/achievements", x)} />
              ) : (
                <RemoveButton busy={!!busy} label={x.text} onClick={() => remove("/achievements", x)} />
              )}
            </li>
          ))}
        </ul>
      )}
      {adding ? (
        <form className={`${a.card} ${a.form}`} onSubmit={add}>
          <label className={a.field}>
            <span>Kind</span>
            <select value={v.kind} onChange={(e) => setV({ ...v, kind: e.target.value as Achievement["kind"] })}>
              {Object.entries(KINDS).map(([k, label]) => (
                <option key={k} value={k}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className={a.field}>
            <span>As it should read on your resume</span>
            <input required maxLength={300} value={v.text} onChange={(e) => setV({ ...v, text: e.target.value })} placeholder={v.kind === "publication" ? "e.g. Iyer R. “Shipping smaller bundles.” Northwind blog, 2025." : "e.g. Speaker, React Bangalore meetup, 2024"} />
            <span className={a.hint}>Used exactly as you write it, never reworded. Saving confirms it.</span>
          </label>
          <Problem error={error} />
          <SaveButtons busy={busy === "add"} disabled={!v.text.trim()} onCancel={() => setAdding(false)} />
        </form>
      ) : (
        <button type="button" className={`btn btn-secondary btn-small ${s.addMore}`} onClick={() => setAdding(true)}>
          Add an achievement or publication
        </button>
      )}
      {!adding && <Problem error={error} />}
    </>
  );
}

// ---- Languages: imported ones wait as drafts like other entries.

export function Languages({ initial, demo }: { initial: Language[]; demo: boolean }) {
  const { list, send, remove, confirm, busy, error } = useRows(initial, demo);
  const [adding, setAdding] = useState(false);
  const [v, setV] = useState({ name: "", proficiency: "" });
  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    const row: Language = { id: localId(), name: v.name.trim(), proficiency: v.proficiency.trim(), status: "confirmed" };
    if (await send("add", "POST", "/languages", { name: row.name, proficiency: row.proficiency || null }, (l) => [...l, row])) {
      setAdding(false);
      setV({ name: "", proficiency: "" });
    }
  };
  return (
    <>
      {list.length === 0 && !adding && <p className={a.note}>None recorded yet.</p>}
      {list.length > 0 && (
        <ul className={`${a.cardFlat} ${a.rows}`}>
          {list.map((x) => (
            <li key={x.id}>
              <div className={a.rowMain}>
                <span className={a.rowTitle}>{x.name}</span>
                {x.proficiency && <span className={a.note}>{x.proficiency}</span>}
                {x.status === "confirmed" ? (
                  <span className={s.confirmed}>
                    <StatusIcon name="check" /> Confirmed
                  </span>
                ) : (
                  <span className={a.note}>Read from your resume. Confirm it’s yours.</span>
                )}
              </div>
              {x.status === "confirmed" ? (
                <RemoveButton busy={!!busy} label={x.name} onClick={() => remove("/languages", x)} />
              ) : (
                <DraftActions
                  busy={busy}
                  id={x.id}
                  label={x.name}
                  onConfirm={() => confirm("/languages", x)}
                  onRemove={() => send(`rm:${x.id}`, "POST", `/languages/${x.id}/reject`, { version: x.version }, (l) => l.filter((y) => y.id !== x.id))}
                />
              )}
            </li>
          ))}
        </ul>
      )}
      {adding ? (
        <form className={`${a.card} ${a.form}`} onSubmit={add}>
          <div className={s.monthPair}>
            <label className={a.field}>
              <span>Language</span>
              <input required maxLength={60} value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} placeholder="e.g. Kannada" />
            </label>
            <label className={a.field}>
              <span>How well (optional)</span>
              <input maxLength={60} value={v.proficiency} onChange={(e) => setV({ ...v, proficiency: e.target.value })} placeholder="e.g. Fluent" />
            </label>
          </div>
          <Problem error={error} />
          <SaveButtons busy={busy === "add"} disabled={!v.name.trim()} onCancel={() => setAdding(false)} />
        </form>
      ) : (
        <button type="button" className={`btn btn-secondary btn-small ${s.addMore}`} onClick={() => setAdding(true)}>
          Add a language
        </button>
      )}
      {!adding && <Problem error={error} />}
    </>
  );
}
