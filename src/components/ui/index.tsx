import type { Status, Verdict } from "@/lib/mock";

type Icon = "check" | "half" | "dash" | "cross" | "alert" | "question";

// Authored 12px status glyphs, one stroke weight (docs/DESIGN.md 3.6). New code: StatusMark in ./Status.
export function StatusIcon({ name }: { name: Icon }) {
  return (
    <svg viewBox="0 0 12 12" width="1em" height="1em" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      {name === "check" && <path d="M2.4 6.4 5 9 9.6 3" />}
      {name === "half" && (
        <>
          <circle cx="6" cy="6" r="4.4" />
          <path d="M6 1.6a4.4 4.4 0 0 1 0 8.8Z" fill="currentColor" stroke="none" />
        </>
      )}
      {name === "dash" && <path d="M3 6h6" />}
      {name === "cross" && <path d="M3 3l6 6M9 3 3 9" />}
      {name === "alert" && (
        <>
          <path d="M6 2.4v4.8" />
          <circle cx="6" cy="9.6" r=".5" fill="currentColor" />
        </>
      )}
      {name === "question" && (
        <>
          <path d="M4.1 4.3C4.1 1.9 7.9 1.9 7.9 4.3 7.9 6 6 6 6 7.6" />
          <circle cx="6" cy="9.8" r=".5" fill="currentColor" />
        </>
      )}
    </svg>
  );
}

const STAMPS: Record<Status, { cls: string; icon: Icon; word: string; sr: string }> = {
  supported: { cls: "supported", icon: "check", word: "Supported", sr: "supported by your confirmed facts" },
  match: { cls: "supported", icon: "check", word: "Match", sr: "matches your preferences" },
  partial: { cls: "partial", icon: "half", word: "Partial", sr: "partly supported" },
  no_evidence: { cls: "no_evidence", icon: "dash", word: "No evidence yet", sr: "no evidence recorded" },
  gap: { cls: "gap", icon: "cross", word: "Gap (you confirmed)", sr: "a gap you confirmed" },
  conflict: { cls: "conflict", icon: "alert", word: "Conflict", sr: "conflicts with your preferences" },
  unknown: { cls: "unknown", icon: "question", word: "Unknown", sr: "not stated in the posting" },
};

export function Stamp({ status }: { status: Status }) {
  const s = STAMPS[status];
  return (
    <span className={`stamp stamp-${s.cls}`}>
      <StatusIcon name={s.icon} />
      <span aria-hidden>{s.word}</span>
      <span className="sr-only">Status: {s.sr}</span>
    </span>
  );
}

export const SEAL_COLOR: Record<Verdict, string> = {
  "Strong fit": "var(--supported)",
  "Good fit with gaps": "var(--supported)",
  Stretch: "var(--partial)",
  "Poor fit": "var(--missing)",
  "Not eligible": "var(--conflict)",
  // Calm: the posting is the thing that's thin, not the person.
  "Not enough detail in this posting": "var(--missing)",
};

/** Seal text where space is tight (list rows). */
export const sealShort = (v: Verdict) => (v === "Not enough detail in this posting" ? "Not enough detail" : v);

/** Fact ids are UUIDs live: show a short mono form, full id on hover. */
export function FactId({ id, className }: { id: string; className?: string }) {
  return (
    <span className={className} title={id}>
      {id.length > 8 ? id.slice(0, 6) : id}
    </span>
  );
}
