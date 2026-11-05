// Authored line icons on a 24 grid, one stroke weight (1.75 at 24px, DESIGN.md 6.3). Decorative unless labelled by
// the control that holds them.
const PATHS = {
  check: "M5 12.5 10 17.5 19 7",
  close: "M6 6l12 12M18 6 6 18",
  chevronDown: "M6 9.5 12 15.5 18 9.5",
  chevronRight: "M9.5 6 15.5 12 9.5 18",
  arrowRight: "M5 12h14M13 6l6 6-6 6",
  arrowLeft: "M19 12H5M11 6l-6 6 6 6",
  external: "M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5",
  plus: "M12 5v14M5 12h14",
  alert: "M12 3.5 2.5 20h19L12 3.5ZM12 10v4.5M12 17.4v.1",
  info: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM12 11v5.5M12 7.6v.1",
  search: "M10.5 18a7.5 7.5 0 1 0 0-15 7.5 7.5 0 0 0 0 15ZM16 16l4.5 4.5",
  heart: "M12 20s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.2a4.3 4.3 0 0 1 7.5 2.6C19.5 15.4 12 20 12 20Z",
  jobs: "M3.5 8.5h17v11h-17zM8.5 8.5v-3h7v3M3.5 13h17",
  resume: "M6 3h8.5L19 7.5V21H6zM14 3v5h5M9 12h7M9 15.5h7M9 19h4",
  profile: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM4.5 20.5c1.2-3.8 4.2-5.5 7.5-5.5s6.3 1.7 7.5 5.5",
  settings:
    "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1",
  signOut: "M14 4h4.5A1.5 1.5 0 0 1 20 5.5v13a1.5 1.5 0 0 1-1.5 1.5H14M10 16.5 5.5 12 10 7.5M5.5 12H15",
  doc: "M7 3h7l5 5v13H7zM14 3v5h5",
  lock: "M6 11h12v9.5H6zM8.5 11V8a3.5 3.5 0 0 1 7 0v3",
  offline: "M3 3l18 18M8.5 16.5a5 5 0 0 1 7 0M5 13a10 10 0 0 1 4.2-2.6M12 19.5v.1M14.6 10.4A10 10 0 0 1 19 13M2 9.5a15 15 0 0 1 4-2.6M10 6.1a15 15 0 0 1 12 3.4",
  inbox: "M3.5 13.5 6 5h12l2.5 8.5V19h-17zM3.5 13.5h5l1 2.5h5l1-2.5h5",
  filter: "M4 6h16M7 12h10M10 18h4",
  more: "M5.5 12h.1M12 12h.1M18.5 12h.1",
  refresh: "M20 11a8 8 0 0 0-14.6-4.5L4 8M4 4v4h4M4 13a8 8 0 0 0 14.6 4.5L20 16M20 20v-4h-4",
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 20, className }: { name: IconName; size?: number; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      className={className}
      aria-hidden
      fill="none"
      stroke="currentColor"
      strokeWidth={size <= 20 ? 1.9 : 1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
