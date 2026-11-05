import type { Metadata } from "next";
import PageHeader from "@/components/app/PageHeader";
import a from "@/components/app/app.module.css";
import { TabLinks } from "@/components/ui/Tabs";
import { getJobs } from "@/lib/data";
import ForYou from "./ForYou";
import Saved from "./Saved";

export const metadata: Metadata = { title: "Jobs" };

// Jobs = two URL tabs (DESIGN.md 3.1, 4.5): For you (the feed, default; /feed redirects here) and Saved & pasted.
export default async function JobsPage({ searchParams }: PageProps<"/jobs">) {
  const sp = await searchParams;
  const saved = sp.tab === "saved";
  const jobs = await getJobs();
  return (
    <>
      <PageHeader title="Jobs" />
      <div className={a.tabbed}>
        <TabLinks
          label="Jobs sections"
          items={[
            { href: "/jobs", label: "For you", current: !saved },
            { href: "/jobs?tab=saved", label: `Saved & pasted${jobs.length ? ` · ${jobs.length}` : ""}`, current: saved },
          ]}
        />
        {saved ? <Saved /> : <ForYou sp={sp} />}
      </div>
    </>
  );
}
