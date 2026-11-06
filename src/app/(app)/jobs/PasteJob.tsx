"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Field";
import { ApiError, api, waitFor, type Operation } from "@/lib/api";
import type { Usage } from "@/lib/mock";
import s from "./jobs.module.css";

// A paste that is only a link: we never fetch it (no scraping), so ask for the text.
const URL_ONLY = /^\s*(https?:\/\/|www\.)\S+\s*$/i;
const MIN_CHARS = 200;
const URL_MSG = "That’s a link. We don’t open job sites for you. Open the job, select all of its text, and paste it here. This didn’t use any of your monthly checks.";

/** The paste form, shown in the "Paste a job" dialog. POST /v1/jobs/paste → poll → open the check. */
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
      <Textarea
        label="Job description"
        rows={10}
        value={text}
        readOnly={busy}
        onChange={(e) => {
          setText(e.target.value);
          setError(null);
        }}
        error={error}
        helper={
          out ? (
            limitMsg
          ) : (
            <>
              Hidden text and instructions inside postings are ignored.{chars > 0 && <span className={s.count}> {chars} characters</span>}
            </>
          )
        }
        placeholder={"Senior Frontend Engineer · Kestrel Pay · Bengaluru (hybrid)\n\nWhat you’ll do…\nWhat we’re looking for…"}
      />
      <div className={s.pasteActions}>
        <Button variant="primary" type="submit" loading={busy} disabled={out}>
          Check this job
        </Button>
        <span className={s.muted} role="status">
          {busy ? "Checking each requirement against your confirmed facts. This can take a minute." : `Uses 1 of your ${Math.max(0, limit - used)} job checks left`}
        </span>
      </div>
    </form>
  );
}
