"use client";

import Link from "next/link";
import { useState } from "react";
import a from "@/components/app/app.module.css";
import { api } from "@/lib/api";
import { useAction } from "@/lib/useAction";

export default function Confirm({ token }: { token: string }) {
  const [done, setDone] = useState(false);
  const { busy, error, run } = useAction();
  const stop = () =>
    run("stop", async () => {
      await api(`/alerts/unsubscribe?token=${encodeURIComponent(token)}`, { method: "POST" });
      setDone(true);
    });
  if (done)
    return (
      <p role="status">
        Done. No more alert emails. You can turn them back on from your <Link href="/jobs?settings=1">job feed settings</Link>.
      </p>
    );
  return (
    <>
      <button type="button" className="btn btn-primary" onClick={stop} disabled={!!busy}>
        {busy ? "Stopping…" : "Stop alert emails"}
      </button>
      {error && (
        <p role="alert" className={a.problem}>
          {error}
        </p>
      )}
    </>
  );
}
