"use client";

import Link from "next/link";
import { useState } from "react";
import a from "@/components/app/app.module.css";
import { api } from "@/lib/api";
import type { AlertFrequency, Feed } from "@/lib/mock";
import { useAction } from "@/lib/useAction";
import s from "./feed.module.css";

/** Email digest of new jobs where many of your skills appear. Weekly is free; daily comes with paid plans (PRD §7). */
export function AlertSettings({ initial, demo }: { initial: Feed["alerts"]; demo: boolean }) {
  const [frequency, setFrequency] = useState<AlertFrequency>(initial.frequency);
  const { busy, error, run } = useAction();
  const choose = (next: AlertFrequency) =>
    run("alerts", async () => {
      if (!demo) await api("/feed/settings", { method: "PUT", body: { frequency: next } });
      setFrequency(next);
    });
  const options: { value: AlertFrequency; label: string; disabled: boolean }[] = [
    { value: "off", label: "Off", disabled: false },
    { value: "weekly", label: "Weekly", disabled: !initial.hasEmail },
    { value: "daily", label: "Daily", disabled: !initial.dailyAllowed || !initial.hasEmail },
  ];
  return (
    <div className={`${a.card} ${s.sideCard}`}>
      <h2 className={s.sideTitle} id="alerts-title">
        Email me new matches
      </h2>
      <div className={a.chips} role="radiogroup" aria-labelledby="alerts-title">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            role="radio"
            className={a.chip}
            aria-checked={frequency === o.value}
            disabled={o.disabled || !!busy}
            onClick={() => choose(o.value)}
          >
            {o.label}
          </button>
        ))}
      </div>
      <p className={a.note}>
        {!initial.hasEmail ? (
          <>
            Add your email on your <Link href="/profile">profile</Link> to get alerts.
          </>
        ) : (
          "Only new jobs where many of your confirmed skills appear, and nothing when there are none. Daily alerts come with paid plans."
        )}
      </p>
      {error && (
        <p role="alert" className={a.problem}>
          {error}
        </p>
      )}
    </div>
  );
}

const line = (l: Feed["learned"][number]) =>
  l.kind === "company" ? `${l.direction === "more" ? "More" : "Fewer"} jobs at ${l.label}` : l.kind === "location" ? `${l.direction === "more" ? "More" : "Fewer"} jobs in ${l.label}` : `${l.direction === "more" ? "More" : "Fewer"} “${l.label}” roles`;

/** What saves, hides and match-page answers taught the ranking, with a reset (PRD §6.5). */
export function Learned({ initial, demo }: { initial: Feed["learned"]; demo: boolean }) {
  const [learned, setLearned] = useState(initial);
  const { busy, error, run } = useAction();
  const reset = () =>
    run("reset", async () => {
      if (!demo) await api("/feed/signals/reset", { method: "POST" });
      setLearned([]);
    });
  return (
    <div className={`${a.card} ${s.sideCard}`}>
      <h2 className={s.sideTitle}>What your feedback changed</h2>
      {learned.length === 0 ? (
        <p className={a.note}>Save or hide jobs, and answer “Was this assessment right?” on checked jobs. The order adjusts; nothing is ever hidden for good.</p>
      ) : (
        <>
          <ul className={s.learned}>
            {learned.map((l) => (
              <li key={`${l.kind}:${l.label}`}>{line(l)}</li>
            ))}
          </ul>
          <button type="button" className="btn btn-secondary btn-small" onClick={reset} disabled={!!busy}>
            Reset what the feed learned
          </button>
        </>
      )}
      {error && (
        <p role="alert" className={a.problem}>
          {error}
        </p>
      )}
    </div>
  );
}
