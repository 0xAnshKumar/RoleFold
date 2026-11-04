"use client";

import { useCallback, useEffect, useState } from "react";
import a from "@/components/app/app.module.css";
import { api } from "@/lib/api";

/** GET an admin endpoint on mount; call `reload` after an action changes it. */
export function useLoad<T>(path: string) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const reload = useCallback(
    () =>
      api<T>(path).then(
        (d) => (setData(d), setError(null)),
        (e: Error) => setError(e.message),
      ),
    [path],
  );
  useEffect(() => {
    reload();
  }, [reload]);
  return { data, error, reload };
}

/** Loading line, the API's message on failure (403 says "for Hunt admins"), else the content. */
export function Loaded<T>({ state, children }: { state: { data: T | null; error: string | null }; children: (data: T) => React.ReactNode }) {
  if (state.error)
    return (
      <p role="alert" className={a.problem}>
        {state.error}
      </p>
    );
  if (!state.data)
    return (
      <p role="status" className={a.note}>
        Loading…
      </p>
    );
  return children(state.data);
}

export const when = (iso: string) => new Date(iso).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" });

export const REASON_MIN = 10;

/** Every admin action needs a reason: it goes into the audit log next to the admin's name. */
export function ReasonField({ value, onChange, id }: { value: string; onChange: (v: string) => void; id: string }) {
  return (
    <label className={a.field} htmlFor={id}>
      <span>Reason</span>
      <textarea id={id} rows={2} value={value} onChange={(e) => onChange(e.target.value)} minLength={REASON_MIN} maxLength={500} required />
      <span className={a.hint}>Saved in the audit log with your name, for example a ticket number. At least {REASON_MIN} characters.</span>
    </label>
  );
}
