"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ApiError, api, waitFor, type Operation } from "@/lib/api";
import type { Usage } from "@/lib/mock";
import s from "./jobs.module.css";

// A paste that is only a link: we never fetch it (no scraping), so ask for the text.
const URL_ONLY = /^\s*(https?:\/\/|www\.)\S+\s*$/i;
const MIN_CHARS = 200;
const URL_MSG = "That’s a link. We don’t open job sites for you. Open the job, select all of its text, and paste it here. This didn’t use any of your monthly checks.";

export default function PasteJob({ demo, usage }: { demo: boolean; usage: Usage }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const chars = text.trim().length;
  const { used, limit } = usage.matches;
  const out = used >= limit;
  const limitMsg = `You’ve used all ${limit} job checks for this month. They reset on ${usage.resetsOn}. Jobs you’ve already checked stay here, and re-checking them is free.`;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (URL_ONLY.test(text)) return setError(URL_MSG);
    if (chars < MIN_CHARS) {
      setError("That looks too short to be a full job description. Paste the whole posting, including the requirements.");
      return;
    }
    if (demo) return router.push("/jobs/kestrel-frontend");
    setBusy(true);
    try {
      const r = await api<{ job_id: string; operation: Operation }>("/jobs/paste", { method: "POST", body: { text } });
      await waitFor(r.operation);
      router.push(`/jobs/${r.job_id}`);
    } catch (err) {
      const code = err instanceof ApiError ? err.code : "";
      // PASTE_TOO_SHORT: the API enforces the same 200-character floor; its message says nothing was used.
      setError(code === "URL_ONLY_PASTE" ? URL_MSG : code === "PLAN_LIMIT_REACHED" ? limitMsg : (err as Error).message);
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className={s.paste} noValidate>
      <label htmlFor="job-text" className={s.pasteLabel}>
        Paste the job description
      </label>
      <textarea
        id="job-text"
        className={s.pasteArea}
        rows={12}
        value={text}
        readOnly={busy}
        onChange={(e) => {
          setText(e.target.value);
          setError(null);
        }}
        aria-invalid={!!error}
        aria-describedby={error ? "paste-error" : "paste-help"}
        placeholder={"Senior Frontend Engineer · Kestrel Pay · Bengaluru (hybrid)\n\nWhat you’ll do…\nWhat we’re looking for…"}
      />
      {error ? (
        <p id="paste-error" role="alert" className={s.error}>
          {error}
        </p>
      ) : out ? (
        <p id="paste-help" className={s.help}>
          {limitMsg}
        </p>
      ) : (
        <p id="paste-help" className={s.help}>
          Hidden text and instructions inside postings are ignored. {chars > 0 && <span className={s.count}>{chars} characters</span>}
        </p>
      )}
      <div className={s.pasteActions}>
        <button className="btn btn-primary" type="submit" disabled={busy || out}>
          {busy ? "Reading the job…" : "Check how this job fits me"}
        </button>
        <span className={s.help} role="status">
          {busy ? "Checking each requirement against your confirmed facts. This can take a minute." : `Uses 1 job check · ${Math.max(0, limit - used)} of ${limit} left`}
        </span>
      </div>
    </form>
  );
}
