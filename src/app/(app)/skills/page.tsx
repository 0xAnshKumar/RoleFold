import type { Metadata } from "next";
import Link from "next/link";
import PageHeader from "@/components/app/PageHeader";
import a from "@/components/app/app.module.css";
import { StatusIcon } from "@/components/ui";
import { getSkillsInsight } from "@/lib/data";
import type { InsightGap } from "@/lib/mock";

export const metadata: Metadata = { title: "What to learn next" };

// PRD §6.4: gaps that recur across your analysed jobs, as counts out of your jobs. Never a percentage or a score.
function Gaps({ items, jobs, kind }: { items: InsightGap[]; jobs: number; kind: "gap" | "no_evidence" }) {
  return (
    <ul className={`${a.rows} ${a.cardFlat}`}>
      {items.map((g) => (
        <li key={g.label}>
          <div className={a.rowMain}>
            <span className={a.rowTitle}>{g.label}</span>
            <p className={a.mono}>
              Asked for in {g.jobs} of {jobs} jobs · {g.required ? `required in ${g.required}` : "a nice-to-have in each"}
            </p>
          </div>
          {kind === "gap" ? (
            <span className="stamp stamp-gap">
              <StatusIcon name="cross" /> Gap (you confirmed)
            </span>
          ) : (
            <span className="stamp stamp-no_evidence">
              <StatusIcon name="dash" /> No evidence yet
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}

export default async function SkillsPage() {
  const insight = await getSkillsInsight();
  const enough = insight.jobs >= insight.minJobs;
  return (
    <>
      <PageHeader
        title="What to learn next"
        sub="The skills your jobs keep asking for that your profile doesn’t show yet, counted across the jobs you’ve checked. Jobs you marked not interested are left out."
      />
      {!enough ? (
        <div className={a.empty}>
          <p className="margin-note">Not enough jobs to see a pattern yet.</p>
          <p className={a.note}>
            Check at least {insight.minJobs} jobs and the skills they keep asking for show up here. So far: {insight.jobs}.
          </p>
          <Link href="/jobs" className="btn btn-secondary btn-small">
            Paste a job you’re eyeing
          </Link>
        </div>
      ) : (
        <>
          <section className={a.section} aria-labelledby="learn">
            <div className={a.sectionHead}>
              <h2 id="learn" className={a.h2}>
                You said you don’t have these
              </h2>
              <p className={a.note}>From “I don’t have this” on a match page.</p>
            </div>
            {insight.learn.length ? (
              <Gaps items={insight.learn} jobs={insight.jobs} kind="gap" />
            ) : (
              <p className={a.note}>Nothing yet. When a match page asks for something you don’t have, mark it there and it’s counted here.</p>
            )}
          </section>
          <section className={a.section} aria-labelledby="record">
            <div className={a.sectionHead}>
              <h2 id="record" className={a.h2}>
                Asked for often, nothing recorded
              </h2>
              <p className={a.note}>
                If you’ve done it, <Link href="/profile">add it to your profile</Link>. If not, it may be worth learning.
              </p>
            </div>
            {insight.record.length ? (
              <Gaps items={insight.record} jobs={insight.jobs} kind="no_evidence" />
            ) : (
              <p className={a.note}>No missing skill comes up in more than one of your jobs.</p>
            )}
          </section>
        </>
      )}
    </>
  );
}
