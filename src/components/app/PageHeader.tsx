import s from "./app.module.css";

/** Page header on notebook ruling: context line, title, sub-copy, and actions on the right. */
export default function PageHeader({
  context,
  title,
  sub,
  children,
}: {
  context?: string;
  title: string;
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
