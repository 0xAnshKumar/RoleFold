"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import a from "@/components/app/app.module.css";
import { api } from "@/lib/api";
import { useAction } from "@/lib/useAction";
import s from "./settings.module.css";

type Deleted = { removed_on: string; backups_purged_by: string };
const day = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

/** POST /v1/me/delete behind a typed confirmation; then the two dates the API returns. Demo: disabled. */
export default function DeleteAccount({ demo }: { demo: boolean }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [typed, setTyped] = useState("");
  const [done, setDone] = useState<Deleted | null>(null);
  const { busy, error, setError, run } = useAction();

  if (done)
    return (
      <div role="status" className={s.deleted}>
        <p>
          <b>Your account is deleted and you’re signed out.</b>
        </p>
        <dl className={s.dates}>
          <dt>Removed from our live systems</dt>
          <dd>{day(done.removed_on)}</dd>
          <dt>Purged from backups by</dt>
          <dd>{day(done.backups_purged_by)}</dd>
        </dl>
        <Link href="/" className="btn btn-secondary btn-small">
          Go to the home page
        </Link>
      </div>
    );

  return (
    <>
      <button
        type="button"
        className={s.deleteBtn}
        disabled={demo}
        onClick={() => {
          setTyped("");
          setError(null);
          dialog.current?.showModal();
        }}
      >
        Delete my account…
      </button>
      {demo && <p className={a.note}>This is sample data, so there’s no account to delete.</p>}
      <dialog ref={dialog} className={a.dialog} aria-labelledby="delete-title" onCancel={(e) => busy && e.preventDefault()}>
        <form
          className={a.form}
          onSubmit={(e) => {
            e.preventDefault();
            if (typed !== "DELETE") return;
            run("delete", async () => {
              setDone(await api<Deleted>("/me/delete", { method: "POST" }));
              dialog.current?.close();
            });
          }}
        >
          <h2 id="delete-title" className={a.dialogTitle}>
            Delete your account?
          </h2>
          <p className={a.note}>
            Your profile, every fact, your resumes, uploads and job checks are deleted. You’re signed out straight away and
            this can’t be undone. Export your data first if you want a copy.
          </p>
          <label className={a.field}>
            <span>Type DELETE to confirm</span>
            <input value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" autoCapitalize="characters" spellCheck={false} />
          </label>
          {error && (
            <p role="alert" className={a.problem}>
              {error}
            </p>
          )}
          <div className={a.formActions}>
            <button className={s.deleteBtn} type="submit" disabled={typed !== "DELETE" || !!busy}>
              {busy ? "Deleting…" : "Delete my account"}
            </button>
            <button className="btn btn-secondary" type="button" disabled={!!busy} onClick={() => dialog.current?.close()}>
              Keep my account
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
