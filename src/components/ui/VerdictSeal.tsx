import type { Verdict } from "@/lib/mock";
import { sealShort } from "./index";
import { VERDICT_TONE } from "./Status";
import s from "./VerdictSeal.module.css";

/**
 * The verdict seal (DESIGN.md 3.9): one per page, on the job check only. A guilloche ring tinted to the verdict around
 * a paper disc with the verdict in words and the check date (aria-hidden: the readable date is in the page header). `press` plays the press-in once, for the first render of a new verdict.
 * No verdict yet = "Checking…" with a plain ring; never a spinning ring.
 */
export function VerdictSeal({ verdict, checkedOn, size = 120, press = false }: { verdict?: Verdict | null; checkedOn?: string; size?: 120 | 96 | 64; press?: boolean }) {
  const tone = verdict ? VERDICT_TONE[verdict] : null;
  return (
    <div
      className={s.seal}
      role="img"
      aria-label={verdict ? `Verdict: ${verdict}` : "Checking this job"}
      data-size={size}
      data-press={(press && verdict) || undefined}
      style={{ "--seal": tone ? `var(--${tone})` : "var(--line)" } as React.CSSProperties}
    >
      <span className={s.ring} aria-hidden />
      <span className={s.disc} aria-hidden>
        <span className={s.verdict}>{verdict ? sealShort(verdict) : "Checking…"}</span>
        {verdict && checkedOn && size > 64 && <span className={s.date}>{checkedOn}</span>}
        {!verdict && <span className={s.dots} />}
      </span>
    </div>
  );
}
