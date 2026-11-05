import type { Metadata } from "next";
import Link from "next/link";
import PageHeader from "@/components/app/PageHeader";
import a from "@/components/app/app.module.css";
import { getJobs, getUsage, isDemo } from "@/lib/data";
import { SEAL_COLOR, sealShort } from "@/components/ui";
import type { JobStatus } from "@/lib/mock";
import PasteJob from "./PasteJob";
import s from "./jobs.module.css";

export const metadata: Metadata = { title: "Jobs" };

const STATUS: Record<JobStatus, string> = { saved: "Saved", applied: "Marked applied", not_interested: "Not interested", dismissed: "Dismissed" };

export default async function JobsPage() {
  const [savedJobs, usage, demo] = await Promise.all([getJobs(), getUsage(), isDemo()]);
  return (
    <>
      <PageHeader
        title="Is this job worth it?"
        sub="Paste any job. We check the must-haves first, then every requirement against facts you’ve confirmed. One plain verdict, and exactly what would close the gaps."
      />

      <div className={s.top}>
        <PasteJob demo={demo} usage={usage} />

        <aside className={s.side} aria-label="Your monthly usage and tips">
          <div className={a.card}>
            <div className={a.meter}>
              <div className={a.meterTop}>
                <span>Job checks this month</span>
                <span>
                  {usage.matches.used} of {usage.matches.limit}
                </span>
              </div>
              <div className={a.meterTrack}>
                <span className={a.meterFill} style={{ width: `${(usage.matches.used / usage.matches.limit) * 100}%` }} />
              </div>
              <p className={a.note}>
                Re-checking a job after you update your profile is free. Resets {usage.resetsOn}.
              </p>
            </div>
          </div>
          <div className={`${a.card} ${s.tips}`}>
            <p className={s.tipsHead}>Where to copy job text from</p>
            <ul>
              <li>Naukri, LinkedIn or Indeed: open the job, select the full description.</li>
              <li>A company careers page: include the requirements section.</li>
              <li>An email or WhatsApp forward: paste it as it is.</li>
            </ul>
            <p className={a.note}>We read only the text you paste. We never open job sites for you.</p>
          </div>
        </aside>
      </div>

      <section className={a.section} aria-labelledby="saved-title">
        <div className={a.sectionHead}>
          <h2 id="saved-title" className={a.h2}>
            Your jobs
          </h2>
          <p className={a.note}>“Applied” is what you marked. We never apply for you.</p>
        </div>
        {savedJobs.length === 0 ? (
          <div className={a.empty}>
            <p className="margin-note">No jobs yet.</p>
            <p className={a.note}>Paste a job you’re eyeing above. Its verdict and the gaps to close will be kept here.</p>
          </div>
        ) : (
          <ul className={`${a.rows} ${a.cardFlat}`}>
            {savedJobs.map((j, i) => (
              <li key={`${j.id}-${i}`}>
                {j.verdict ? (
                  <span className={a.miniSeal} style={{ color: SEAL_COLOR[j.verdict] }}>
                    {sealShort(j.verdict)}
                  </span>
                ) : (
                  <span className={`${a.miniSeal} ${s.pending}`}>Analysing…</span>
                )}
                <div className={a.rowMain}>
                  {j.verdict ? (
                    <Link href={`/jobs/${j.id}`} className={a.rowTitle}>
                      {j.title}
                    </Link>
                  ) : (
                    <span className={a.rowTitle}>{j.title}</span>
                  )}
                  {j.company && <p className={a.note}>{j.company}</p>}
                  <p className={a.mono}>
                    Added {j.added} ·{" "}
                    {!j.verdict ? "checking each requirement, refresh in a minute" : j.gaps === 0 ? "no gaps" : `${j.gaps} gap${j.gaps > 1 ? "s" : ""} to close`}
                  </p>
                </div>
                <span className={j.status === "applied" ? s.applied : s.saved}>{STATUS[j.status] ?? "Saved"}</span>
                {j.verdict && (
                  <Link href={`/jobs/${j.id}`} className="btn btn-secondary btn-small">
                    Open
                  </Link>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
