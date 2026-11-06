import type { Metadata } from "next";
import PageHeader from "@/components/app/PageHeader";
import { TabLinks } from "@/components/ui/Tabs";
import { getFeed, getJobs, getProfile, getUsage, isDemo } from "@/lib/data";
import ForYou, { feedQuery } from "./ForYou";
import JobsActions from "./JobsActions";
import Saved from "./Saved";
import s from "./jobs.module.css";

export const metadata: Metadata = { title: "Jobs" };

// Jobs = two URL tabs (DESIGN.md 3.1, 4.5): For you (the feed, default; /feed redirects here) and Saved & pasted.
// The monthly quota is said once, here, never per card (PRODUCT-PLAN §3). ?paste=1 / ?settings=1 open the dialogs.
export default async function JobsPage({ searchParams }: PageProps<"/jobs">) {
  const sp = await searchParams;
  const saved = sp.tab === "saved";
  const query = feedQuery(sp);
  const [jobs, usage, demo, { profile }, feed] = await Promise.all([getJobs(), getUsage(), isDemo(), getProfile(), saved ? null : getFeed(query)]);
  const left = Math.max(0, usage.matches.limit - usage.matches.used);
  const skills = profile.skills.filter((k) => k.evidence > 0).length;
  const quota =
    left === 0
      ? `No job checks left this month (${usage.matches.limit} used) · resets ${usage.resetsOn}`
      : `${left} of ${usage.matches.limit} job checks left this month`;
  const open = sp.paste === "1" ? "paste" : sp.settings === "1" && feed ? "settings" : null;

  return (
    <div className={s.page}>
      <PageHeader title="Jobs">
        <JobsActions demo={demo} usage={usage} settings={feed ? { alerts: feed.alerts, learned: feed.learned } : null} open={open} />
      </PageHeader>
      <TabLinks
        label="Jobs sections"
        className={s.tabs}
        items={[
          { href: "/jobs", label: "For you", current: !saved },
          { href: "/jobs?tab=saved", label: `Saved & pasted${jobs.length ? ` · ${jobs.length}` : ""}`, current: saved },
        ]}
      />
      <p className={s.quota} id="jobs-quota">
        {saved ? "Jobs you saved or pasted, with their checks" : `Ranked to your ${skills} confirmed skill${skills === 1 ? "" : "s"}`} · {quota}
      </p>
      {feed ? <ForYou query={query} feed={feed} demo={demo} checksLeft={left} checksLimit={usage.matches.limit} /> : <Saved jobs={jobs} demo={demo} />}
    </div>
  );
}
