"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ApiError, api, waitFor, type Operation } from "@/lib/api";
import type { Usage } from "@/lib/mock";
import a from "@/components/app/app.module.css";
import s from "./match.module.css";

/** POST /v1/jobs/{id}/tailored-resume (202) -> poll -> open the new resume. Limit is explained before any work starts. */
export default function Tailor({ jobId, demo, usage }: { jobId: string; demo: boolean; usage: Usage }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { used, limit } = usage.tailored;
  const left = Math.max(0, limit - used);
  const limitMsg = `You’ve made all ${limit} tailored resumes for this month. They reset on ${usage.resetsOn}. Every resume you’ve already made can still be opened and downloaded.`;

  async function tailor() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ operation: Operation }>(`/jobs/${jobId}/tailored-resume`, { method: "POST" });
      const op = await waitFor(r.operation);
      router.push(`/resumes/${op.result?.resume_id}`);
    } catch (err) {
      setError(err instanceof ApiError && err.code === "PLAN_LIMIT_REACHED" ? limitMsg : (err as Error).message);
      setBusy(false);
    }
  }

  if (left === 0)
    return (
      <>
        <button type="button" className="btn btn-primary" disabled aria-describedby="tailor-limit">
          Tailor resume for this job
        </button>
        <p id="tailor-limit" className={s.left}>
          {limitMsg} <Link href="/resumes">Your resumes</Link>
        </p>
      </>
    );

  return (
    <>
      {demo ? (
        <Link href="/resumes/frontend-engineer" className="btn btn-primary">
          Tailor resume for this job
        </Link>
      ) : (
        <button type="button" className="btn btn-primary" onClick={tailor} disabled={busy}>
          {busy ? "Tailoring your resume…" : "Tailor resume for this job"}
        </button>
      )}
      {error && (
        <p role="alert" className={a.problem}>
          {error}
        </p>
      )}
      <p className={s.left} role="status">
        {busy ? "Choosing and rewording your confirmed facts, then checking every line. This can take a minute." : `${left} of ${limit} tailored resumes left this month`}
      </p>
    </>
  );
}
