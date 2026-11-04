"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import a from "@/components/app/app.module.css";
import { api } from "@/lib/api";
import type { Profile } from "@/lib/mock";
import { useAction } from "@/lib/useAction";
import s from "./match.module.css";

const NEW_PROJECT = "new-project";

/** "Close the gap": the answer becomes an unconfirmed draft fact (POST /v1/facts) under a role or project you pick,
 * or a new project (POST /v1/projects first). It counts nowhere until you confirm it in the queue.
 * Demo: a local note, nothing sent. */
export default function DraftFact({ question, roles, projects, demo }: { question: string; roles: Profile["roles"]; projects: Profile["projects"]; demo: boolean }) {
  const router = useRouter();
  const [text, setText] = useState("");
  // "experience:<id>" | "project:<id>" | NEW_PROJECT
  const [owner, setOwner] = useState(roles[0] ? `experience:${roles[0].id}` : projects[0] ? `project:${projects[0].id}` : NEW_PROJECT);
  const [projectName, setProjectName] = useState("");
  const [saved, setSaved] = useState(false);
  const { busy, error, run } = useAction();
  const ready = !!text.trim() && (owner !== NEW_PROJECT || !!projectName.trim());

  const save = () =>
    run("save", async () => {
      if (!demo) {
        let [ownerType, ownerId] = owner.split(":");
        if (owner === NEW_PROJECT) {
          ownerType = "project";
          ownerId = (await api<{ id: string }>("/projects", { method: "POST", body: { name: projectName.trim() } })).id;
          setOwner(`project:${ownerId}`); // a retry files under it instead of making another
        }
        await api("/facts", { method: "POST", body: { owner_type: ownerType, owner_id: ownerId, description: text.trim() } });
        router.refresh(); // the nav's "to confirm" count, and the new project in this list
      }
      setText("");
      setProjectName("");
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
      <label className={s.answer}>
        <span>Where did you do this?</span>
        <select value={owner} onChange={(e) => setOwner(e.target.value)}>
          {roles.length > 0 && (
            <optgroup label="Roles">
              {roles.map((r) => (
                <option key={r.id} value={`experience:${r.id}`}>
                  {[r.title, r.org].filter(Boolean).join(", ")}
                </option>
              ))}
            </optgroup>
          )}
          <optgroup label="Projects">
            {projects.map((p) => (
              <option key={p.id} value={`project:${p.id}`}>
                {p.name}
              </option>
            ))}
            <option value={NEW_PROJECT}>A new project…</option>
          </optgroup>
        </select>
      </label>
      {owner === NEW_PROJECT && (
        <label className={s.answer}>
          <span>Project name</span>
          <input value={projectName} maxLength={200} onChange={(e) => setProjectName(e.target.value)} placeholder="e.g. Ledgerly, a side project" />
        </label>
      )}
      <button className="btn btn-secondary" type="button" disabled={!ready || !!busy} onClick={save}>
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
