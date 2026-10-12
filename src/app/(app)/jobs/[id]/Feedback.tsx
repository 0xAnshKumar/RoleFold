"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import type { JobFeedback } from "@/lib/mock";
import s from "./match.module.css";

const REASONS = ["Verdict too high", "Verdict too low", "Wrong requirement", "Missed my experience"];

/** "Was this assessment right?" (CEO D26): the relevance signal while there's no job feed. */
export default function Feedback({ jobId, demo }: { jobId: string; demo: boolean }) {
  const [vote, setVote] = useState<JobFeedback["vote"] | null>(null);
  const [reason, setReason] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  // Latest answer wins server-side; locally we only show it once it's saved.
  async function send(next: JobFeedback) {
    if (busy) return;
    setFailed(false);
    if (!demo) {
      setBusy(true);
      try {
        // api/app/routes/jobs.py FeedbackIn.
        const body = { action: next.vote === "up" ? "assessment_right" : "assessment_wrong", reasons: next.reason ? [next.reason] : [] };
        await api(`/jobs/${jobId}/feedback`, { method: "POST", body });
      } catch {
        setFailed(true);
        return;
      } finally {
        setBusy(false);
      }
    }
    setVote(next.vote);
    setReason(next.reason);
  }

  return (
    <div className={s.sideCard}>
      <h2 className={s.sideTitle}>Was this assessment right?</h2>
      <div className={s.thumbs} role="group" aria-label="Rate this assessment">
        {(["up", "down"] as const).map((v) => (
          <button
            key={v}
            type="button"
            className={s.thumb}
            aria-pressed={vote === v}
            disabled={busy}
            onClick={() => send({ vote: v, reason: null })}
          >
            <svg viewBox="0 0 20 20" aria-hidden style={{ rotate: v === "down" ? "180deg" : "0deg" }}>
              <path d="M6 9v8H3V9zM6 9l4-6c1.5 0 2 1 2 2l-1 3h5c1 0 1.7 1 1.4 2l-1.6 6c-.2.7-.8 1-1.4 1H6" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
            </svg>
            {v === "up" ? "Yes" : "No"}
          </button>
        ))}
      </div>
      {vote === "down" && (
        <div className={s.reasonChips}>
          {REASONS.map((r) => (
            <button key={r} type="button" className={s.chip} aria-pressed={reason === r} disabled={busy} onClick={() => send({ vote: "down", reason: r })}>
              {r}
            </button>
          ))}
        </div>
      )}
      {failed && (
        <p role="alert" className={s.left}>
          That didn’t save. Try again.
        </p>
      )}
      {vote && !failed && <p className={s.left}>{vote === "up" ? "Thanks. This helps us keep verdicts honest." : reason ? "Thanks. We’ll look at this one." : "What was off?"}</p>}
    </div>
  );
}
