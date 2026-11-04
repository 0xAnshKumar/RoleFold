"use client";

import { useRef, useState } from "react";
import PageHeader from "@/components/app/PageHeader";
import a from "@/components/app/app.module.css";
import { api } from "@/lib/api";
import { useAction } from "@/lib/useAction";
import s from "./admin.module.css";
import { Loaded, REASON_MIN, ReasonField, useLoad, when } from "./shared";

type Stats = {
  queues: { type: string; queued: number; running: number; failed: number; oldest_queued_seconds: number }[];
  llm_spend_today_usd: number;
  llm_daily_cap_usd: number;
};
type FailedTask = {
  id: string;
  type: string;
  status: "dead" | "failed";
  user_id: string | null;
  attempts: number;
  max_attempts: number;
  error_code: string | null;
  error_message: string | null;
  updated_at: string;
};

const age = (sec: number) => (sec < 60 ? `${sec} s` : sec < 3600 ? `${Math.floor(sec / 60)} min` : `${Math.floor(sec / 3600)} h ${Math.floor((sec % 3600) / 60)} min`);
const usd = (n: number) => `$${n.toFixed(2)}`;

export default function OpsPage() {
  const stats = useLoad<Stats>("/admin/stats");
  const tasks = useLoad<{ items: FailedTask[] }>("/admin/tasks");
  const dialog = useRef<HTMLDialogElement>(null);
  const [target, setTarget] = useState<FailedTask | null>(null);
  const [reason, setReason] = useState("");
  const { busy, error, setError, run } = useAction();

  return (
    <>
      <PageHeader title="Operations" sub="Queue waits, today’s AI spend against the cap, and tasks that stopped retrying." />

      <section className={a.section} aria-labelledby="queues">
        <h2 id="queues" className={a.h2}>
          Queues
        </h2>
        <Loaded state={stats}>
          {(d) => (
            <>
              <div className={`${a.cardFlat} ${s.tableWrap}`}>
                <table className={s.table}>
                  <thead>
                    <tr>
                      <th>Task type</th>
                      <th className={s.num}>Waiting</th>
                      <th className={s.num}>Running</th>
                      <th className={s.num}>Failed</th>
                      <th className={s.num}>Longest wait</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.queues.map((q) => (
                      <tr key={q.type}>
                        <td>{q.type}</td>
                        <td className={s.num}>{q.queued}</td>
                        <td className={s.num}>{q.running}</td>
                        <td className={s.num}>{q.failed}</td>
                        <td className={s.num}>{q.queued ? age(q.oldest_queued_seconds) : "–"}</td>
                      </tr>
                    ))}
                    {!d.queues.length && (
                      <tr>
                        <td colSpan={5}>No tasks yet.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              <div className={`${a.card} ${a.meter}`}>
                <div className={a.meterTop}>
                  <span>AI spend today (UTC)</span>
                  <span>
                    {usd(d.llm_spend_today_usd)} of {usd(d.llm_daily_cap_usd)} cap
                  </span>
                </div>
                <div className={a.meterTrack}>
                  <span className={a.meterFill} style={{ width: `${Math.min(100, (d.llm_spend_today_usd / d.llm_daily_cap_usd) * 100)}%` }} />
                </div>
                <p className={a.note}>At the cap, AI tasks wait until 00:00 UTC. Nothing switches provider.</p>
              </div>
            </>
          )}
        </Loaded>
      </section>

      <section className={a.section} aria-labelledby="failed">
        <h2 id="failed" className={a.h2}>
          Failed tasks
        </h2>
        <Loaded state={tasks}>
          {(d) =>
            d.items.length ? (
              <ul className={`${a.cardFlat} ${a.rows}`}>
                {d.items.map((t) => (
                  <li key={t.id}>
                    <div className={a.rowMain}>
                      <span className={a.rowTitle}>
                        {t.type} · {t.status === "dead" ? `out of retries (${t.attempts} of ${t.max_attempts})` : "not retryable"}
                      </span>
                      <span className={s.err}>
                        {t.error_code}
                        {t.error_message ? `: ${t.error_message}` : ""}
                      </span>
                      <span className={a.mono}>
                        {when(t.updated_at)} · task {t.id}
                        {t.user_id ? ` · user ${t.user_id}` : ""}
                      </span>
                    </div>
                    <button
                      type="button"
                      className="btn btn-secondary btn-small"
                      onClick={() => {
                        setTarget(t);
                        setReason("");
                        setError(null);
                        dialog.current?.showModal();
                      }}
                    >
                      Replay…
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <div className={a.empty}>
                <p className="margin-note">Nothing has failed.</p>
              </div>
            )
          }
        </Loaded>
      </section>

      <dialog ref={dialog} className={a.dialog} aria-labelledby="replay-title" onCancel={(e) => busy && e.preventDefault()}>
        <form
          className={a.form}
          onSubmit={(e) => {
            e.preventDefault();
            if (!target) return;
            run("replay", async () => {
              await api(`/admin/tasks/${target.id}/replay`, { method: "POST", body: { reason } });
              dialog.current?.close();
              await Promise.all([tasks.reload(), stats.reload()]);
            });
          }}
        >
          <h2 id="replay-title" className={a.dialogTitle}>
            Replay this {target?.type} task?
          </h2>
          <p className={a.note}>It goes back in the queue with fresh retries. Tasks are safe to run twice, and a released plan allowance isn’t charged again.</p>
          <ReasonField id="replay-reason" value={reason} onChange={setReason} />
          {error && (
            <p role="alert" className={a.problem}>
              {error}
            </p>
          )}
          <div className={a.formActions}>
            <button className="btn btn-primary" type="submit" disabled={reason.trim().length < REASON_MIN || !!busy}>
              {busy ? "Replaying…" : "Replay task"}
            </button>
            <button className="btn btn-secondary" type="button" disabled={!!busy} onClick={() => dialog.current?.close()}>
              Cancel
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
