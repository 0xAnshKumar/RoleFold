import s from "./app.module.css";

/** App page header (DESIGN.md 3.1): display title, optional one-line description, actions right (stacked on phone). */
export default function PageHeader({
  context,
  title,
  sub,
  children,
}: {
  context?: string;
  title: React.ReactNode;
  sub?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <header className={s.header}>
      <div className={s.headText}>
        <h1 className={s.title}>{title}</h1>
        {context && <p className={s.context}>{context}</p>}
        {sub && <p className={s.sub}>{sub}</p>}
      </div>
      {children && <div className={s.actions}>{children}</div>}
    </header>
  );
}
