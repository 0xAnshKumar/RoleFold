import type { Metadata } from "next";
import { getProfile, getResumes, isDemo } from "@/lib/data";
import Onboarding from "./Onboarding";

export const metadata: Metadata = { title: "Set up your profile" };

export default async function OnboardingPage({ searchParams }: PageProps<"/onboarding">) {
  const { step } = await searchParams;
  const [demo, { drafts, profile, facts }, resumes] = await Promise.all([isDemo(), getProfile(), getResumes()]);
  return (
    <Onboarding
      groups={drafts}
      education={profile.education}
      achievements={profile.achievements}
      demo={demo}
      about={{ name: profile.name, headline: profile.headline, location: profile.location, email: profile.email, phone: profile.phone, links: profile.links }}
      goals={profile.goals}
      prefs={profile.prefs}
      experience={{ roles: profile.roles, projects: profile.projects, facts, confirmed: profile.confirmed }}
      hasResume={resumes.length > 0}
      initialStep={step === "confirm" ? 1 : 0}
    />
  );
}
