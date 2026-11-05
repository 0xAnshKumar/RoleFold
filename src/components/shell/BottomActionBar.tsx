import s from "./BottomActionBar.module.css";

/**
 * Bottom action bar for task screens (confirm queue, editor on phone, upload): replaces the tab bar below 1024px and
 * holds 1 primary + at most 1 secondary button, split full width. From 1024px it is an ordinary right-aligned row.
 */
export function BottomActionBar({ children, label = "Actions" }: { children: React.ReactNode; label?: string }) {
  return (
    <div className={s.bar} data-action-bar role="group" aria-label={label}>
      {children}
    </div>
  );
}
