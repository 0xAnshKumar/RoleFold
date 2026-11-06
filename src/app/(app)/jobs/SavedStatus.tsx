"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import a from "@/components/app/app.module.css";
import { Select } from "@/components/ui/Field";
import { api } from "@/lib/api";
import type { JobStatus, SavedJob } from "@/lib/mock";
import { useAction } from "@/lib/useAction";
import s from "./jobs.module.css";

const LABEL: Record<JobStatus, string> = { saved: "Saved", applied: "Applied", not_interested: "Not interested", dismissed: "Hidden" };

/** Your status for a saved job as a small select (DESIGN.md 4.5): PATCH /v1/jobs/{id}. Demo: local only. */
export default function SavedStatus({ jobId, title, initial, demo }: { jobId: string; title: string; initial: JobStatus; demo: boolean }) {
  const router = useRouter();
  const [status, setStatus] = useState(initial);
  const { busy, error, run } = useAction();
  const set = (next: JobStatus) =>
    run("status", async () => {
      if (!demo) {
        const j = await api<SavedJob>(`/jobs/${jobId}`, { method: "PATCH", body: { status: next } });
        setStatus(j.status ?? next);
        router.refresh();
      } else setStatus(next);
    });
  return (
    <div className={s.status}>
      <Select label={`Your status for ${title}`} hideLabel value={status} disabled={!!busy} onChange={(e) => set(e.target.value as JobStatus)}>
        {(["saved", "applied", "not_interested"] as const).map((v) => (
          <option key={v} value={v}>
            {LABEL[v]}
          </option>
        ))}
        {status === "dismissed" && (
          <option value="dismissed" disabled>
            {LABEL.dismissed}
          </option>
        )}
      </Select>
      {error && (
        <p role="alert" className={a.problem}>
          {error}
        </p>
      )}
    </div>
  );
}
