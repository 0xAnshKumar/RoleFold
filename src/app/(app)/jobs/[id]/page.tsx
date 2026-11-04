import Link from "next/link";
import { notFound } from "next/navigation";
import { SEAL_COLOR, Stamp } from "@/components/ui";
import { getJob, getMatch, getProfile, getUsage, isDemo } from "@/lib/data";
import type { Fact, Match, Requirement, Status } from "@/lib/mock";
import { JobStatusButtons, RequirementRow } from "./Actions";
import DraftFact from "./DraftFact";
import Feedback from "./Feedback";
import Tailor from "./Tailor";
import s from "./match.module.css";

const GOAL: Record<Match["goalFit"]["status"], Status> = { aligned: "supported", partly: "partial", not_aligned: "conflict", unknown: "unknown" };

export default async function MatchPage({ params }: PageProps<"/jobs/[id]">) {
  const { id } = await params;
  const [m, job, { facts, profile }, usage, demo] = await Promise.all([getMatch(id), getJob(id), getProfile(), getUsage(), isDemo()]);
  if (!m) notFound();

  const required = m.requirements.filter((r) => r.importance === "required");
  const preferred = m.requirements.filter((r) => r.importance === "preferred");
  const counts = {
    supported: m.requirements.filter((r) => r.status === "supported").length,
    partial: m.requirements.filter((r) => r.status === "partial").length,
    missing: m.requirements.filter((r) => r.status === "no_evidence").length,
    gap: m.requirements.filter((r) => r.status === "gap").length,
  };

  return (
    <div className={s.page}>
      <header className={s.verdictBand}>
        <div className={s.verdictText}>
          <Link href="/jobs" className={s.back}>
            ← All jobs
          </Link>
          <h1 className={s.title}>{m.title}</h1>
          <p className={s.company}>
            {m.company} <span className={s.source}>· {m.source}</span>
          </p>
          <ul className={s.reasons}>
            {m.reasons.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
          <p className={s.basis}>{m.profileNote}</p>
          {m.freshness === "outdated" && (
            <p className={s.basis}>Outdated: your confirmed facts changed after this check. The verdict may move once it’s re-read.</p>
          )}
        </div>
        <div className={s.verdictSide}>
          <div className={s.seal} style={{ color: SEAL_COLOR[m.verdict], borderColor: "currentColor" }} role="img" aria-label={`Verdict: ${m.verdict}`}>
            {m.verdict}
          </div>
          <p className={s.tally}>
            <b>{counts.supported}</b> supported · <b>{counts.partial}</b> partial · <b>{counts.missing}</b> no evidence yet
            {counts.gap > 0 && (
              <>
                {" "}
                · <b>{counts.gap}</b> you don’t have
              </>
            )}
          </p>
          <p className={s.noPct}>A verdict from published rules. Not a probability of being hired.</p>
        </div>
      </header>

      <div className={s.grid}>
        <div className={s.main}>
          <section aria-labelledby="elig" className={s.block}>
            <div className={s.blockHead}>
              <h2 id="elig">Can you apply?</h2>
              <p>Checked first. Anything the posting doesn&apos;t say stays unknown, never assumed.</p>
            </div>
            <ul className={s.eligGrid}>
              {m.eligibility.map((e) => (
                <li key={e.field} className={s.elig}>
                  <div className={s.eligTop}>
                    <span className={s.field}>{e.field}</span>
                    <Stamp status={e.status} />
                  </div>
                  <p className={s.eligValue}>{e.value}</p>
                  {e.quote ? (
                    <p className={s.quote}>
                      <span className="evidence">“{e.quote}”</span>
                    </p>
                  ) : (
                    <p className={s.unknownNote}>Not in the posting. Added to your questions.</p>
                  )}
                </li>
              ))}
            </ul>
          </section>

          <section aria-labelledby="req" className={s.block}>
            <div className={s.blockHead}>
              <h2 id="req">What they ask for</h2>
              <p>Each requirement against your confirmed facts, with the exact words from the posting.</p>
            </div>
            <ReqGroup title="Required" items={required} facts={facts} jobId={id} demo={demo} />
            <ReqGroup title="Nice to have" items={preferred} facts={facts} jobId={id} demo={demo} />
          </section>

          <section aria-labelledby="goal" className={`${s.block} ${s.twoUp}`}>
            <div className={s.mini}>
              <h2 id="goal">Goal fit</h2>
              <p className={s.goal}>
                <Stamp status={GOAL[m.goalFit.status]} /> {m.goalFit.text}
              </p>
            </div>
            {m.questions.length > 0 && (
              <div className={s.mini}>
                <h2>Ask the recruiter</h2>
                <ul className={s.questions}>
                  {m.questions.map((q) => (
                    <li key={q}>{q}</li>
                  ))}
                </ul>
              </div>
            )}
          </section>
        </div>

        <aside className={s.side} aria-label="Next steps">
          <DraftFact question={m.enrichment} roles={profile.roles} projects={profile.projects} demo={demo} />
          <div className={`${s.sideCard} ${s.tailor}`}>
            <h2 className={s.sideTitle}>Tailor your resume</h2>
            <p>Reorders and rewords your confirmed facts for this job. Nothing new is invented.</p>
            <Tailor jobId={id} demo={demo} usage={usage} />
            <JobStatusButtons jobId={id} initial={job?.status ?? null} demo={demo} />
          </div>
          <Feedback jobId={id} demo={demo} />
        </aside>
      </div>
    </div>
  );
}

function ReqGroup({ title, items, facts, jobId, demo }: { title: string; items: Requirement[]; facts: Fact[]; jobId: string; demo: boolean }) {
  if (!items.length) return null;
  return (
    <div className={s.reqGroup}>
      <h3 className={s.reqGroupTitle}>{title}</h3>
      <ul className={s.reqs}>
        {items.map((r) => (
          <RequirementRow key={r.id ?? r.text} jobId={jobId} r={r} fact={facts.find((f) => f.id === r.factId)} demo={demo} />
        ))}
      </ul>
    </div>
  );
}
