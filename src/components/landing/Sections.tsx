import Link from "next/link";
import { ButtonLink } from "@/components/ui/Button";
// Button.tsx is a client module, so server markup that only needs the look takes the classes directly.
import b from "@/components/ui/Button.module.css";
import { Card, CardSet } from "@/components/ui/Card";
import { Disclosure } from "@/components/ui/Disclosure";
import { Icon, type IconName } from "@/components/ui/Icon";
import { StatusIcon } from "@/components/ui/index";
import { SignatureLine } from "@/components/ui/Proof";
import { facts, resumes } from "@/lib/mock";
import s from "./landing.module.css";

/** Owner sets this once the paid plan is priced (DESIGN.md 4.1); until then the card says it's coming. */
const PAID_PRICE: string | null = null;

const tagDate = (d: string) => d.split(" ").slice(0, 2).join(" ");

/* ---------- Two things RoleFold does ---------- */
export function Modules() {
  const role = resumes[0].sections[0];
  return (
    <section id="modules" className={s.block} aria-labelledby="modules-title">
      <h2 id="modules-title" className={`t-d1 ${s.h2}`}>
        Two things RoleFold does, and does honestly.
      </h2>
      <div className={s.modules}>
        <Card className={s.module}>
          <div className={s.moduleText}>
            <h3 className="t-d2">Build a resume you can prove</h3>
            <p className={s.body}>
              Upload the resume you have, or start from scratch. Confirm each fact RoleFold reads, then edit and download your
              resume as PDF or Word. Every line keeps a tag back to the fact it came from.
            </p>
            <Link href="/onboarding" className={s.textLink}>
              Build my resume <Icon name="arrowRight" size={18} />
            </Link>
          </div>
          <div className={s.bleed} aria-hidden>
            <div className={s.bleedSheet}>
              <p className={s.sheetRole}>
                {role.title} · {role.org}
              </p>
              {role.lines.map((l) => (
                <p key={l.id} className={s.editRow}>
                  <span>{l.text}</span>
                  <span className="tag">{l.factId}</span>
                </p>
              ))}
              <SignatureLine date="3 Oct 2026" />
            </div>
          </div>
        </Card>
        <Card className={s.module}>
          <div className={s.moduleText}>
            <h3 className="t-d2">Find jobs that fit you</h3>
            <p className={s.body}>
              See open roles ranked by the skills you confirmed. Check any job to see the posting’s own words, requirement
              by requirement, and a verdict in words. Then apply on the company’s own site.
            </p>
            <Link href="/jobs" className={s.textLink}>
              See jobs for my resume <Icon name="arrowRight" size={18} />
            </Link>
          </div>
          <div className={s.bleed} aria-hidden>
            <JobCard
              title="Senior Frontend Engineer"
              place="Tidepool Finance · Bengaluru · Hybrid"
              meta="3-6 yrs · Salary not shown · 4 days ago · via Greenhouse"
              fit="check"
              reason="Uses React, TypeScript and Jest, which you confirmed."
            />
            <JobCard
              title="UI Engineer, Design Systems"
              place="Saffron Retail · Bengaluru · On-site"
              meta="2-5 yrs · Salary not shown · 1 week ago · via company site"
              fit="half"
              reason="Uses React, which you confirmed. Storybook isn’t in your facts yet."
            />
          </div>
        </Card>
      </div>
    </section>
  );
}

function JobCard({ title, place, meta, fit, reason }: { title: string; place: string; meta: string; fit: "check" | "half"; reason: string }) {
  return (
    <div className={s.job}>
      <p className={s.jobTitle}>{title}</p>
      <p className={s.jobPlace}>{place}</p>
      <p className={s.jobMeta}>{meta}</p>
      <p className={s.jobReason} data-fit={fit}>
        <StatusIcon name={fit} />
        {reason}
      </p>
      <span className={`${b.btn} ${b.secondary} ${b.sm} ${s.fakeBtn}`}>Check this job</span>
    </div>
  );
}

/* ---------- The proof standard ---------- */
const PROMISES: [IconName, string, string][] = [
  ["resume", "Every line traces to a fact you confirmed", "Code checks every number and each claim of responsibility against your facts. A line that claims more is rewritten once, then held back."],
  ["check", "Verdicts in words, never scores", "No match percentages, rings or stars. A job check says Proven, Partly or Missing for each requirement, and quotes the posting."],
  ["external", "Real jobs, on the company’s own site", "RoleFold never applies for you and never guesses your chances. You decide, and you apply where the job is posted."],
  ["lock", "Your details stay yours", "Your name and contact details are removed before any AI model sees your text. Export or delete everything whenever you like."],
];

export function ProofStandard() {
  return (
    <section id="promise" className={s.block} aria-labelledby="promise-title">
      <h2 id="promise-title" className={`t-d1 ${s.h2}`}>
        The proof standard.
      </h2>
      <ul className={s.ledger}>
        {PROMISES.map(([icon, title, body]) => (
          <li key={title} className={s.promise}>
            <Icon name={icon} size={24} />
            <h3 className="t-h">{title}</h3>
            <p className={s.small}>{body}</p>
          </li>
        ))}
      </ul>
      <p className={`microtext ${s.micro}`} aria-hidden>
        {"EVERY LINE TRACES TO A FACT YOU CONFIRMED · ".repeat(12)}
      </p>
    </section>
  );
}

