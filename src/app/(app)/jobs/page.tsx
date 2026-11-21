import type { Metadata } from "next";
import PageHeader from "@/components/app/PageHeader";
import { ButtonLink } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/State";
import { TabLinks } from "@/components/ui/Tabs";
import { getJobs, getProfile, getUsage, isDemo } from "@/lib/data";
import { defaultSearch } from "@/lib/jobSearch";
import FindJobs from "./FindJobs";
import JobsActions from "./JobsActions";
import Saved from "./Saved";
import s from "./jobs.module.css";

export const metadata: Metadata = { title: "Jobs" };

// Jobs = two URL tabs: Find jobs (default: searches on job sites built from the profile; we don't list jobs ourselves)
// and Saved & pasted. The monthly quota is said once, here, never per card (PRODUCT-PLAN §3). ?paste=1 opens the dialog.
export default async function JobsPage({ searchParams }: PageProps<"/jobs">) {
  const sp = await searchParams;
  const saved = sp.tab === "saved";
  const [jobs, usage, demo, { profile }] = await Promise.all([getJobs(), getUsage(), isDemo(), getProfile()]);
  const left = Math.max(0, usage.matches.limit - usage.matches.used);
  const proven = profile.skills.filter((k) => k.evidence > 0).sort((a, b) => b.evidence - a.evidence);
  const quota =
    left === 0
      ? `No job checks left this month (${usage.matches.limit} used) · resets ${usage.resetsOn}`
      : `${left} of ${usage.matches.limit} job checks left this month`;
  const open = sp.paste === "1" ? "paste" : null;

  return (
    <div className={s.page}>
      <PageHeader title="Jobs">
        <JobsActions demo={demo} usage={usage} open={open} />
      </PageHeader>
      <TabLinks
        label="Jobs sections"
        className={s.tabs}
        items={[
          { href: "/jobs", label: "Find jobs", current: !saved },
          { href: "/jobs?tab=saved", label: `Saved & pasted${jobs.length ? ` · ${jobs.length}` : ""}`, current: saved },
        ]}
      />
      <p className={s.quota} id="jobs-quota">
        {saved ? "Jobs you saved or pasted, with their checks" : "Search the big job sites, then paste a job here to check your fit"} · {quota}
      </p>
      {saved ? (
        <Saved jobs={jobs} demo={demo} />
      ) : !profile.roles.length && !profile.confirmed && !profile.drafts ? (
        // New account: searches are built from the resume, so that comes first.
        <Card>
          <EmptyState
            icon="resume"
            title="Start with your resume"
            action={
              <ButtonLink href="/onboarding" variant="primary">
                Upload my resume
              </ButtonLink>
            }
          >
            Your job searches are built from it. It takes about five minutes.
          </EmptyState>
        </Card>
      ) : (
        <FindJobs initial={defaultSearch(profile)} skills={proven.slice(0, 10).map((k) => k.name)} />
      )}
    </div>
  );
}
