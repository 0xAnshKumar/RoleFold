import s from "@/components/app/app.module.css";

// Page enter: a 200ms fade + 4px rise on the page content (CSS, zeroed under reduced motion). The shell stays put.
export default function Template({ children }: { children: React.ReactNode }) {
  return <div className={s.enter}>{children}</div>;
}
