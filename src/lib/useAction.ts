"use client";

import { useRef, useState } from "react";

/** One action at a time per component: `busy` names what's in flight, the ref blocks a double click before React re-renders. */
export function useAction() {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const lock = useRef(false);

  async function run(key: string, fn: () => Promise<void>): Promise<boolean> {
    if (lock.current) return false;
    lock.current = true;
    setBusy(key);
    setError(null);
    try {
      await fn();
      return true;
    } catch (err) {
      setError((err as Error).message);
      return false;
    } finally {
      lock.current = false;
      setBusy(null);
    }
  }

  return { busy, error, setError, run };
}
