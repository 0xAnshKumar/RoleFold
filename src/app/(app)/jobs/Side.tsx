"use client";

import Link from "next/link";
import { useState } from "react";
import a from "@/components/app/app.module.css";
import { Button } from "@/components/ui/Button";
import { Segmented } from "@/components/ui/Segmented";
import { api } from "@/lib/api";
import type { AlertFrequency, Feed } from "@/lib/mock";
import { useAction } from "@/lib/useAction";
import s from "./jobs.module.css";

const LABEL: Record<AlertFrequency, string> = { off: "Off", weekly: "Weekly", daily: "Daily" };

/** Email digest of new jobs where many of your skills appear. Weekly is free; daily comes with paid plans (PRD §7). */
export function AlertSettings({ initial, demo }: { initial: Feed["alerts"]; demo: boolean }) {
  const [frequency, setFrequency] = useState<AlertFrequency>(initial.frequency);
  const { error, run } = useAction();
  const choose = (next: AlertFrequency) =>
    run("alerts", async () => {
      if (!demo) await api("/feed/settings", { method: "PUT", body: { frequency: next } });
      setFrequency(next);
    });
  // Only choices you can take are offered; the note says why the others are missing.
  const options = (["off", "weekly", "daily"] as const)
    .filter((f) => f === "off" || f === frequency || (initial.hasEmail && (f === "weekly" || initial.dailyAllowed)))
    .map((f) => ({ value: f, label: LABEL[f] }));
  return (
    <section className={s.drawerSection}>
      <Segmented<AlertFrequency> label={<span className={s.drawerTitle}>Email me new matches</span>} options={options} value={frequency} onChange={choose} />
      <p className={a.note}>
        {!initial.hasEmail ? (
          <>
            Add your email on your <Link href="/profile">profile</Link> to get alerts.
          </>
        ) : (
          <>Only new jobs where many of your confirmed skills appear, and nothing when there are none.{!initial.dailyAllowed && " Daily alerts come with paid plans."}</>
        )}
      </p>
      {error && (
        <p role="alert" className={a.problem}>
          {error}
        </p>
      )}
    </section>
  );
}

const line = (l: Feed["learned"][number]) =>
  l.kind === "company" ? `${l.direction === "more" ? "More" : "Fewer"} jobs at ${l.label}` : l.kind === "location" ? `${l.direction === "more" ? "More" : "Fewer"} jobs in ${l.label}` : `${l.direction === "more" ? "More" : "Fewer"} “${l.label}” roles`;

/** What saves, hides and job-check answers taught the ranking, with a reset (PRD §6.5). */
export function Learned({ initial, demo }: { initial: Feed["learned"]; demo: boolean }) {
  const [learned, setLearned] = useState(initial);
  const { busy, error, run } = useAction();
  const reset = () =>
    run("reset", async () => {
      if (!demo) await api("/feed/signals/reset", { method: "POST" });
      setLearned([]);
    });
  return (
    <section className={s.drawerSection} aria-labelledby="learned-title">
      <h3 id="learned-title" className={s.drawerTitle}>
        What your feedback changed
      </h3>
      {learned.length === 0 ? (
        <p className={a.note}>Save or hide jobs, and answer “Was this assessment right?” on checked jobs. The order adjusts; nothing is ever hidden for good.</p>
      ) : (
        <>
          <ul className={s.learned}>
            {learned.map((l) => (
              <li key={`${l.kind}:${l.label}`}>{line(l)}</li>
            ))}
          </ul>
          <Button size="sm" onClick={reset} loading={busy === "reset"} className={s.start}>
            Reset what the feed learned
          </Button>
        </>
      )}
      {error && (
        <p role="alert" className={a.problem}>
          {error}
        </p>
      )}
    </section>
  );
}