/* ---------- Who it's for ---------- */
const PEOPLE = [
  {
    who: "Students and freshers",
    body: "Projects, internships and coursework count. RoleFold turns them into lines you can explain in an interview.",
    id: "F-03",
    fact: "Built a library seat-booking app in Flutter with three classmates for our final-year project",
    date: "2 Nov",
  },
  {
    who: "Early in your career",
    body: "Get credit for what you did, in words that match how much of it was yours: contributed, owned, led or managed.",
    id: facts[2].id,
    fact: facts[2].text,
    date: tagDate(facts[2].confirmedOn),
  },
  {
    who: "Switching or returning",
    body: "A career break is part of your story, not something to hide. Say it plainly and lead with the skills that carry over.",
    id: "F-40",
    fact: "Career break, Mar 2022 – Jan 2024: full-time care for a parent",
    date: "28 Oct",
  },
];

export function WhoFor() {
  return (
    <section id="who" className={s.block} aria-labelledby="who-title">
      <h2 id="who-title" className={`t-d1 ${s.h2}`}>
        Wherever you are in your career.
      </h2>
      <CardSet as="ul" className={s.people}>
        {PEOPLE.map((p) => (
          <Card as="li" key={p.who} className={s.person}>
            <h3 className="t-d3">{p.who}</h3>
            <p className={s.small}>{p.body}</p>
            <div className={s.personFact}>
              <span className="tag">
                {p.id} · {p.date}
              </span>
              <p>{p.fact}</p>
              <span className="sr-only">(example fact)</span>
            </div>
          </Card>
        ))}
      </CardSet>
    </section>
  );
}

/* ---------- Pricing promise ---------- */
const FREE = ["Upload a resume, or start from scratch", "Confirm your facts", "Your master resume, with edits", "PDF and Word downloads", "Jobs feed and 30 job checks a month"];

export function Pricing() {
  return (
    <section id="pricing" className={s.block} aria-labelledby="pricing-title">
      <h2 id="pricing-title" className={`t-d1 ${s.h2}`}>
        Free export. A fair price for the rest.
      </h2>
      <div className={s.plans}>
        <Card className={`${s.plan} grain`}>
          <h3 className="t-d2">Free, always</h3>
          <ul className={s.planList}>
            {FREE.map((f) => (
              <li key={f}>
                <Icon name="check" size={18} />
                {f}
              </li>
            ))}
          </ul>
          <ButtonLink href="/onboarding" variant="primary">
            Build my resume
          </ButtonLink>
        </Card>
        <Card className={s.plan}>
          <h3 className="t-d2">More job checks</h3>
          <p className={s.price}>
            {PAID_PRICE ? (
              <>
                {PAID_PRICE}
                <span className={s.small}> / month</span>
              </>
            ) : (
              "Coming later"
            )}
          </p>
          <p className={s.body}>
            {PAID_PRICE ? "Cancel any time. The price is shown before you pay." : "The price will be on this page before you can pay anything."}
          </p>
          <p className={s.small}>Downloads stay free. A resume you’ve made never moves behind a paywall.</p>
        </Card>
      </div>
    </section>
  );
}

/* ---------- FAQ ---------- */
const FAQ: [string, string][] = [
  [
    "Is it really free?",
    "Yes. Building, editing and downloading your resume as PDF or Word is free, and stays free. The free plan also includes 30 job checks a month, and you always see your count before you reach it.",
  ],
  [
    "Can RoleFold add things I didn’t do?",
    "No. Every line is written from facts you confirmed. Code checks every number and how much responsibility a line claims; a second model checks the meaning. A line that claims more than its facts is rewritten once, then held back, and you see why.",
  ],
  [
    "Will my resume pass every ATS?",
    "Nobody can honestly promise that, so we don’t. RoleFold’s six templates are single column, use real text rather than images, and are checked before you download.",
  ],
  [
    "Will RoleFold tailor my resume to each job?",
    "Not yet. Rewriting a resume for one posting is where an overclaim is most likely to slip in, so it stays off until every changed line can be checked well enough. Today you get one honest master resume that you can edit.",
  ],
  [
    "Where do the jobs come from?",
    "From companies’ own public job boards, and from any job description you paste in. RoleFold never applies for you; you apply on the company’s site.",
  ],
  [
    "What happens to my data?",
    "We don’t sell it or show it to employers. Your name and contact details are removed before any AI model sees your text. You can export everything or delete your account at any time.",
  ],
];

export function Faq() {
  return (
    <section id="faq" className={`${s.block} ${s.faq}`} aria-labelledby="faq-title">
      <h2 id="faq-title" className={`t-d1 ${s.h2}`}>
        Questions
      </h2>
      <div className={s.faqList}>
        {FAQ.map(([q, a]) => (
          <Disclosure key={q} summary={<span className="t-title">{q}</span>} className={s.faqItem}>
            <p className={s.body}>{a}</p>
          </Disclosure>
        ))}
      </div>
    </section>
  );
}

/* ---------- Closing band + footer ---------- */
export function Footer() {
  return (
    <footer className={`${s.footer} grain`}>
      <span className={`guilloche-wave ${s.wave}`} aria-hidden />
      <div className={s.closing}>
        <p className={`t-d1 ${s.closingLine}`}>
          Your next resume,{" "}
          <span className="proof">
            <span className="italic-accent">signed</span>
          </span>{" "}
          by you.
        </p>
        <ButtonLink href="/onboarding" variant="primary" size="lg" className={s.onPanel}>
          Build my resume
        </ButtonLink>
      </div>
      <div className={s.footRow}>
        <Link href="/" className={s.footMark}>
          RoleFold
        </Link>
        <nav aria-label="Footer" className={s.footLinks}>
          <a href="#modules">What it does</a>
          <a href="#how">How it works</a>
          <a href="#pricing">Pricing</a>
          <a href="#faq">FAQ</a>
          <Link href="/signin">Sign in</Link>
        </nav>
      </div>
      <p className={s.footNote}>
        Made in India. No hiring probabilities, no fake scores.
      </p>
    </footer>
  );
}
