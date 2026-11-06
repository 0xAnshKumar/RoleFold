import Hero from "@/components/landing/Hero";
import HowItWorks from "@/components/landing/HowItWorks";
import LandingNav from "@/components/landing/LandingNav";
import { Faq, Footer, Modules, Pricing, ProofStandard, WhoFor } from "@/components/landing/Sections";
import s from "@/components/landing/landing.module.css";

// DESIGN.md 4.1. Always light (the root boot script never sets night on "/"). Every section is painted on arrival:
// the only load-time motion is the hero entrance and the seal press.
export default function Landing() {
  return (
    <div className={s.page}>
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <LandingNav />
      <main id="main" className={s.main}>
        <Hero />
        <Modules />
        <HowItWorks />
        <ProofStandard />
        <WhoFor />
        <Pricing />
        <Faq />
      </main>
      <Footer />
    </div>
  );
}
