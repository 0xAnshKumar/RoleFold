import a from "@/components/app/app.module.css";
import { ButtonLink } from "@/components/ui/Button";
import { StatusMark } from "@/components/ui/Status";
import { getSkillsInsight } from "@/lib/data";
import type { InsightGap } from "@/lib/mock";
import s from "./profile.module.css";

// PRD §6.4: gaps that recur across your analysed jobs, as counts out of your jobs. Never a percentage or a score.
function Gaps({ items, jobs, kind }: { items: InsightGap[]; jobs: number; kind: "gap" | "no_evidence" }) {
  return (
    <ul className={s.insightRows}>
      {items.map((g) => (
        <li key={g.label}>
          <div className={s.insightMain}>
            <span className={s.insightLabel}>{g.label}</span>
            <span className={a.note}>
              Asked for in {g.jobs} of {jobs} jobs · {g.required ? `required in ${g.required}` : "a nice-to-have in each"}
            </span>
          </div>
          <StatusMark status={kind} />
        </li>
      ))}
    </ul>
  );
}

/** Skills insight, inside the Profile "Skills" card (was /skills, which now redirects to /profile#skills). */
export default async function SkillsInsight() {
  const insight = await getSkillsInsight();
  const enough = insight.jobs >= insight.minJobs;
  return (
    <div className={s.insight} aria-labelledby="learn-next">
      <div className={s.sectionHead}>
        <h3 id="learn-next" className={s.subTitle}>
          What to learn next
        </h3>
        <p className={a.note}>Skills your checked jobs keep asking for that your profile doesn’t show yet. Jobs you marked not interested are left out.</p>
      </div>
      {!enough ? (
        <div className={s.insightEmpty}>
          <p>
            Not enough jobs to see a pattern yet. Check at least {insight.minJobs} jobs and the skills they keep asking for show up here. So far:{" "}
            {insight.jobs}.
          </p>
          <ButtonLink href="/jobs?tab=saved&paste=1" size="sm">
            Paste a job you’re eyeing
          </ButtonLink>
        </div>
      ) : (
        <>
          <section className={s.insightGroup} aria-labelledby="learn">
            <h4 id="learn" className={s.insightHead}>
              You said you don’t have these
            </h4>
            {insight.learn.length ? (
              <Gaps items={insight.learn} jobs={insight.jobs} kind="gap" />
            ) : (
              <p className={a.note}>Nothing yet. When a job check asks for something you don’t have, mark it there and it’s counted here.</p>
            )}
          </section>
          <section className={s.insightGroup} aria-labelledby="record">
            <h4 id="record" className={s.insightHead}>
              Asked for often, nothing recorded
            </h4>
            {insight.record.length ? (
              <>
                <Gaps items={insight.record} jobs={insight.jobs} kind="no_evidence" />
                <p className={a.note}>
                  If you’ve done it, <a href="#exp">add it as a fact</a>. If not, it may be worth learning.
                </p>
              </>
            ) : (
              <p className={a.note}>No missing skill comes up in more than one of your jobs.</p>
            )}
          </section>
        </>
      )}
    </div>
  );
}
