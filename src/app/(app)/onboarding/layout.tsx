import { Providers } from "@/app/providers";

// Motion lives only on routes that animate with it (the confirm queue); /jobs and the rest ship none (DESIGN.md 6.6).
export default function OnboardingLayout({ children }: { children: React.ReactNode }) {
  return <Providers>{children}</Providers>;
}
