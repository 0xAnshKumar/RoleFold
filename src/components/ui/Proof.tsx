import { useId } from "react";
import { Icon } from "./Icon";
import s from "./Proof.module.css";

/**
 * Proof mark (DESIGN.md 3.7): the yellow highlighter behind verbatim text, and the only yellow in the system.
 * Static proof (posting quotes, source lines) is always on. Linked proof passes `on` and swipes in when its claim is
 * hovered, focused or tapped.
 */
export function ProofMark({ children, on, quote = false }: { children: React.ReactNode; on?: boolean; quote?: boolean }) {
  return (
    <span className={`proof ${quote ? s.quote : ""}`} data-state={on === false ? "off" : undefined}>
      {children}
    </span>
  );
}

/**
 * Fact tag: manila tag with a punched hole, short ID and date. It is a button that opens the fact; the full ID and
 * fact text show in a tooltip on hover and focus. `linked` outlines it; `changed` adds the "fact updated" dot.
 */
export function FactTag({
  id,
  date,
  fact,
  linked = false,
  changed = false,
  className,
  ...rest
}: Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "id"> & { id: string; date?: string; fact?: string; linked?: boolean; changed?: boolean }) {
  const tip = useId();
  const short = id.length > 8 ? id.slice(0, 6) : id;
  return (
    <span className={`${s.tagWrap} ${className ?? ""}`} data-linked={linked || undefined}>
      <button type="button" {...rest} className={s.tagBtn} aria-describedby={tip}>
        <span className="sr-only">Fact </span>
        <span className="tag">
          {short}
          {date && <span className={s.tagDate}>· {date}</span>}
        </span>
        {changed && <span className={s.changed} aria-hidden />}
        {changed && <span className="sr-only">, updated after this line was written</span>}
      </button>
      <span id={tip} role="tooltip" className={s.tip}>
        <span className={s.tipId}>{id}</span>
        {fact && <span>{fact}</span>}
        {changed && <span className={s.tipNote}>Fact updated after this line was written</span>}
      </span>
    </span>
  );
}

/**
 * Blue signature line: "Confirmed by you · 12 Oct 2026" in the display italic, accent blue. `reveal` plays the
 * left-to-right sweep once, at the moment of confirming; it is static everywhere else.
 */
export function SignatureLine({ date, reveal = false, children }: { date: string; reveal?: boolean; children?: React.ReactNode }) {
  return (
    <span className={s.sig} data-reveal={reveal || undefined}>
      <Icon name="check" size={14} />
      {children ?? "Confirmed by you"} · {date}
    </span>
  );
}
