"use client";

import { motion, useInView, useReducedMotion } from "motion/react";
import { useRef } from "react";
import s from "./landing.module.css";

const ROWS = [
  ["Resume from your confirmed facts", "free"],
  ["ATS-safe PDF + Word", "free"],
  ["Numbers & dates checked by code", "free"],
  ["Job fit, requirement by requirement", "free"],
  ["Hidden keywords", "0"],
  ["Fake “ATS score”", "0"],
];

// Prints once, top to bottom, the first time it scrolls into view.
export default function Receipt() {
  const ref = useRef<HTMLDivElement>(null);
  const seen = useInView(ref, { once: true, amount: 0.4 });
  const reduce = useReducedMotion();
  const show = reduce || seen;

  return (
    <div ref={ref} className={s.receiptSlot}>
      <motion.div
        className={s.receipt}
        initial={false}
        animate={{ clipPath: show ? "inset(0 0 0% 0)" : "inset(0 0 100% 0)", y: show ? 0 : -24 }}
        transition={{ duration: reduce ? 0 : 1.6, ease: [0.45, 0, 0.2, 1] }}
        role="group"
        aria-label="Receipt: what you get"
      >
        <p className={s.receiptHead}>HUNT · RECEIPT</p>
        <p className={s.receiptSub}>08/10/2026 · 21:04 · for: you</p>
        <hr />
        {ROWS.map(([item, v]) => (
          <p key={item} className={s.receiptRow}>
            <span>{item}</span>
            <span className={s.dots} />
            <span>{v}</span>
          </p>
        ))}
        <hr />
        <p className={`${s.receiptRow} ${s.total}`}>
          <span>FAKE CLAIMS</span>
          <span className={s.dots} />
          <span className={s.zero}>0</span>
        </p>
        <p className={s.receiptFoot}>Your data is yours. Export it or delete it any time.</p>
        <svg className={s.barcode} viewBox="0 0 120 20" aria-hidden>
          {Array.from({ length: 34 }, (_, i) => (
            <rect key={i} x={i * 3.5} y="0" width={[1, 2, 1, 1.5][i % 4]} height="20" fill="#111" />
          ))}
        </svg>
      </motion.div>
    </div>
  );
}
