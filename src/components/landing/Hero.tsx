import Link from "next/link";
import { ButtonLink } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { facts, matches, resumes } from "@/lib/mock";
import HeroMockup from "./HeroMockup";
import s from "./landing.module.css";

// What the sample person's old resume said, word for word: the source each confirmed fact was read from.
const SOURCES: Record<string, string> = {
  "F-12": "Led checkout migration AngularJS → React; bundle 1.8 MB → 640 KB",
  "F-14": "Built + maintain React component library (used by 4 teams)",
  "F-15": "Helped cut PDP LCP 4.2s → 2.1s (images to CDN, responsive sizes)",
};

export default function Hero() {
  const role = resumes[0].sections[0];
  const lines = role.lines.map((l) => ({ ...l, factId: l.factId!, fact: facts.find((f) => f.id === l.factId)!.text, source: SOURCES[l.factId!] }));
  const job = matches[0];
  const req = job.requirements[1];
  const count = (st: string) => job.requirements.filter((r) => r.status === st).length;

  return (
    <section className={`${s.hero} grain`} aria-labelledby="hero-title">
      <span className={`guilloche-rosette ${s.rosette}`} aria-hidden />
      <div className={s.heroText}>
        <h1 id="hero-title" className={`t-hero ${s.heroTitle}`}>
          A resume where every line has{" "}
          <span className="proof">
            <span className="italic-accent">proof.</span>
          </span>
        </h1>
        <p className={`t-lead ${s.heroLead} ${s.enter}`} style={{ "--i": 1 } as React.CSSProperties}>
          Upload the resume you have and confirm what’s really yours. Hunt writes an ATS-safe resume from those facts
          alone, then finds real jobs and tells you plainly how you fit.
        </p>
        <div className={`${s.heroCtas} ${s.enter}`} style={{ "--i": 2 } as React.CSSProperties}>
          <ButtonLink href="/onboarding" variant="primary" size="lg" className={s.onPanel}>
            Build my resume
          </ButtonLink>
          <Link href="/jobs" className={s.panelLink}>
            See jobs for my resume <Icon name="arrowRight" size={18} />
          </Link>
        </div>
        <p className={`t-sm ${s.heroFine} ${s.enter}`} style={{ "--i": 3 } as React.CSSProperties}>
          Free PDF and Word export · No card needed
        </p>
      </div>
      <HeroMockup
        name={resumes[0].name}
        roleLine={`${role.title} · ${role.org} · ${role.dates}`}
        lines={lines}
        confirmedOn={facts[0].confirmedOn}
        job={{
          title: job.title,
          company: job.company,
          verdict: job.verdict,
          counts: [count("supported"), count("partial"), count("no_evidence")],
          req: { text: req.text, quote: req.quote!, factId: req.factId!, fact: facts.find((f) => f.id === req.factId)!.text },
        }}
      />
    </section>
  );
}
