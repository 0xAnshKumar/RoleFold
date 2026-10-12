"use client";

import { AnimatePresence, motion, useReducedMotion, type Transition } from "motion/react";
import { useState } from "react";
import { Stamp, StatusIcon } from "@/components/ui";
import s from "./story.module.css";

/*
 * "How it works": five steps, each with its own finished picture.
 * Only a click changes the step; the picture crossfades. No scroll or timeline animation.
 */

const STEPS = [
  { title: "Start with the resume you already have.", body: "We break it into separate facts. Nothing reaches your new resume until you confirm it." },
  { title: "Confirm what’s really yours.", body: "Each fact gets your stamp, plus how much of it was yours: contributed, owned or led." },
  { title: "Every line traces back to proof.", body: "Your resume is written only from confirmed facts, and every line shows which one." },
  { title: "Try to stretch it. It won’t let you.", body: "“Contributed” can’t quietly become “Led”. Numbers can’t grow. You see the reason." },
  { title: "Then any job, explained honestly.", body: "Must-haves first, every requirement stamped, one plain verdict. Never a percentage." },
];

const FACTS = [
  { id: "F-12", level: "Led", text: "Moved checkout from AngularJS to React; bundle 1.8 MB → 640 KB" },
  { id: "F-14", level: "Owned", text: "Built the React component library used by 4 product teams" },
  { id: "F-15", level: "Contributed", text: "Helped cut product-page LCP from 4.2s to 2.1s" },
];

