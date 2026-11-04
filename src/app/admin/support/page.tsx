"use client";

import { useState } from "react";
import PageHeader from "@/components/app/PageHeader";
import a from "@/components/app/app.module.css";
import { api } from "@/lib/api";
import { useAction } from "@/lib/useAction";
import s from "../admin.module.css";
import { REASON_MIN, ReasonField, when } from "../shared";

type Row = Record<string, unknown>;
type View = { session_id: string; expires_at: string; user: Row | null; data: Record<string, Row[]> };

const show = (v: unknown) => (v === null || v === undefined || v === "" ? "–" : typeof v === "object" ? JSON.stringify(v, null, 1) : String(v));

function Fields({ row }: { row: Row }) {
  return (
    <dl className={s.record}>
      {Object.entries(row).map(([k, v]) => (
        <div key={k} style={{ display: "contents" }}>
          <dt>{k}</dt>
          <dd>{show(v)}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Open a time-boxed, read-only support session (reason required, audited), then read the user's data. */
export default function SupportPage() {
  const [who, setWho] = useState("");
  const [reason, setReason] = useState("");
  const [view, setView] = useState<View | null>(null);
  const { busy, error, run } = useAction();
  const load = (sessionId: string) => run("load", async () => setView(await api<View>(`/admin/support/${sessionId}`)));

  return (
    <>
      <PageHeader
        title="Support access"
        sub="Read one person’s data to answer a support request. Each session is read-only, ends on its own, and every open and read is in the audit log."
      />

      {!view ? (
        <section className={`${a.card} ${a.section}`} aria-labelledby="open">
          <h2 id="open" className={a.h2}>
            Open a session
          </h2>
          <form
            className={a.form}
            onSubmit={(e) => {
              e.preventDefault();
              run("open", async () => {
                const session = await api<{ session_id: string }>("/admin/support", { method: "POST", body: { user: who, reason } });
                setView(await api<View>(`/admin/support/${session.session_id}`));
              });
            }}
          >
            <label className={a.field}>
              <span>Whose data</span>
              <input value={who} onChange={(e) => setWho(e.target.value)} required autoComplete="off" spellCheck={false} />
              <span className={a.hint}>Their user id, email, or sign-in subject.</span>
            </label>
            <ReasonField id="support-reason" value={reason} onChange={setReason} />
            {error && (
              <p role="alert" className={a.problem}>
                {error}
              </p>
            )}
            <div className={a.formActions}>
              <button className="btn btn-primary" type="submit" disabled={!who.trim() || reason.trim().length < REASON_MIN || !!busy}>
                {busy ? "Opening…" : "Open read-only session"}
              </button>
            </div>
          </form>
        </section>
      ) : (
        <section className={a.section} aria-labelledby="view">
          <div className={a.sectionHead}>
            <h2 id="view" className={a.h2}>
              {show(view.user?.name ?? view.user?.email ?? view.user?.id)}
            </h2>
            <div className={a.formActions}>
              <button type="button" className="btn btn-secondary btn-small" disabled={!!busy} onClick={() => load(view.session_id)}>
                {busy ? "Reloading…" : "Reload"}
              </button>
              <button type="button" className="btn btn-secondary btn-small" onClick={() => setView(null)}>
                Close
              </button>
            </div>
          </div>
          <p className={a.note}>Read-only until {when(view.expires_at)}. After that, open a new session with a reason.</p>
          {error && (
            <p role="alert" className={a.problem}>
              {error}
            </p>
          )}
          <div className={a.card}>
            {view.user && (
              <details className={s.tableBlock} open>
                <summary>Account</summary>
                <Fields row={view.user} />
              </details>
            )}
            {Object.entries(view.data).map(([table, rows]) => (
              <details key={table} className={s.tableBlock}>
                <summary>
                  {table} ({rows.length})
                </summary>
                {rows.map((r, i) => (
                  <Fields key={String(r.id ?? i)} row={r} />
                ))}
              </details>
            ))}
          </div>
        </section>
      )}
    </>
  );
}
