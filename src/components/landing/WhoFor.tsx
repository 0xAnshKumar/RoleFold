"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useState } from "react";
import s from "./sections.module.css";

const PEOPLE = [
  {
    tab: "Fresher",
    title: "Thin experience, strong first resume.",
    points: [
      "Projects, internships and coursework become real evidence, with links as proof.",
      "Education goes first when that’s your strongest section.",
      "Skills you’ve used in projects count, and you see which ones a job needs next.",
    ],
    example: "Built a React attendance app used by 120 students · project · github link",
  },
  {
    tab: "1–5 years",
    title: "Stop rewriting your resume for every job.",
    points: [
      "One master resume, tailored to each job in a click.",
      "Honest verdicts tell you which jobs are realistic and which are a stretch.",
      "Know which gaps are just presentation and which need real work.",
    ],
    example: "Senior Frontend Engineer, Kestrel Pay · Good fit with gaps · 1 gap: GraphQL",
  },
  {
    tab: "5+ years",
    title: "Make your impact as clear as your experience.",
    points: [
      "Achievement-first lines: what you did, how much was yours, what changed.",
      "Two pages by default once you have the history to fill them.",
      "Seniority and goals filter out roles that would be a step back.",
    ],
    example: "Led checkout migration to React; bundle 1.8 MB → 640 KB · Led",
  },
  {
    tab: "Switching fields",
    title: "Show the skills that carry over.",
    points: [
      "A separate master resume for each direction you’re exploring.",
      "Related skills are labelled honestly, not passed off as exact matches.",
      "See which learning gap shows up in most of your best-fit jobs.",
    ],
    example: "7 of your 10 best-fit developer jobs ask for TypeScript",
  },
  {
    tab: "Coming back",
    title: "Return after a break, with your story straight.",
    points: [
      "Explain a career gap your way, and choose whether it shows on the resume.",
      "Rebuild an old resume into confirmed facts in one sitting.",
      "Your reason for a gap is never used to judge job fit.",
    ],
    example: "Career break · Jan 2023 – Mar 2024 · caregiving · shown on resume: your choice",
  },
];

export default function WhoFor() {
  const [i, setI] = useState(0);
  const reduce = useReducedMotion();
  const p = PEOPLE[i];

  return (
    <section id="who" className={s.who} aria-labelledby="who-title">
      <div className={s.wrap}>
        <header className={s.head}>
          <h2 id="who-title" className={s.h2}>
            Built for where you are.
          </h2>
          <p className={s.lede}>Every profession, every stage. Pick yours.</p>
        </header>

        <div className={s.tabs} role="tablist" aria-label="Career stage">
          {PEOPLE.map((x, n) => (
            <button
              key={x.tab}
              type="button"
              role="tab"
              id={`who-tab-${n}`}
              aria-selected={n === i}
              aria-controls="who-panel"
              tabIndex={n === i ? 0 : -1}
              className={s.tab}
              onClick={() => setI(n)}
              onKeyDown={(e) => {
                if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
                const next = (n + (e.key === "ArrowRight" ? 1 : PEOPLE.length - 1)) % PEOPLE.length;
                setI(next);
                document.getElementById(`who-tab-${next}`)?.focus();
              }}
            >
              {x.tab}
            </button>
          ))}
        </div>

        <div id="who-panel" role="tabpanel" aria-labelledby={`who-tab-${i}`} className={s.whoPanel}>
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={i}
              className={s.whoInner}
              initial={reduce ? { opacity: 0 } : { opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduce ? { opacity: 0 } : { opacity: 0, y: -6 }}
              transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            >
              <div>
                <h3 className={s.whoTitle}>{p.title}</h3>
                <ul className={s.ticks}>
                  {p.points.map((x) => (
                    <li key={x}>{x}</li>
                  ))}
                </ul>
              </div>
              <div className={s.whoExample}>
                <p className={s.mono}>What it looks like</p>
                <p>{p.example}</p>
              </div>
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </section>
  );
}
