"use client";

import { useState } from "react";
import a from "@/components/app/app.module.css";
import { Button } from "@/components/ui/Button";
import { ChipRow, FilterChip } from "@/components/ui/Chip";
import { api } from "@/lib/api";
import type { JobFeedback } from "@/lib/mock";
import s from "./match.module.css";

const REASONS = ["Verdict too high", "Verdict too low", "Wrong requirement", "Missed my experience"];

/** "Was this assessment right?" (CEO D26): a relevance signal for the verdict and the feed ranking. */
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
    <div className={s.feedback}>
      <div className={s.feedbackRow} role="group" aria-labelledby="fb-title">
        <span id="fb-title" className={s.feedbackTitle}>
          Was this assessment right?
        </span>
        {(["up", "down"] as const).map((v) => (
          <Button key={v} size="sm" aria-pressed={vote === v} disabled={busy} onClick={() => send({ vote: v, reason: null })} className={s.vote}>
            {v === "up" ? "Yes" : "No"}
          </Button>
        ))}
      </div>
      {vote === "down" && (
        <ChipRow label="What was off?">
          {REASONS.map((r) => (
            <FilterChip key={r} pressed={reason === r} disabled={busy} onClick={() => send({ vote: "down", reason: r })}>
              {r}
            </FilterChip>
          ))}
        </ChipRow>
      )}
      {failed && (
        <p role="alert" className={a.problem}>
          That didn’t save. Try again.
        </p>
      )}
      {vote && !failed && (
        <p className={a.note} role="status">
          {vote === "up" ? "Thanks. This helps us keep verdicts honest." : reason ? "Thanks. We’ll look at this one." : "What was off?"}
        </p>
      )}
    </div>
  );
}
