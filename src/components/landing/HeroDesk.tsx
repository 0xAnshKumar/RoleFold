"use client";

import { AnimatePresence, motion, useReducedMotion, type Transition } from "motion/react";
import { useRef, useState } from "react";
import { Stamp, StatusIcon } from "@/components/ui";
import s from "./landing.module.css";

const EASE = [0.16, 1, 0.3, 1] as const;
const MAX_STAMPS = 6;

const BULLETS = [
  { text: "Led the checkout migration from AngularJS to React, cutting the bundle from 1.8 MB to 640 KB.", fact: "F-12" },
  { text: "Built and maintain a React component library used by 4 product teams.", fact: "F-14" },
  { text: "Contributed to cutting product-page LCP from 4.2s to 2.1s.", fact: "F-15" },
];
const FACTS = [
  { id: "F-12", level: "Led", text: "Checkout moved to React, bundle 1.8 MB → 640 KB", at: 1.35 },
  { id: "F-14", level: "Owned", text: "Component library used by 4 product teams", at: 1.75 },
];

type Mark = { id: number; x: number; y: number; rot: number };

/**
 * Hero desk. Plays once on load (time-based, never scroll-based):
 * sheet lands → lines write → fact cards arrive and get stamped → their lines light up with
 * the fact they came from → a job ticket slides in and the verdict seal lands.
 * Then click/tap/Enter stamps it. The cursor is never changed.
 */
export default function HeroDesk() {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const [marks, setMarks] = useState<Mark[]>([]);

  const t = (delay: number, extra?: Transition): Transition =>
    reduce ? { duration: 0 } : { duration: 0.6, ease: EASE, delay, ...extra };
  const spring = (delay: number): Transition =>
    reduce ? { duration: 0 } : { type: "spring", stiffness: 520, damping: 24, mass: 0.8, delay };

  function stampAt(px: number, py: number) {
    setMarks((m) => [...m.slice(-(MAX_STAMPS - 1)), { id: Date.now() + Math.random(), x: px, y: py, rot: Math.round(Math.random() * 16 - 8) }]);
  }

  function pct(e: React.PointerEvent) {
    const r = ref.current!.getBoundingClientRect();
    return [((e.clientX - r.left) / r.width) * 100, ((e.clientY - r.top) / r.height) * 100] as const;
  }

  return (
    <div className={s.deskWrap}>
      <div
        ref={ref}
        className={s.desk}
        role="button"
        tabIndex={0}
        aria-label="Example resume. Press to stamp it verified."
        onPointerDown={(e) => {
          const [px, py] = pct(e);
          stampAt(px, py);
        }}
        onKeyDown={(e) => {
          if (e.key !== "Enter" && e.key !== " ") return;
          e.preventDefault();
          stampAt(45 + Math.random() * 40, 20 + Math.random() * 50);
        }}
      >
        <div className={s.deskInner} aria-hidden>
          {/* the resume */}
          <motion.div
            className={s.heroSheet}
            initial={reduce ? false : { opacity: 0, y: 60, rotate: 7 }}
            animate={{ opacity: 1, y: 0, rotate: 2 }}
            transition={spring(0.05)}
          >
            <p className={s.hsName}>Rohan Iyer</p>
            <p className={s.hsContact}>Bengaluru · rohan.iyer@example.com · github.com/rohan-iyer</p>
            <p className={s.hsHead}>Experience</p>
            <p className={s.hsRole}>
              <b>Frontend Engineer</b> · Northwind Commerce <span>Jul 2021 – Present</span>
            </p>
            <ul className={s.hsList}>
              {BULLETS.map((b, i) => (
                <motion.li
                  key={b.fact}
                  initial={reduce ? false : { clipPath: "inset(0 100% 0 0)" }}
                  animate={{ clipPath: "inset(0 0% 0 0)" }}
                  transition={t(0.45 + i * 0.22, { duration: 0.5 })}
                >
                  <motion.span
                    className={s.hsMark}
                    initial={reduce ? false : { backgroundSize: "0% 100%" }}
                    animate={{ backgroundSize: i < 2 ? "100% 100%" : "0% 100%" }}
                    transition={t(1.5 + i * 0.4, { duration: 0.45 })}
                  >
                    {b.text}
                  </motion.span>
                  {i < 2 && (
                    <motion.span
                      className={s.hsTag}
                      initial={reduce ? false : { opacity: 0, scale: 0.6 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={spring(1.8 + i * 0.4)}
                    >
                      {b.fact}
                    </motion.span>
                  )}
                </motion.li>
              ))}
            </ul>
            <p className={s.hsHead}>Skills</p>
            <p className={s.hsRole}>React · TypeScript · Next.js · Jest · Playwright · Web performance</p>
            <span className={s.hsLine} />
            <span className={`${s.hsLine} ${s.hsShort}`} />
          </motion.div>

          {/* confirmed facts, tucked against the page */}
          {FACTS.map((f, i) => (
            <motion.div
              key={f.id}
              className={`${s.heroFact} ${i ? s.heroFact1 : s.heroFact0}`}
              initial={reduce ? false : { opacity: 0, x: -50, rotate: i ? 12 : -14 }}
              animate={{ opacity: 1, x: 0, rotate: i ? 3 : -4 }}
              transition={spring(0.95 + i * 0.25)}
            >
              <p className={s.hfMeta}>
                {f.id} · {f.level}
              </p>
              <p className={s.hfText}>
                <span className={s.hfMark}>{f.text}</span>
              </p>
              <motion.span
                className={`${s.inkStamp} ${s.inkGreen} ${s.hfStamp}`}
                initial={reduce ? false : { opacity: 0, scale: 2 }}
                animate={{ opacity: 0.95, scale: 1 }}
                transition={spring(f.at)}
              >
                <StatusIcon name="check" /> Confirmed
              </motion.span>
            </motion.div>
          ))}

          {/* the job it was matched against */}
          <motion.div
            className={s.heroJob}
            initial={reduce ? false : { opacity: 0, y: 40, rotate: -6 }}
            animate={{ opacity: 1, y: 0, rotate: -2 }}
            transition={spring(2.45)}
          >
            <p className={s.hfMeta}>Pasted job · Kestrel Pay</p>
            <p className={s.hjTitle}>Senior Frontend Engineer</p>
            <div className={s.hjRow}>
              <span>React + TypeScript</span>
              <Stamp status="supported" />
            </div>
            <div className={s.hjRow}>
              <span>GraphQL</span>
              <Stamp status="no_evidence" />
            </div>
          </motion.div>
          <motion.div
            className={s.heroSeal}
            initial={reduce ? false : { opacity: 0, scale: 2.4, rotate: -24 }}
            animate={{ opacity: 1, scale: 1, rotate: -10 }}
            transition={spring(2.95)}
          >
            Good fit with gaps
          </motion.div>
        </div>

        <AnimatePresence>
          {marks.map((m) => (
            <motion.span
              key={m.id}
              className={s.impression}
              style={{ left: `${m.x}%`, top: `${m.y}%`, rotate: m.rot }}
              initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 1.7 }}
              animate={{ opacity: 0.92, scale: 1 }}
              exit={{ opacity: 0, transition: { duration: 0.3 } }}
              transition={{ type: "spring", stiffness: 700, damping: 26, mass: 0.7 }}
            >
              <StatusIcon name="check" /> Verified
            </motion.span>
          ))}
        </AnimatePresence>

      </div>
    </div>
  );
}
