import { getProfile, isDemo } from "@/lib/data";
import Onboarding from "./Onboarding";

export default async function OnboardingPage() {
  const [{ drafts, profile }, demo] = await Promise.all([getProfile(), isDemo()]);
  return (
    <Onboarding
      groups={drafts}
      education={profile.education}
      demo={demo}
      about={{ name: profile.name, headline: profile.headline, location: profile.location, email: profile.email, phone: profile.phone }}
      goals={profile.goals}
      prefs={profile.prefs}
    />
  );
}
