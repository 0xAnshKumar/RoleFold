"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Choice";
import { Dialog } from "@/components/ui/Dialog";
import { Input } from "@/components/ui/Field";
import { api } from "@/lib/api";
import type { ShareState } from "@/lib/mock";
import { useAction } from "@/lib/useAction";
import { Problem } from "../Actions";
import s from "./editor.module.css";

const FIELDS = [
  ["location", "Location"],
  ["email", "Email"],
  ["phone", "Phone"],
] as const;
type Field = (typeof FIELDS)[number][0];

/** Create, copy and turn off the resume's read-only link (api/app/routes/share.py), in a drawer opened from the editor's
 * page bar. The link is shown once: only its fingerprint is kept. */
export default function Share({ resumeId, initial, contact, demo }: { resumeId: string; initial: ShareState; contact: Record<Field, string>; demo: boolean }) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState(initial);
  const [making, setMaking] = useState(false);
  const [chosen, setChosen] = useState<Field[]>([]);
  const [consent, setConsent] = useState(false);
  const [copied, setCopied] = useState(false);
  const act = useAction();
  const url = state.token ? `${window.location.origin}/r/${state.token}` : "";
  const available = FIELDS.filter(([k]) => contact[k]);
  const shows = state.link ? ["your name", ...FIELDS.filter(([k]) => state.link!.contact.includes(k)).map(([, label]) => label.toLowerCase())] : [];

  const create = () =>
    act.run("create", async () => {
      const next = demo
        ? {
            link: { id: "sample", created: new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }), contact: chosen },
            consentText: state.consentText,
            token: "sample",
          }
        : await api<ShareState>(`/resumes/${resumeId}/share`, { method: "POST", body: { consent: true, contact: chosen } });
      setState(next);
      setMaking(false);
      setConsent(false);
      setCopied(false);
    });
  const revoke = () =>
    act.run("revoke", async () => {
      if (!demo) await api(`/resumes/${resumeId}/share`, { method: "DELETE" });
      setState({ link: null, consentText: state.consentText });
    });
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      act.setError("Your browser didn’t allow copying. Select the link and copy it.");
    }
  };

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        {state.link ? "Shared" : "Share"}
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} variant="drawer" title="Share a read-only link">
        <div className={s.share}>
          {state.link && !making ? (
            <>
              {url ? (
                <>
                  <p className={s.body}>Your link is ready. Copy it now: we keep only a fingerprint of it, so it can’t be shown again.</p>
                  <div className={s.shareUrl}>
                    <Input label="Your resume link" hideLabel readOnly value={url} onFocus={(e) => e.target.select()} className={s.urlField} />
                    <Button variant="primary" onClick={copy}>
                      Copy link
                    </Button>
                  </div>
                  <p role="status" className={s.note}>
                    {copied && "Copied"}
                  </p>
                </>
              ) : (
                <p className={s.body}>A link has been on since {state.link.created}. For your privacy it can’t be shown again; make a new one if you need to send it.</p>
              )}
              <p className={s.body}>It shows {shows.join(", ")}. Contact details you didn’t tick stay off it.</p>
              <div className={s.shareActions}>
                <Button variant="danger" loading={act.busy === "revoke"} disabled={!!act.busy} onClick={revoke}>
                  Turn off the link
                </Button>
                <Button disabled={!!act.busy} onClick={() => setMaking(true)}>
                  Make a new link
                </Button>
              </div>
              {demo && <p className={s.note}>Sample data: the link opens the sample resume, and nothing is saved.</p>}
            </>
          ) : (
            <form
              className={s.share}
              onSubmit={(e) => {
                e.preventDefault();
                if (consent) create();
              }}
            >
              <p className={s.body}>A web page of this resume that anyone with the link can read, without signing in. Search engines are asked not to list it.</p>
              {available.length ? (
                <fieldset className={s.fieldset}>
                  <legend>Contact details to show</legend>
                  {available.map(([k, label]) => (
                    <Checkbox
                      key={k}
                      label={`${label}: ${contact[k]}`}
                      checked={chosen.includes(k)}
                      onChange={(e) => setChosen(e.target.checked ? [...chosen, k] : chosen.filter((x) => x !== k))}
                    />
                  ))}
                </fieldset>
              ) : (
                <p className={s.note}>Your profile has no contact details, so the page shows your name only.</p>
              )}
              <Checkbox label={state.consentText} checked={consent} onChange={(e) => setConsent(e.target.checked)} required />
              {making && <p className={s.note}>Your current link stops working when the new one is made.</p>}
              <div className={s.shareActions}>
                {making && (
                  <Button variant="ghost" onClick={() => setMaking(false)}>
                    Cancel
                  </Button>
                )}
                <Button type="submit" variant="primary" loading={act.busy === "create"} disabled={!consent}>
                  Create the link
                </Button>
              </div>
            </form>
          )}
          <Problem error={act.error} />
        </div>
      </Dialog>
    </>
  );
}
