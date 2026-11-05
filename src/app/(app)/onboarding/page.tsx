import type { Metadata } from "next";
import { api } from "@/lib/api";
import { getProfile, isDemo } from "@/lib/data";
import { questions as sampleQuestions, type Question } from "@/lib/mock";
import Onboarding from "./Onboarding";

export const metadata: Metadata = { title: "Set up your profile" };

// Guided questions are optional: if they can't load, onboarding goes on without them.
const getQuestions = async (demo: boolean) =>
  demo ? sampleQuestions : (await api<{ items: Question[] }>("/enrichment-questions").catch(() => ({ items: [] }))).items;

export default async function OnboardingPage({ searchParams }: PageProps<"/onboarding">) {
  const { step } = await searchParams;
  const demo = await isDemo();
  const [{ drafts, profile }, questions] = await Promise.all([getProfile(), getQuestions(demo)]);
  return (
    <Onboarding
      groups={drafts}
      education={profile.education}
      demo={demo}
      about={{ name: profile.name, headline: profile.headline, location: profile.location, email: profile.email, phone: profile.phone }}
      goals={profile.goals}
      prefs={profile.prefs}
      questions={questions}
      initialStep={step === "confirm" ? 1 : 0}
    />
  );
}
