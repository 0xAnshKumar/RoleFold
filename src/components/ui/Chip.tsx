import { Icon } from "./Icon";
import s from "./Chip.module.css";

// Filter and skill chips (DESIGN.md 3.5). Chips are the one pill shape (r-full) besides avatar, seal and toggles.

type FilterChipProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  /** Toggle chip: sets aria-pressed and the applied look. */
  pressed?: boolean;
  /** A chip that opens a menu or drawer with its value applied ("Location: Bengaluru"). */
  applied?: boolean;
  chevron?: boolean;
  /** "All filters" count badge. */
  count?: number;
  ref?: React.Ref<HTMLButtonElement>;
};

export function FilterChip({ pressed, applied, chevron, count, className, children, type = "button", ...rest }: FilterChipProps) {
  const on = pressed ?? applied ?? false;
  return (
    <button {...rest} type={type} className={`${s.chip} ${className ?? ""}`} data-on={on || undefined} aria-pressed={pressed}>
      {on && <Icon name="check" size={14} />}
      <span>{children}</span>
      {!!count && (
        <span className={s.count} aria-label={`${count} applied`}>
          {count}
        </span>
      )}
      {chevron && <Icon name="chevronDown" size={16} />}
    </button>
  );
}

/** Horizontal chip row: scrolls on phones (no scrollbar), wraps on desktop. */
export function ChipRow({ label, children, className }: { label?: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`${s.row} ${className ?? ""}`} role={label ? "group" : undefined} aria-label={label}>
      {children}
    </div>
  );
}

/** Read-only skill chip. Confirmed skills carry a small accent dot. */
export function SkillChip({ children, confirmed = false }: { children: React.ReactNode; confirmed?: boolean }) {
  return (
    <span className={s.skill}>
      {confirmed && <span className={s.dot} aria-hidden />}
      {children}
      {confirmed && <span className="sr-only"> (confirmed)</span>}
    </span>
  );
}
