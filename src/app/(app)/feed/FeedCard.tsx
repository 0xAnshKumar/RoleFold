"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import a from "@/components/app/app.module.css";
import { SEAL_COLOR, sealShort } from "@/components/ui";
import { ApiError, api, waitFor, type Operation } from "@/lib/api";
import type { FeedItem, PreliminaryFit } from "@/lib/mock";
import { useAction } from "@/lib/useAction";
import s from "./feed.module.css";

/** Words only: an early read from the posting text is never a score or a verdict. */
const FIT: Record<PreliminaryFit, string> = {
  strong: "Many of your skills appear",
  some: "Some of your skills appear",
  little: "Few of your skills appear",
};
const REASONS = ["Not my field", "Too senior", "Wrong location", "Salary too low"];

const day = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });

export default function FeedCard({ item, demo, checksLeft, checksLimit }: { item: FeedItem; demo: boolean; checksLeft: number; checksLimit: number }) {
  const router = useRouter();
  const { busy, error, setError, run } = useAction();
  const [saved, setSaved] = useState(item.saved);
  const [hidden, setHidden] = useState(false);
  const [asking, setAsking] = useState(false);

  async function feedback(action: "save" | "dismiss" | "clear", reasons: string[] = []) {
    if (!demo) await api(`/feed/${item.id}/feedback`, { method: "POST", body: { action, reasons } });
  }

  const toggleSave = () =>
    run("save", async () => {
      await feedback(saved ? "clear" : "save");
      setSaved(!saved);
    });
  const dismiss = (reason?: string) =>
    run("dismiss", async () => {
      await feedback("dismiss", reason ? [reason] : []);
      setAsking(false);
      setHidden(true);
    });
  const undo = () =>
    run("undo", async () => {
      await feedback("clear");
      setHidden(false);
    });
  const check = () =>
    run("check", async () => {
      if (demo) return router.push("/jobs/kestrel-frontend");
      try {
        const r = await api<{ job_id: string; operation: Operation | null }>(`/feed/${item.id}/check`, { method: "POST" });
        if (r.operation) await waitFor(r.operation);
        router.push(`/jobs/${r.job_id}`);
      } catch (err) {
        if (err instanceof ApiError && err.code === "PLAN_LIMIT_REACHED")
          throw new Error(`You’ve used all ${checksLimit} job checks this month. Jobs you’ve already checked stay open, and re-checking them is free.`);
        throw err;
      }
    });

  if (hidden)
    return (
      <li className={`${s.card} ${s.hiddenCard}`}>
        <p className={a.note}>Hidden: {item.title}, {item.company}. We’ll show fewer jobs like it.</p>
        <button type="button" className="btn btn-secondary btn-small" onClick={undo} disabled={!!busy}>
          Undo
        </button>
        {error && (
          <p role="alert" className={a.problem}>
            {error}
          </p>
        )}
      </li>
    );

  const where = [item.company, item.location, item.remote ? "Remote" : null, item.employmentType].filter(Boolean).join(" · ");
  return (
    <li className={s.card}>
      <div className={s.cardHead}>
        <div className={s.cardText}>
          <h3 className={s.cardTitle}>{item.title}</h3>
          <p className={s.where}>{where}</p>
        </div>
        {item.check?.verdict && (
          <Link href={`/jobs/${item.check.jobId}`} className={a.miniSeal} style={{ color: SEAL_COLOR[item.check.verdict] }} aria-label={`Full check: ${item.check.verdict}`}>
            {sealShort(item.check.verdict)}
          </Link>
        )}
      </div>

      <p className={s.fit}>
        <b>{FIT[item.fit]}</b>
        {item.skills.length > 0 && <>: {item.skills.join(", ")}</>}
      </p>
      {item.goal && <p className={a.note}>{item.goal}</p>}
      <p className={a.mono}>
        Posted {day(item.posted)} · last seen {day(item.lastSeen)} · {item.source}
      </p>

      <div className={s.actions}>
        {item.check ? (
          // The match page exists once the check has a verdict; until then the jobs list shows its progress.
          <Link href={item.check.verdict ? `/jobs/${item.check.jobId}` : "/jobs"} className="btn btn-primary btn-small">
            {item.check.verdict ? "Open the full check" : "Check in progress: see your jobs"}
          </Link>
        ) : (
          <button type="button" className="btn btn-primary btn-small" onClick={check} disabled={!!busy || checksLeft === 0}>
            {busy === "check" ? "Checking each requirement…" : "Check this job against my facts"}
          </button>
        )}
        <button type="button" className="btn btn-secondary btn-small" aria-pressed={saved} onClick={toggleSave} disabled={!!busy}>
          {saved ? "Saved" : "Save"}
        </button>
        <button type="button" className={s.textButton} aria-expanded={asking} onClick={() => setAsking(!asking)} disabled={!!busy}>
          Not for me
        </button>
        {item.applyUrl && (
          <a href={item.applyUrl} className={s.apply} target="_blank" rel="noopener noreferrer">
            Apply on the company’s site
            <svg viewBox="0 0 12 12" aria-hidden>
              <path d="M4 2h6v6M10 2 3 9" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </a>
        )}
      </div>
      {!item.check && (
        <p className={a.quiet}>
          {checksLeft === 0 ? `No job checks left this month (${checksLimit} used).` : `Uses 1 job check · ${checksLeft} of ${checksLimit} left`}
        </p>
      )}

      {asking && (
        <div className={s.reasons} role="group" aria-label="Why isn’t this for you? (optional)">
          {REASONS.map((r) => (
            <button key={r} type="button" className={a.chip} onClick={() => dismiss(r)} disabled={!!busy}>
              {r}
            </button>
          ))}
          <button type="button" className={s.textButton} onClick={() => dismiss()} disabled={!!busy}>
            Hide without a reason
          </button>
        </div>
      )}
      {error && (
        <p role="alert" className={a.problem}>
          {error}
          <button type="button" className={s.textButton} onClick={() => setError(null)}>
            Dismiss
          </button>
        </p>
      )}
    </li>
  );
}
