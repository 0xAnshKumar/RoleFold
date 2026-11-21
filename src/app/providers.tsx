"use client";

import { LazyMotion, MotionConfig } from "motion/react";

// Features load after hydration, so routes that never animate with Motion don't pay for them up front.
const features = () => import("./motion-features").then((r) => r.default);

/** MotionConfig honours prefers-reduced-motion; LazyMotion strict makes an accidental `motion.div` throw (use `m`). */
export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <MotionConfig reducedMotion="user">
      <LazyMotion features={features} strict>
        {children}
      </LazyMotion>
    </MotionConfig>
  );
}