export default function Story() {
  const [step, setStep] = useState(0);

  return (
    <section id="how" className={s.band} aria-labelledby="how-title">
      <div className={s.inner}>
        <div className={s.left}>
          <h2 id="how-title" className={s.title}>
            How it works
          </h2>
          <ol className={s.steps}>
            {STEPS.map((st, i) => {
              const on = i === step;
              return (
                <li key={st.title} className={on ? s.on : undefined}>
                  <button
                    type="button"
                    className={s.step}
                    aria-expanded={on}
                    aria-controls={`how-panel-${i}`}
                    onClick={() => setStep(i)}
                  >
                    <span className={s.num} aria-hidden>
                      {i + 1}
                    </span>
                    <span className={s.stepTitle}>{st.title}</span>
                  </button>
                  {on && (
                    <div className={s.stepBody}>
                      <p>{st.body}</p>
                      {/* phones: the picture opens right under the step */}
                      <div className={s.inlinePanel} id={`how-panel-${i}`}>
                        <Panel step={i} />
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
        </div>

        {/* wider screens: one framed picture beside the list */}
        <div className={s.frame} aria-live="polite">
          <Panel step={step} />
        </div>
      </div>
    </section>
  );
}

function Panel({ step }: { step: number }) {
  const reduce = useReducedMotion();
  return (
    <div className={s.panelBox}>
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={step}
          className={s.panel}
          initial={reduce ? { opacity: 0 } : { opacity: 0, y: 12, filter: "blur(4px)" }}
          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          exit={reduce ? { opacity: 0 } : { opacity: 0, y: -8, filter: "blur(4px)" }}
          transition={{ duration: reduce ? 0.12 : 0.28, ease: [0.16, 1, 0.3, 1] }}
        >
          {[<OldResume key={0} />, <Confirm key={1} />, <Proof key={2} />, <Blocked key={3} />, <JobFit key={4} />][step]}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

/** Stamp that presses in a beat after its panel appears. */
function Press({ delay = 0.25, children, className }: { delay?: number; children: React.ReactNode; className?: string }) {
  const reduce = useReducedMotion();
  const t: Transition = reduce ? { duration: 0 } : { type: "spring", stiffness: 600, damping: 22, delay };
  return (
    <motion.span className={className} initial={reduce ? false : { opacity: 0, scale: 1.8 }} animate={{ opacity: 1, scale: 1 }} transition={t}>
      {children}
    </motion.span>
  );
}

function FactCard({ f, stamped, delay }: { f: (typeof FACTS)[number]; stamped?: boolean; delay?: number }) {
  return (
    <div className={s.fact}>
      <p className={s.meta}>
        {f.id} · {f.level}
      </p>
      <p className={s.factText}>{f.text}</p>
      {stamped && (
        <Press delay={delay} className={`${s.ink} ${s.inkGreen}`}>
          <StatusIcon name="check" /> Confirmed
        </Press>
      )}
    </div>
  );
}

function OldResume() {
  return (
    <div className={s.split}>
      <div className={s.oldDoc}>
        <p className={s.oldName}>ROHAN_IYER_RESUME (final_v3_FINAL).docx</p>
        <p>Frontend dev @ Northwind. React, Angular, perf stuff, etc etc</p>
        <p>Passionate, team player, fast learner</p>
        <p>Pixelcraft 2019–21. Websites for clients</p>
        <p>Skills: JS, HTML, CSS, MS Office</p>
      </div>
      <svg className={s.arrow} viewBox="0 0 60 24" aria-hidden>
        <path d="M2 12 H54 M44 3 L56 12 L44 21" fill="none" stroke="var(--highlighter)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <div className={s.factStack}>
        {FACTS.map((f) => (
          <div key={f.id} className={s.draft}>
            <span className={s.meta}>{f.id} · draft</span>
            <span>{f.text}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Confirm() {
  return (
    <div className={s.column}>
      {FACTS.map((f, i) => (
        <FactCard key={f.id} f={f} stamped delay={0.2 + i * 0.18} />
      ))}
    </div>
  );
}

function Proof() {
  return (
    <div className={s.sheet}>
      <p className={s.sheetName}>Rohan Iyer</p>
      <p className={s.sheetContact}>Bengaluru · rohan.iyer@example.com · github.com/rohan-iyer</p>
      <p className={s.sheetHead}>Experience</p>
      <p className={s.sheetRole}>
        <b>Frontend Engineer</b> · Northwind Commerce <span>Jul 2021 – Present</span>
      </p>
      <ul className={s.sheetList}>
        <li>
          <mark>Led the checkout migration from AngularJS to React, cutting the bundle from 1.8 MB to 640 KB.</mark>
          <Press delay={0.2} className={s.tag}>F-12 · Led</Press>
        </li>
        <li>
          <mark>Built and maintain a React component library used by 4 product teams.</mark>
          <Press delay={0.35} className={s.tag}>F-14 · Owned</Press>
        </li>
        <li>
          <mark>Contributed to cutting product-page LCP from 4.2s to 2.1s.</mark>
          <Press delay={0.5} className={s.tag}>F-15 · Contributed</Press>
        </li>
      </ul>
    </div>
  );
}

function Blocked() {
  return (
    <div className={s.column}>
      <div className={s.edit}>
        <p className={s.meta}>Editing line 3 of your resume</p>
        <p className={s.editLine}>
          <del>Contributed to</del> <ins>Led</ins> cutting product-page LCP from 4.2s to 2.1s.
        </p>
        <Press delay={0.25} className={`${s.ink} ${s.inkRed} ${s.blockedInk}`}>
          <StatusIcon name="alert" /> Blocked
        </Press>
      </div>
      <div className={s.reason}>
        <p className={s.meta}>Why</p>
        <p>
          Your fact <b>F-15</b> says you <b>contributed</b> to this. “Led” claims more than that.
        </p>
        <div className={s.reasonActions}>
          <span className={s.fakeBtn}>Use the original line</span>
          <span className={s.fakeBtnGhost}>Update the fact instead</span>
        </div>
      </div>
    </div>
  );
}

function JobFit() {
  return (
    <div className={s.job}>
      <p className={s.meta}>Pasted by you · Kestrel Pay, Bengaluru</p>
      <p className={s.jobTitle}>Senior Frontend Engineer</p>
      <ul className={s.reqs}>
        <li>
          <span>4+ years, full-time, Bengaluru hybrid</span>
          <Stamp status="match" />
        </li>
        <li>
          <span>React + TypeScript in production</span>
          <Stamp status="supported" />
        </li>
        <li>
          <span>Core Web Vitals ownership</span>
          <Stamp status="partial" />
        </li>
        <li>
          <span>GraphQL</span>
          <Stamp status="no_evidence" />
        </li>
      </ul>
      <p className={s.gap}>
        <b>To close the gap:</b> add evidence of GraphQL, even from a side project.
      </p>
      <Press delay={0.3} className={s.seal}>
        Good fit with gaps
      </Press>
    </div>
  );
}
