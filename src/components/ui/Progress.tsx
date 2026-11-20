import { StatusIcon } from "./index";
import s from "./Progress.module.css";

/**
 * Determinate progress bar for work with a known size (upload bytes). Never used to grade the person.
 * `label` is the visible text ("Uploading… 1.2 of 2.0 MB"); the bar fills with transform: scaleX.
 */
export function ProgressBar({ value, max, label, valueText }: { value: number; max: number; label: React.ReactNode; valueText?: string }) {
  const f = max > 0 ? Math.min(1, Math.max(0, value / max)) : 0;
  return (
    <div className={s.wrap}>
      <div className={s.label}>{label}</div>
      <div
        className={s.track}
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={value}
        aria-valuetext={valueText}
        aria-label={typeof label === "string" ? label : undefined}
      >
        <span className={s.fill} style={{ transform: `scaleX(${f})` }} />
      </div>
    </div>
  );
}

export type StageState = "pending" | "current" | "done";

/** Named stage list (upload "Reading" step) styled as a chain of thought: a line joins the steps, the current one
 * spins and its label shimmers, done ones get a check. Lives inside a polite live region. */
export function StageList({ stages, label }: { stages: { label: string; state: StageState }[]; label?: string }) {
  return (
    <ol className={s.stages} aria-label={label}>
      {stages.map((st) => (
        <li key={st.label} className={s.stage} data-state={st.state} aria-current={st.state === "current" ? "step" : undefined}>
          <span className={s.marker} aria-hidden>
            {st.state === "done" && <StatusIcon name="check" />}
          </span>
          <span className={s.text}>{st.label}</span>
          <span className="sr-only">{st.state === "done" ? ", done" : st.state === "current" ? ", in progress" : ", not started"}</span>
        </li>
      ))}
    </ol>
  );
}
