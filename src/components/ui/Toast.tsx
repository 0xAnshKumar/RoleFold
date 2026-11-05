"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import s from "./Toast.module.css";

type ToastInput = { message: React.ReactNode; action?: { label: string; onClick: () => void } };
type Toast = ToastInput & { id: number };

const Ctx = createContext<(t: ToastInput) => void>(() => {});

/** `const toast = useToast(); toast({ message: "Fact confirmed", action: { label: "Undo", onClick } })` */
export const useToast = () => useContext(Ctx);

/**
 * Toasts (DESIGN.md 3.14): one at a time, the rest queue. 6s, or 10s with an action (Undo); paused while hovered or
 * focused. A persistent polite live region announces them. Work-blocking errors are inline, never toasts.
 */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [queue, setQueue] = useState<Toast[]>([]);
  const [paused, setPaused] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const seq = useRef(0);
  const remaining = useRef(0);
  const current = queue[0];

  const push = useCallback((t: ToastInput) => setQueue((q) => [...q, { ...t, id: ++seq.current }]), []);

  useEffect(() => {
    if (current) remaining.current = current.action ? 10_000 : 6_000;
  }, [current]);
  useEffect(() => {
    if (!current || paused || leaving) return;
    const start = Date.now();
    const t = setTimeout(() => setLeaving(true), remaining.current);
    return () => {
      clearTimeout(t);
      remaining.current -= Date.now() - start;
    };
  }, [current, paused, leaving]);
  useEffect(() => {
    if (!leaving) return;
    const t = setTimeout(() => {
      setQueue((q) => q.slice(1));
      setLeaving(false);
      setPaused(false);
    }, 150); // exit transition length
    return () => clearTimeout(t);
  }, [leaving]);

  return (
    <Ctx.Provider value={push}>
      {children}
      <div role="status" aria-live="polite" className={s.region}>
        {current && (
          <div
            key={current.id}
            className={s.toast}
            data-leaving={leaving || undefined}
            onPointerEnter={() => setPaused(true)}
            onPointerLeave={() => setPaused(false)}
            onFocus={() => setPaused(true)}
            onBlur={() => setPaused(false)}
          >
            <span className={s.message}>{current.message}</span>
            {current.action && (
              <button
                type="button"
                className={s.action}
                onClick={() => {
                  current.action!.onClick();
                  setLeaving(true);
                }}
              >
                {current.action.label}
              </button>
            )}
          </div>
        )}
      </div>
    </Ctx.Provider>
  );
}
