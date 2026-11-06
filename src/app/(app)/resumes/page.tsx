import type { Metadata } from "next";
import Link from "next/link";
import PageHeader from "@/components/app/PageHeader";
import { StatusIcon } from "@/components/ui";
import { ButtonLink } from "@/components/ui/Button";
import { Card, cardLink, cardRaised } from "@/components/ui/Card";
import { ProgressBar } from "@/components/ui/Progress";
import { EmptyState } from "@/components/ui/State";
import { Badge } from "@/components/ui/Status";
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
      <Link href={href(c.id)} className={s.childLink}>
        {c.name}
      </Link>
      <span className={s.meta}>Tailored · updated {c.updated}</span>
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
          {demo && masters.length > 0 && <p id="sample-note" className={s.note}>These are sample resumes, so they can be opened but not downloaded.</p>}
          {resumeList.length === 0 && (
            <Card>
              <EmptyState
                icon="resume"
                title="No resume yet"
                action={
                  <ButtonLink href="/onboarding" variant="primary">
                    Create my resume
                  </ButtonLink>
                }
              >
                Your master resume is written from your confirmed facts. Start with the resume you already have.
              </EmptyState>
            </Card>
          )}
          {masters.map((m) => {
            const children = resumeList.filter((r) => r.parent === m.id);
            return (
              <Card as="article" interactive key={m.id} className={s.master}>
                <div className={s.thumb} aria-hidden>
                  <span className={s.tName} />
                  <span className={s.tRule} />
                  {[92, 84, 88, 60, 90, 78, 52].map((w, i) => (
                    <span key={i} className={s.tLine} style={{ width: `${w}%` }} />
                  ))}
                </div>
                <div className={s.body}>
                  <div className={s.titleRow}>
                    <h2 className={s.name}>
                      <Link href={href(m.id)} className={cardLink}>
                        {m.name}
                      </Link>
                    </h2>
                    <Badge>Master</Badge>
                  </div>
                  <p className={s.target}>{m.target}</p>
                  <p className={s.meta}>
                    {m.template} template · updated {m.updated}
                  </p>
                  {m.freshness === "outdated" ? (
                    <p className={`${s.fresh} ${s.outdated}`}>
                      <StatusIcon name="half" />
                      {m.outdatedReason ?? "Your facts changed since this version"}
                    </p>
                  ) : (
                    <p className={`${s.fresh} ${s.current}`}>
                      <StatusIcon name="check" />
                      Up to date with your profile
                    </p>
                  )}
                  <div className={`${s.actions} ${cardRaised}`}>
                    {m.freshness === "outdated" && <UpdateResume resumeId={m.id} demo={demo} />}
                    <Downloads resumeId={m.id} template={m.template} demo={demo} />
                  </div>
                  {children.length > 0 && <ul className={`${s.children} ${cardRaised}`}>{children.map(tailoredRow)}</ul>}
                </div>
              </Card>
            );
          })}
          {loose.length > 0 && (
            <Card as="section" aria-labelledby="loose-h">
              <h2 id="loose-h" className={s.name}>
                Tailored for jobs
              </h2>
              <p className={s.target}>Made from a job page, without a master resume behind them.</p>
              <ul className={s.children}>{loose.map(tailoredRow)}</ul>
            </Card>
          )}
        </div>

        <aside className={s.side}>
          {usage.tailored && (
            <Card className={s.sideCard}>
              <ProgressBar value={usage.tailored.used} max={usage.tailored.limit} label={`Tailored resumes this month: ${usage.tailored.used} of ${usage.tailored.limit}`} />
              <p className={s.note}>
                {usage.tailored.used >= usage.tailored.limit
                  ? `You’ve made all your tailored resumes for this month; more on ${usage.resetsOn}. Every resume here can still be opened and downloaded.`
                  : "Master resumes and downloads are always free and unlimited."}
              </p>
            </Card>
          )}
          <Card className={s.sideCard}>
            <h2 className={s.sideTitle}>Switching fields?</h2>
            <p className={s.note}>Make a second master resume for the new direction. Both are written from the same confirmed facts, and both are free.</p>
          </Card>
        </aside>
      </div>
    </>
  );
}
