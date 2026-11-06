import Link from "next/link";
import { ButtonLink } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { VerdictMark } from "@/components/ui/Status";
import { EmptyState } from "@/components/ui/State";
import type { SavedJob } from "@/lib/mock";
import SavedStatus from "./SavedStatus";
import s from "./jobs.module.css";

/** "Saved & pasted" tab of /jobs: the jobs you saved or checked, each with its verdict mark and your status. DESIGN.md 4.5. */
export default function Saved({ jobs, demo }: { jobs: SavedJob[]; demo: boolean }) {
  if (jobs.length === 0)
    return (
      <EmptyState
        title="Nothing saved yet"
        action={
          <ButtonLink href="/jobs?tab=saved&paste=1" scroll={false}>
            Paste a job
          </ButtonLink>
        }
      >
        Save jobs from For you, or paste one you found elsewhere. Its verdict and the gaps to close are kept here.
      </EmptyState>
    );
  return (
    <section aria-labelledby="saved-title" className={s.feed}>
      <h2 id="saved-title" className="sr-only">
        Saved and pasted jobs
      </h2>
      <ul className={s.list}>
        {jobs.map((j, i) => (
          <li key={`${j.id}-${i}`}>
            <Card as="article" className={s.card}>
              <div className={s.cardHead}>
                <div className={s.cardText}>
                  <h3 className={s.cardTitle} title={j.title}>
                    {j.verdict ? <Link href={`/jobs/${j.id}`}>{j.title}</Link> : j.title}
                  </h3>
                  <p className={s.where}>{[j.company, `added ${j.added}`].filter(Boolean).join(" · ")}</p>
                </div>
                <SavedStatus jobId={j.id} title={j.title} initial={j.status} demo={demo} />
              </div>
              <div className={s.savedFoot}>
                {j.verdict ? (
                  <VerdictMark verdict={j.verdict} detail={j.gaps === 0 ? "no gaps" : `${j.gaps} gap${j.gaps > 1 ? "s" : ""} to close`} />
                ) : (
                  <span className={s.muted}>Checking each requirement. Refresh in a minute.</span>
                )}
                {j.verdict && (
                  <ButtonLink href={`/jobs/${j.id}`} size="sm">
                    Open check
                  </ButtonLink>
                )}
              </div>
            </Card>
          </li>
        ))}
      </ul>
      <p className={s.footNote}>“Applied” is only what you marked. We never apply for you.</p>
    </section>
  );
}
