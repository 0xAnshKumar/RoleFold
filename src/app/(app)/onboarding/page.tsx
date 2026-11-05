import type { Metadata } from "next";
import { ApiError } from "@/lib/api";
import { getProfile, getQuestions, isDemo } from "@/lib/data";
import Onboarding from "./Onboarding";

export const metadata: Metadata = { title: "Set up your profile" };

// Guided questions are optional: if the API errors, onboarding goes on without them. Anything else (the
// sign-in redirect on an expired session) propagates.
const optionalQuestions = () => getQuestions().catch((e) => (e instanceof ApiError ? [] : Promise.reject(e)));

export default async function OnboardingPage({ searchParams }: PageProps<"/onboarding">) {
  const { step } = await searchParams;
  const demo = await isDemo();
  const [{ drafts, profile }, questions] = await Promise.all([getProfile(), optionalQuestions()]);
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
