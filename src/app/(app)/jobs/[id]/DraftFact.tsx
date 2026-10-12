"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import a from "@/components/app/app.module.css";
import { api } from "@/lib/api";
import type { Profile } from "@/lib/mock";
import { useAction } from "@/lib/useAction";
import s from "./match.module.css";

/** "Close the gap": the answer becomes an unconfirmed draft fact (POST /v1/facts) under a role you pick.
 * It counts nowhere until you confirm it in the queue. Demo: a local note, nothing sent. */
export default function DraftFact({ question, roles, demo }: { question: string; roles: Profile["roles"]; demo: boolean }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [roleId, setRoleId] = useState(roles[0]?.id ?? "");
  const [saved, setSaved] = useState(false);
  const { busy, error, run } = useAction();

  const save = () =>
    run("save", async () => {
      if (!demo) {
        await api("/facts", { method: "POST", body: { owner_type: "experience", owner_id: roleId, description: text.trim() } });
        router.refresh(); // the nav's "to confirm" count
      }
      setText("");
      setSaved(true);
    });

  return (
    <div className={s.sideCard}>
      <h2 className={s.sideTitle}>Close the gap</h2>
      {question && <p className="margin-note">{question}</p>}
      <label className={s.answer}>
        <span>Your answer becomes a draft fact you confirm</span>
        <textarea
          rows={3}
          maxLength={2000}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setSaved(false);
          }}
          placeholder="e.g. Built an internal dashboard with Apollo Client and GraphQL"
        />
      </label>
      {roles.length > 0 ? (
        <label className={s.answer}>
          <span>Where did you do this?</span>
          <select value={roleId} onChange={(e) => setRoleId(e.target.value)}>
            {roles.map((r) => (
              <option key={r.id} value={r.id}>
                {[r.title, r.org].filter(Boolean).join(", ")}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <p className={s.left}>
          Add a role to <Link href="/profile#exp">your profile</Link> first, so the fact has somewhere to live.
        </p>
      )}
      <button className="btn btn-secondary" type="button" disabled={!text.trim() || !roleId || !!busy} onClick={save}>
        {busy ? "Saving…" : "Save as draft fact"}
      </button>
      {saved && (
        <p role="status" className={s.left}>
          {demo ? (
            "Sample data: nothing was sent. In your account this is saved as a draft for you to confirm."
          ) : (
            <>
              Saved as a draft — <Link href="/onboarding">confirm it in your profile</Link>. Nothing counts until you do.
            </>
          )}
        </p>
      )}
      {error && (
        <p role="alert" className={a.problem}>
          {error}
        </p>
      )}
    </div>
  );
}
