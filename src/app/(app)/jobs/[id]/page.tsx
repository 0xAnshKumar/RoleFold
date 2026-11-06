import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Icon } from "@/components/ui/Icon";
import { ProofMark } from "@/components/ui/Proof";
import { StatusMark } from "@/components/ui/Status";
import { VerdictSeal } from "@/components/ui/VerdictSeal";
import { getJob, getMatch, getProfile, getUsage, isDemo } from "@/lib/data";
import type { Match, Requirement, Status } from "@/lib/mock";
import { JobStatusButtons, Requirements, StatusGlyph } from "./Actions";
import Feedback from "./Feedback";
import { CloseGapButton, GapProvider } from "./Gap";
import Tailor from "./Tailor";
import s from "./match.module.css";

export const metadata: Metadata = { title: "Job check" };

const GOAL: Record<Match["goalFit"]["status"], Status> = { aligned: "match", partly: "partial", not_aligned: "conflict", unknown: "unknown" };

/** The 3 biggest gaps: missing required items first, then missing nice-to-haves, then partly proven ones. */
function biggestGaps(reqs: Requirement[]) {
  const rank = (r: Requirement) =>
    (r.status === "no_evidence" || r.status === "gap" ? 0 : r.status === "partial" ? 2 : 9) + (r.importance === "required" ? 0 : 1);
  return reqs
    .map((r, i) => ({ r, key: `req-${i}`, rank: rank(r) }))
    .filter((x) => x.rank < 9)
    .sort((x, y) => x.rank - y.rank)
    .slice(0, 3);
}

/** Job check (DESIGN.md 4.6, PRODUCT-PLAN §3): verdict, the 3 biggest gaps and one main action first; details below. */
export default async function MatchPage({ params }: PageProps<"/jobs/[id]">) {
  const { id } = await params;
  const [m, job, { facts, profile }, usage, demo] = await Promise.all([getMatch(id), getJob(id), getProfile(), getUsage(), isDemo()]);
  if (!m) notFound();
  const gaps = biggestGaps(m.requirements);
  // A gap the user already owned ("I don't have this") can't be closed with a fact; open the drawer on the first one that can.
  const firstOpen = gaps.find((g) => g.r.status !== "gap")?.r ?? null;

  return (
    <GapProvider enrichment={m.enrichment} roles={profile.roles} projects={profile.projects} demo={demo}>
      <div className={s.page}>
        <header className={s.header}>
          <Link href="/jobs" className={s.back}>
            <Icon name="arrowLeft" size={18} />
            Jobs
          </Link>
          <h1 className={s.title}>{m.title}</h1>
          <p className={s.meta}>{[m.company, m.source].filter(Boolean).join(" · ")}</p>
        </header>

        <section className={s.verdict} aria-labelledby="verdict-title">
          <div className={s.seal}>
            <VerdictSeal verdict={m.verdict} />
          </div>
          <div className={s.verdictBody}>
            <h2 id="verdict-title" className={s.verdictTitle}>
              {m.verdict}
            </h2>
            <ul className={s.reasons}>
              {m.reasons.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
            {m.freshness === "outdated" && <p className={s.outdated}>Your confirmed facts changed after this check. The verdict may move once it’s re-read.</p>}
            {gaps.length > 0 && (
              <div className={s.gaps}>
                <span className={s.label}>Biggest gaps</span>
                <ul className={s.gapChips}>
                  {gaps.map((g) => (
                    <li key={g.key}>
                      <a href={`#${g.key}`} className={s.gapChip}>
                        <StatusGlyph status={g.r.status} />
                        {g.r.text}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <div className={s.mainAction}>
              {firstOpen && <CloseGapButton first={firstOpen} />}
              {usage.tailored && <Tailor jobId={id} demo={demo} tailored={usage.tailored} resetsOn={usage.resetsOn} />}
            </div>
            <JobStatusButtons jobId={id} initial={job?.status ?? null} demo={demo} />
          </div>
        </section>
        <p className={s.money}>
          <Icon name="alert" size={16} />
          Real employers never ask for money to apply, interview or train you. If this one does, report it.
        </p>

        {m.eligibility.length > 0 && (
          <section aria-labelledby="elig" className={s.block}>
            <h2 id="elig" className={s.h2}>
              Eligibility
            </h2>
            <ul className={s.elig}>
              {m.eligibility.map((e) => (
                <li key={e.field}>
                  <details className={s.eligItem}>
                    <summary>
                      <StatusGlyph status={e.status} />
                      <span>
                        <span className={s.eligField}>{e.field}</span>
                        <span className={s.eligValue}>{e.value}</span>
                      </span>
                    </summary>
                    {e.quote ? (
                      <p className={s.quote}>
                        <ProofMark quote>“{e.quote}”</ProofMark>
                      </p>
                    ) : (
                      <p className={s.eligNote}>Not in the posting, so it stays unknown. Ask the recruiter.</p>
                    )}
                  </details>
                </li>
              ))}
            </ul>
          </section>
        )}

        <Requirements jobId={id} requirements={m.requirements} facts={facts} demo={demo} />

        <section aria-labelledby="goal" className={s.block}>
          <h2 id="goal" className={s.h2}>
            Goal fit
          </h2>
          <p className={s.goal}>
            <StatusMark status={GOAL[m.goalFit.status]} /> <span>{m.goalFit.text}</span>
          </p>
        </section>

        {m.questions.length > 0 && (
          <section aria-labelledby="ask" className={s.block}>
            <h2 id="ask" className={s.h2}>
              Ask the recruiter
            </h2>
            <ul className={s.questions}>
              {m.questions.map((q) => (
                <li key={q}>{q}</li>
              ))}
            </ul>
          </section>
        )}

        <footer className={s.footer}>
          <Feedback jobId={id} demo={demo} />
          <p className={s.basis}>
            {m.profileNote && `${m.profileNote.replace(/\.$/, "")}. `}A verdict from published rules, not a probability of being hired.
          </p>
        </footer>
      </div>
    </GapProvider>
  );
}
