import type { Metadata } from "next";
import PageHeader from "@/components/app/PageHeader";
import { getProfile, isDemo } from "@/lib/data";
import { suggest } from "@/lib/suggestions";
import Improve from "./Improve";

export const metadata: Metadata = { title: "Improve your resume" };

/** Improve: suggestions from plain-code checks over the confirmed profile (lib/suggestions.ts). No model call. */
export default async function ImprovePage() {
  const [{ profile, facts }, demo] = await Promise.all([getProfile(), isDemo()]);
  return (
    <>
      <PageHeader title="Improve your resume" sub="Suggestions from the facts you confirmed. Nothing changes unless you change it, in your own words." />
      <Improve suggestions={suggest(profile, facts)} demo={demo} />
    </>
  );
}
