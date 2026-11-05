import type { Status as StatusValue, Verdict } from "@/lib/mock";
import { StatusIcon } from "./index";
import s from "./Status.module.css";

type Icon = Parameters<typeof StatusIcon>[0]["name"];
type Look = "fill" | "dashed" | "solid" | "outline";

// DESIGN.md 2.1.2: every data value → word, colour, icon and mark style. Colour is never the only signal.
const MARKS: Record<StatusValue, { tone: string; icon: Icon; look: Look; word: string; sr: string }> = {
  supported: { tone: "supported", icon: "check", look: "fill", word: "Proven", sr: "proven by a confirmed fact" },
  match: { tone: "supported", icon: "check", look: "fill", word: "Matches", sr: "matches your preference" },
  partial: { tone: "partial", icon: "half", look: "fill", word: "Partly proven", sr: "partly proven" },
  no_evidence: { tone: "missing", icon: "dash", look: "dashed", word: "No confirmed fact yet", sr: "no confirmed fact yet" },
  gap: { tone: "missing", icon: "cross", look: "fill", word: "Gap (you said so)", sr: "a gap you said you have" },
  conflict: { tone: "conflict", icon: "alert", look: "solid", word: "Doesn't match your preference", sr: "doesn't match your preference" },
  unknown: { tone: "missing", icon: "question", look: "outline", word: "Not stated in posting", sr: "not stated in the posting" },
};

/** Inline status mark: icon + word, never alone (3.6). `children` replaces the word when context needs it. */
export function StatusMark({ status, children }: { status: StatusValue; children?: React.ReactNode }) {
  const m = MARKS[status];
  return (
    <span className={`${s.mark} ${s[m.look]}`} style={{ "--tone": `var(--${m.tone})`, "--tone-bg": `var(--${m.tone}-bg)` } as React.CSSProperties}>
      <StatusIcon name={m.icon} />
      <span aria-hidden>{children ?? m.word}</span>
      <span className="sr-only">Status: {m.sr}</span>
    </span>
  );
}

export const VERDICT_TONE: Record<Verdict, "supported" | "partial" | "missing" | "conflict"> = {
  "Strong fit": "supported",
  "Good fit with gaps": "supported",
  Stretch: "partial",
  "Poor fit": "missing",
  "Not enough detail in this posting": "missing",
  "Not eligible": "conflict",
};
const VERDICT_ICON: Record<string, Icon> = { supported: "check", partial: "half", missing: "dash", conflict: "alert" };

/** Verdict as a status mark, for lists and cards where the seal doesn't belong ("Good fit with gaps · 1 gap"). */
export function VerdictMark({ verdict, detail }: { verdict: Verdict; detail?: string }) {
  const tone = VERDICT_TONE[verdict];
  return (
    <span className={`${s.mark} ${s.fill}`} style={{ "--tone": `var(--${tone})`, "--tone-bg": `var(--${tone}-bg)` } as React.CSSProperties}>
      <StatusIcon name={VERDICT_ICON[tone]} />
      <span>
        {verdict}
        {detail && ` · ${detail}`}
      </span>
    </span>
  );
}

/** Count badge (queue badge in the nav, "Saved · 3"): accent tint, optional dot. Counts tasks, never grades. */
export function Badge({ children, dot = false, className }: { children: React.ReactNode; dot?: boolean; className?: string }) {
  return (
    <span className={`${s.badge} ${className ?? ""}`}>
      {dot && <span className={s.dot} aria-hidden />}
      {children}
    </span>
  );
}
