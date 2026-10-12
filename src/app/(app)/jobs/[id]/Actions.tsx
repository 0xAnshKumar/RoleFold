"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import a from "@/components/app/app.module.css";
import { FactId, Stamp } from "@/components/ui";
import { api } from "@/lib/api";
import type { Fact, JobStatus, Match, Requirement, SavedJob, Status } from "@/lib/mock";
import { useAction } from "@/lib/useAction";
import s from "./match.module.css";

// Demo mode: both actions apply locally (sample data, nothing sent). Live: saved, then the page re-reads.

/** One requirement row, with "I don't have this" (POST .../requirements/{rid}/gap) and its undo. */
export function RequirementRow({ jobId, r, fact, demo }: { jobId: string; r: Requirement; fact?: Fact; demo: boolean }) {
  const router = useRouter();
  const [status, setStatus] = useState<Status | null>(null); // local until the refreshed match arrives
  const shown = status ?? r.status;
  const { busy, error, run } = useAction();

  const setGap = (confirmed: boolean) =>
    run("gap", async () => {
      if (demo) return setStatus(confirmed ? "gap" : "no_evidence");
      const m = await api<Match>(`/jobs/${jobId}/requirements/${r.id}/gap`, { method: "POST", body: { confirmed } });
      setStatus(m.requirements.find((x) => x.id === r.id)?.status ?? null);
      router.refresh(); // the verdict and tally may change too
    });

  return (
    <li className={`${s.req} ${s[`req_${shown}`] ?? ""}`}>
      <div className={s.reqTop}>
        <span className={s.reqName}>{r.text}</span>
        <Stamp status={shown} />
      </div>
      <p className={s.quote}>
        <span className="evidence">“{r.quote}”</span>
      </p>
      {r.note && <p className={s.reqNote}>{r.note}</p>}
      {fact && (
        <p className={s.factStub}>
          <FactId id={fact.id} className={s.factId} />
          <span>{fact.text}</span>
        </p>
      )}
      {(demo || r.id) && shown === "no_evidence" && (
        <div className={s.reqActions}>
          <Link className="btn btn-small btn-primary" href="/profile#exp">
            Add evidence
          </Link>
          <button className="btn btn-small btn-secondary" type="button" disabled={!!busy} onClick={() => setGap(true)}>
            {busy ? "Saving…" : "I don’t have this"}
          </button>
        </div>
      )}
      {(demo || r.id) && shown === "gap" && (
        <div className={s.reqActions}>
          <p className={s.left}>You said you don’t have this. It stays out of your resumes and counts as a gap here.</p>
          <button className="btn btn-small btn-secondary" type="button" disabled={!!busy} onClick={() => setGap(false)}>
            {busy ? "Saving…" : "Undo"}
          </button>
        </div>
      )}
      {error && (
        <p role="alert" className={a.problem}>
          {error}
        </p>
      )}
    </li>
  );
}

const STATUS_BUTTONS: { status: JobStatus; idle: string; on: string }[] = [
  { status: "saved", idle: "Save job", on: "Saved" },
  { status: "applied", idle: "Mark as applied", on: "Marked applied" },
  { status: "not_interested", idle: "Not interested", on: "Not interested" },
];

/** PATCH /v1/jobs/{id} {status}. "Applied" is only what you marked: we never apply for you. */
export function JobStatusButtons({ jobId, initial, demo }: { jobId: string; initial: SavedJob["status"] | null; demo: boolean }) {
  const router = useRouter();
  const [status, setStatus] = useState(initial);
  const { busy, error, run } = useAction();

  const set = (next: JobStatus) =>
    run(next, async () => {
      if (!demo) {
        const j = await api<SavedJob>(`/jobs/${jobId}`, { method: "PATCH", body: { status: next } });
        setStatus(j.status ?? next);
        router.refresh();
      } else setStatus(next);
    });

  return (
    <>
      <div className={s.sideActions} role="group" aria-label="Your status for this job">
        {STATUS_BUTTONS.map((b) => (
          <button
            key={b.status}
            type="button"
            className="btn btn-secondary btn-small"
            aria-pressed={status === b.status}
            disabled={!!busy}
            onClick={() => status !== b.status && set(b.status)}
          >
            {busy === b.status ? "Saving…" : status === b.status ? b.on : b.idle}
          </button>
        ))}
      </div>
      {error && (
        <p role="alert" className={a.problem}>
          {error}
        </p>
      )}
    </>
  );
}
