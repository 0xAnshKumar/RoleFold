import type { Metadata } from "next";
import Link from "next/link";
import PageHeader from "@/components/app/PageHeader";
import a from "@/components/app/app.module.css";
import { getResumes, getUsage, isDemo } from "@/lib/data";
import { Downloads, NewResume, UpdateResume } from "./Actions";
import s from "./resumes.module.css";

export const metadata: Metadata = { title: "Resumes" };

export default async function ResumesPage() {
  const [resumeList, usage, demo] = await Promise.all([getResumes(), getUsage(), isDemo()]);
  const masters = resumeList.filter((r) => r.kind === "master");
  // Sample data only has one full resume to open.
  const href = (id: string) => (demo ? "/resumes/frontend-engineer" : `/resumes/${id}`);
  // Tailored from a job page (no master behind it): listed on their own, never hidden.
  const loose = resumeList.filter((r) => r.kind !== "master" && !masters.some((m) => m.id === r.parent));
  const tailoredRow = (c: (typeof resumeList)[number]) => (
    <li key={c.id}>
      <span className={s.branch} aria-hidden />
      <div className={a.rowMain}>
        <Link href={href(c.id)} className={a.rowTitle}>
          {c.name}
        </Link>
        <p className={a.mono}>Tailored · updated {c.updated}</p>
      </div>
      <Link href={href(c.id)} className="btn btn-secondary btn-small">
        Open
      </Link>
    </li>
  );
  return (
    <>
      <PageHeader
        title="Your resumes"
        sub={
          usage.tailored
            ? "One master resume for each direction you’re heading. Tailored copies for specific jobs sit underneath, made from the same confirmed facts."
            : "One master resume for each direction you’re heading, made from the facts you confirmed."
        }
      >
        <NewResume demo={demo} />
      </PageHeader>

      <div className={s.layout}>
        <div className={s.list}>
          {demo && masters.length > 0 && <p className={a.quiet}>These are sample resumes, so they can be opened but not downloaded.</p>}
          {resumeList.length === 0 && (
            <div className={a.empty}>
              <p className="margin-note">No resumes yet.</p>
              <p className={a.note}>Your first master resume is built from the facts you confirm. Start with the resume you already have.</p>
              <Link href="/onboarding" className="btn btn-primary btn-small">
                Import my resume
              </Link>
            </div>
          )}
          {masters.map((m) => {
            const children = resumeList.filter((r) => r.parent === m.id);
            return (
              <article key={m.id} className={s.master}>
                <div className={s.thumb} aria-hidden>
                  <span className={s.tName} />
                  <span className={s.tRule} />
                  {Array.from({ length: 7 }, (_, i) => (
                    <span key={i} className={s.tLine} style={{ width: `${[92, 84, 88, 60, 90, 78, 52][i]}%` }} />
                  ))}
                </div>
                <div className={s.masterBody}>
                  <div className={s.titleRow}>
                    <h2 className={s.name}>{m.name}</h2>
                    <span className={`stamp ${s.kind}`}>Master</span>
                  </div>
                  <p className={a.note}>{m.target}</p>
                  <p className={a.mono}>
                    {m.template} template · updated {m.updated}
                  </p>
                  {m.freshness === "outdated" ? (
                    <p className={s.outdated}>
                      <span className={s.dot} aria-hidden />
                      {m.outdatedReason ?? "Your facts changed since this version"}
                    </p>
                  ) : (
                    <p className={s.current}>Up to date with your profile</p>
                  )}
                  <div className={s.actions}>
                    <Link href={href(m.id)} className="btn btn-secondary btn-small">
                      Open
                    </Link>
                    <Downloads resumeId={m.id} template={m.template} demo={demo} />
                    {m.freshness === "outdated" && <UpdateResume resumeId={m.id} demo={demo} />}
                  </div>

                  {children.length > 0 && (
                    <ul className={s.children}>
                      {children.map(tailoredRow)}
                    </ul>
                  )}
                </div>
              </article>
            );
          })}
          {loose.length > 0 && (
            <section className={`${s.master} ${s.loose}`} aria-labelledby="loose-h">
              <div className={s.masterBody}>
                <h2 id="loose-h" className={s.name}>
                  Tailored for jobs
                </h2>
                <p className={a.note}>Made from a job page, without a master resume behind them.</p>
                <ul className={s.children}>{loose.map(tailoredRow)}</ul>
              </div>
            </section>
          )}
        </div>

        <aside className={s.side}>
          {usage.tailored && (
            <div className={a.card}>
              <div className={a.meter}>
                <div className={a.meterTop}>
                  <span>Tailored resumes this month</span>
                  <span>
                    {usage.tailored.used} of {usage.tailored.limit}
                  </span>
                </div>
                <div className={a.meterTrack}>
                  <span className={a.meterFill} style={{ width: `${(usage.tailored.used / usage.tailored.limit) * 100}%` }} />
                </div>
                <p className={a.note}>
                  {usage.tailored.used >= usage.tailored.limit
                    ? `You’ve made all your tailored resumes for this month; more on ${usage.resetsOn}. Every resume here can still be opened and downloaded.`
                    : "Master resumes and downloads are always free and unlimited."}
                </p>
              </div>
            </div>
          )}
          <div className={`${a.card} ${s.tip}`}>
            <p className="margin-note">Switching fields? Make a second master resume for the new direction.</p>
          </div>
        </aside>
      </div>
    </>
  );
}
