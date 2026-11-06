"use client";

import { useState } from "react";
import a from "@/components/app/app.module.css";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { Input } from "@/components/ui/Field";
import { api } from "@/lib/api";
import { useAction } from "@/lib/useAction";
import s from "./settings.module.css";

type Deleted = { removed_on: string; backups_purged_by: string };
const day = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

/** POST /v1/me/delete behind a typed confirmation; then the two dates the API returns. Demo: disabled. */
export default function DeleteAccount({ demo }: { demo: boolean }) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [done, setDone] = useState<Deleted | null>(null);
  const { busy, error, setError, run } = useAction();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (typed !== "DELETE") return;
    run("delete", async () => {
      const r = await api<Deleted>("/me/delete", { method: "POST" });
      // Clear the session cookie so the deleted account isn't left signed in (the 303 to the provider isn't followed).
      await fetch("/auth/logout", { method: "POST", redirect: "manual" }).catch(() => {});
      setDone(r);
      setOpen(false);
    });
  };

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
        <ButtonLink href="/" size="sm">
          Go to the home page
        </ButtonLink>
      </div>
    );

  return (
    <>
      <Button
        variant="danger"
        size="sm"
        disabled={demo}
        aria-describedby={demo ? "delete-demo" : undefined}
        onClick={() => {
          setTyped("");
          setError(null);
          setOpen(true);
        }}
      >
        Delete…
      </Button>
      {demo && (
        <span id="delete-demo" className="sr-only">
          This is sample data, so there’s no account to delete.
        </span>
      )}
      <Dialog
        open={open}
        onClose={() => !busy && setOpen(false)}
        title="Delete your account?"
        description="Your profile, every fact, your resumes, uploads and job checks are deleted. You’re signed out straight away and this can’t be undone. Download your data first if you want a copy."
      >
        <form className={s.deleteForm} onSubmit={submit}>
          <Input label="Type DELETE to confirm" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" autoCapitalize="characters" spellCheck={false} />
          {error && (
            <p role="alert" className={a.problem}>
              {error}
            </p>
          )}
          <div className={s.deleteActions}>
            <Button disabled={!!busy} onClick={() => setOpen(false)}>
              Keep my account
            </Button>
            <Button type="submit" variant="dangerFilled" disabled={typed !== "DELETE"} loading={busy === "delete"}>
              Delete my account
            </Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
