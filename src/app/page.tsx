import Link from "next/link";
import { Chai } from "@/components/Doodles";
import HeroDesk from "@/components/landing/HeroDesk";
import Receipt from "@/components/landing/Receipt";
import { Compare, Faq, Features, Problem, Promises, WhatWeDo } from "@/components/landing/Sections";
import Story from "@/components/landing/Story";
import WhoFor from "@/components/landing/WhoFor";
import s from "@/components/landing/landing.module.css";

export default function Landing() {
  return (
    <>
      {/* shared ink filters: pen wobble for line art, speckle for rubber-stamp ink */}
      <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden>
        <filter id="ink-wobble">
          <feTurbulence type="fractalNoise" baseFrequency="0.018" numOctaves="2" seed="4" />
          <feDisplacementMap in="SourceGraphic" scale="1.4" />
        </filter>
        <filter id="stamp-ink">
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="1" seed="2" result="n" />
          <feColorMatrix in="n" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -1.3 1.55" result="holes" />
          <feComposite in="SourceGraphic" in2="holes" operator="in" />
        </filter>
      </svg>

      <header className={s.top}>
        <Link href="/" className={s.brand}>
          Hunt
        </Link>
        <nav className={s.topLinks} aria-label="Site">
          <a href="#what" className={s.topLink}>
            What it does
          </a>
          <a href="#how" className={s.topLink}>
            How it works
          </a>
          <a href="#who" className={s.topLink}>
            Who it’s for
          </a>
          <a href="#faq" className={s.topLink}>
            FAQ
          </a>
          <Link href="/onboarding" className="btn btn-secondary btn-small">
            Sign in
          </Link>
        </nav>
      </header>

      <main>
        <section className={s.hero}>
          <div className={s.heroText}>
            <h1 className={s.mega}>
              A resume where every line is <span className={s.marker}>true.</span>
            </h1>
            <p className={s.lead}>
              Upload the resume you have and confirm what&apos;s really yours. We write an ATS-safe resume from those facts
              alone, and show you the proof behind every line.
            </p>
            <div className={s.ctaRow}>
              <Link href="/onboarding" className={`btn btn-primary ${s.bigBtn}`}>
                Build my resume, free
              </Link>
              <Link href="/jobs" className={s.textLink}>
                or check a job you&apos;re eyeing
              </Link>
            </div>
            <p className={s.fine}>Free · every profession · made in India</p>
          </div>
          <HeroDesk />
        </section>

        <WhatWeDo />
        <Problem />
        <Story />
        <Features />
        <WhoFor />
        <Compare />
        <Promises />

        <section className={s.receiptBand} aria-label="What you get">
          <div className={s.receiptText}>
            <h2 className={s.h2}>An honest resume, with a receipt.</h2>
            <p className={s.body}>
              Everything that matters is free, and the things that make other resumes look good on paper and fall apart in
              the interview are itemised at zero.
            </p>
          </div>
          <Receipt />
        </section>

        <Faq />

        <section className={s.close}>
          <Chai className={s.chai} />
          <p className={`margin-note ${s.storyLine}`}>
            It&apos;s Sunday night. You paste the job. Two minutes later you have a resume you can defend, line by line.
            You finish your chai.
          </p>
          <p className={s.point}>That&apos;s the point.</p>
          <Link href="/onboarding" className={`btn btn-primary ${s.bigBtn}`}>
            Build my resume, free
          </Link>
        </section>
      </main>

      <footer className={s.foot}>
        <div className={s.footRow}>
          <nav className={s.footLinks} aria-label="Footer">
            <a href="#what">What it does</a>
            <a href="#how">How it works</a>
            <a href="#features">Features</a>
            <a href="#who">Who it’s for</a>
            <a href="#trust">Privacy</a>
            <a href="#faq">FAQ</a>
            <Link href="/jobs">Check a job</Link>
          </nav>
          <span>Made in India for every profession. No hiring probabilities, no fake scores. Ever.</span>
        </div>
        <p className={s.wordmark} aria-hidden>
          Hunt<span className={s.wordmarkDot}>.</span>
        </p>
      </footer>
    </>
  );
}
