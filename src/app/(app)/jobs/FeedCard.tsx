"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import a from "@/components/app/app.module.css";
import { StatusIcon } from "@/components/ui";
import { Button, IconButton, buttonClass } from "@/components/ui/Button";
import { Card, cardLink, cardRaised } from "@/components/ui/Card";
import { ChipRow, FilterChip } from "@/components/ui/Chip";
import { Icon } from "@/components/ui/Icon";
import { VerdictMark } from "@/components/ui/Status";
import { ApiError, api, waitFor, type Operation } from "@/lib/api";
import type { FeedItem, PreliminaryFit } from "@/lib/mock";
import { useAction } from "@/lib/useAction";
import { ReportDialog, reportReason } from "./Report";
import s from "./jobs.module.css";

/** Early read in words: never a score or a verdict (that needs the full check). DESIGN.md 3.8. */
const FIT: Record<PreliminaryFit, { icon: "check" | "half" | "dash"; tone: string; words: string }> = {
  strong: { icon: "check", tone: "var(--supported)", words: "Many of your confirmed skills appear" },
  some: { icon: "half", tone: "var(--partial)", words: "Some of your confirmed skills appear" },
  little: { icon: "dash", tone: "var(--missing)", words: "Few of your confirmed skills appear" },
};
const REASONS = ["Not my field", "Too senior", "Wrong location", "Salary too low"];

const list = (xs: string[]) => (xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);
/** "Today", "3 days ago", "3 weeks ago" from a YYYY-MM-DD date (UTC days). */
export function age(iso: string) {
  const days = Math.max(0, Math.floor((Date.now() - Date.parse(`${iso}T00:00:00Z`)) / 86_400_000));
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 14) return `${days} days ago`;
  if (days < 60) return `${Math.floor(days / 7)} weeks ago`;
  return `${Math.floor(days / 30)} months ago`;
}

export default function FeedCard({ item, demo, checksLeft, checksLimit }: { item: FeedItem; demo: boolean; checksLeft: number; checksLimit: number }) {
  const router = useRouter();
  const { busy, error, setError, run } = useAction();
  const [saved, setSaved] = useState(item.saved);
  const [hidden, setHidden] = useState<null | "hidden" | "reported">(null);
  const [asking, setAsking] = useState(false);
  const [reporting, setReporting] = useState(false);

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
      setHidden("hidden");
    });
  const report = (reason: string) =>
    run("report", async () => {
      await feedback("dismiss", [reportReason(reason)]);
      setHidden("reported");
    });
  const undo = () =>
    run("undo", async () => {
      await feedback("clear");
      setHidden(null);
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

  const problem = error && (
    <p role="alert" className={a.problem}>
      {error}{" "}
      <button type="button" className={s.textBtn} onClick={() => setError(null)}>
        Dismiss
      </button>
    </p>
  );

  if (hidden)
    return (
      <li className={s.hiddenCard}>
        <p className={a.note}>
          {hidden === "reported" ? "Reported and hidden" : "Hidden"}: {item.title}, {item.company}.{hidden === "hidden" && " We’ll show fewer jobs like it."}
        </p>
        <Button size="sm" variant="ghost" onClick={undo} loading={busy === "undo"}>
          Undo
        </Button>
        {problem}
      </li>
    );

  const fit = FIT[item.fit];
  const where = [item.company, item.location, item.remote && !/remote/i.test(item.location ?? "") ? "Remote" : null, item.employmentType].filter(Boolean).join(" · ");
  const opened = item.check?.verdict ? `/jobs/${item.check.jobId}` : null;
  return (
    <li>
      <Card as="article" interactive={!!opened} className={s.card}>
        <div className={s.cardHead}>
          <h3 className={s.cardTitle} title={item.title}>
            {opened ? (
              <Link href={opened} className={cardLink}>
                {item.title}
              </Link>
            ) : (
              item.title
            )}
          </h3>
          <IconButton
            label={saved ? "Saved: remove from saved" : "Save job"}
            icon={<Icon name="heart" />}
            aria-pressed={saved}
            className={`${s.save} ${cardRaised}`}
            onClick={toggleSave}
            loading={busy === "save"}
          />
        </div>
        <p className={s.where}>{where}</p>
        <p className={s.meta}>
          <span className={s.muted}>Salary not shown</span> · {age(item.posted)} · via {item.source}
        </p>

        {item.check?.verdict ? (
          <p className={s.reason}>
            <VerdictMark verdict={item.check.verdict} detail={item.check.gaps ? `${item.check.gaps} gap${item.check.gaps > 1 ? "s" : ""}` : "no gaps"} />
          </p>
        ) : item.check ? (
          <p className={`${s.reason} ${s.muted}`}>Check in progress. It appears under Saved & pasted when it’s done.</p>
        ) : (
          <p className={s.reason}>
            <span className={s.fitIcon} style={{ color: fit.tone }}>
              <StatusIcon name={fit.icon} />
            </span>
            <span>
              {fit.words}
              {item.skills.length > 0 ? `: ${list(item.skills)}.` : "."}
              {item.goal && <span className={s.muted}> {item.goal}</span>}
            </span>
          </p>
        )}

        <div className={`${s.cardFoot} ${cardRaised}`}>
          {opened ? (
            <Link href={opened} className={buttonClass("secondary", "sm")}>
              Open check
            </Link>
          ) : item.check ? (
            <Link href="/jobs?tab=saved" className={buttonClass("secondary", "sm")}>
              See your jobs
            </Link>
          ) : (
            <Button size="sm" onClick={check} loading={busy === "check"} disabled={checksLeft === 0} aria-describedby={checksLeft === 0 ? "jobs-quota" : undefined}>
              Check this job
            </Button>
          )}
          <span className={s.footLinks}>
            <button type="button" className={s.textBtn} aria-expanded={asking} onClick={() => setAsking(!asking)}>
              Not for me
            </button>
            <button type="button" className={s.textBtn} onClick={() => setReporting(true)}>
              Report
            </button>
            {item.applyUrl && (
              <a href={item.applyUrl} className={s.textBtn} target="_blank" rel="noopener noreferrer">
                Apply
                <span className="sr-only"> on the company’s site (opens in a new tab)</span>
                <Icon name="external" size={14} />
              </a>
            )}
          </span>
        </div>
        {busy === "check" && (
          <p className={s.muted} role="status">
            Checking each requirement against your confirmed facts. This can take a minute.
          </p>
        )}

        {asking && (
          <ChipRow label="Why isn’t this for you? (optional)" className={cardRaised}>
            {REASONS.map((r) => (
              <FilterChip key={r} onClick={() => dismiss(r)} disabled={!!busy}>
                {r}
              </FilterChip>
            ))}
            <button type="button" className={s.textBtn} onClick={() => dismiss()} disabled={!!busy}>
              Hide without a reason
            </button>
          </ChipRow>
        )}
        {problem}
      </Card>
      {reporting && <ReportDialog open onClose={() => setReporting(false)} onReport={report} />}
    </li>
  );
}
