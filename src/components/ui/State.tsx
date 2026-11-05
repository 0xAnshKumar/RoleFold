import { Icon, type IconName } from "./Icon";
import s from "./State.module.css";

type StateProps = {
  icon?: IconName;
  title: React.ReactNode;
  children?: React.ReactNode;
  /** One primary action naming the outcome, plus an optional secondary link. */
  action?: React.ReactNode;
  secondary?: React.ReactNode;
  className?: string;
};

/**
 * Empty state (DESIGN.md 3.18): line icon, display title, one sentence, one action. No illustrations.
 * Title is a heading at `level` (default h2) so it sits in the page outline.
 */
export function EmptyState({ icon = "inbox", title, children, action, secondary, className, level = 2 }: StateProps & { level?: 2 | 3 }) {
  const H = `h${level}` as "h2" | "h3";
  return (
    <div className={`${s.state} ${className ?? ""}`}>
      <Icon name={icon} size={40} className={s.icon} />
      <H className={s.title}>{title}</H>
      {children && <p className={s.text}>{children}</p>}
      {(action || secondary) && (
        <div className={s.actions}>
          {action}
          {secondary}
        </div>
      )}
    </div>
  );
}

/** Error state: says what happened, what is safe and what to do. Never a dead end. */
export function ErrorState({ icon = "alert", title, children, action, secondary, className, live = false }: StateProps & { live?: boolean }) {
  return (
    <div className={`${s.state} ${s.error} ${className ?? ""}`} role={live ? "alert" : undefined}>
      <Icon name={icon} size={40} className={s.icon} />
      <h2 className={s.title}>{title}</h2>
      {children && <p className={s.text}>{children}</p>}
      {(action || secondary) && (
        <div className={s.actions}>
          {action}
          {secondary}
        </div>
      )}
    </div>
  );
}
