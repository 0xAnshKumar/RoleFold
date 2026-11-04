"use client";

import { useState } from "react";
import a from "@/components/app/app.module.css";
import { StatusIcon } from "@/components/ui";
import { api } from "@/lib/api";
import type { ShareState } from "@/lib/mock";
import { useAction } from "@/lib/useAction";
import s from "./editor.module.css";

const FIELDS = [
  ["location", "Location"],
  ["email", "Email"],
  ["phone", "Phone"],
] as const;
type Field = (typeof FIELDS)[number][0];

/** Create, copy and turn off the resume's read-only link (api/app/routes/share.py). The link is shown once: only its fingerprint is kept. */
export default function Share({ resumeId, initial, contact, demo }: { resumeId: string; initial: ShareState; contact: Record<Field, string>; demo: boolean }) {
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
    <section className={`${a.card} ${s.share}`} aria-labelledby="share">
      <h2 id="share" className={a.h2}>
        Share a read-only link
      </h2>
      {state.link && !making ? (
        <>
          {url ? (
            <>
              <p className={a.note}>Your link is ready. Copy it now: we keep only a fingerprint of it, so it can’t be shown again.</p>
              <div className={s.shareUrl}>
                <label className="sr-only" htmlFor="share-url">
                  Your resume link
                </label>
                <input id="share-url" readOnly value={url} onFocus={(e) => e.target.select()} className="mono" />
                <button type="button" className="btn btn-primary btn-small" onClick={copy}>
                  Copy link
                </button>
              </div>
              <p role="status" className={a.quiet}>
                {copied && (
                  <>
                    <StatusIcon name="check" /> Copied
                  </>
                )}
              </p>
            </>
          ) : (
            <p className={a.note}>
              A link has been on since {state.link.created}. For your privacy it can’t be shown again; make a new one if you need to send it.
            </p>
          )}
          <p>It shows {shows.join(", ")}. Contact details you didn’t tick stay off it.</p>
          <div className={a.formActions}>
            <button type="button" className="btn btn-secondary btn-small" disabled={!!act.busy} onClick={revoke}>
              {act.busy === "revoke" ? "Turning off…" : "Turn off the link"}
            </button>
            <button type="button" className="btn btn-secondary btn-small" disabled={!!act.busy} onClick={() => setMaking(true)}>
              Make a new link
            </button>
          </div>
          {demo && <p className={a.quiet}>Sample data: the link opens the sample resume, and nothing is saved.</p>}
        </>
      ) : (
        <form
          className={a.form}
          onSubmit={(e) => {
            e.preventDefault();
            create();
          }}
        >
          <p className={a.note}>A web page of this resume that anyone with the link can read, without signing in. Search engines are asked not to list it.</p>
          {available.length ? (
            <fieldset className={a.field}>
              <legend>Contact details to show</legend>
              {available.map(([k, label]) => (
                <label key={k} className={s.shareCheck}>
                  <input
                    type="checkbox"
                    checked={chosen.includes(k)}
                    onChange={(e) => setChosen(e.target.checked ? [...chosen, k] : chosen.filter((x) => x !== k))}
                  />
                  {label}: {contact[k]}
                </label>
              ))}
            </fieldset>
          ) : (
            <p className={a.quiet}>Your profile has no contact details, so the page shows your name only.</p>
          )}
          <label className={s.shareCheck}>
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} required />
            {state.consentText}
          </label>
          {making && <p className={a.quiet}>Your current link stops working when the new one is made.</p>}
          <div className={a.formActions}>
            <button type="submit" className="btn btn-primary btn-small" disabled={!consent || !!act.busy}>
              {act.busy === "create" ? "Making the link…" : "Create the link"}
            </button>
            {making && (
              <button type="button" className="btn btn-secondary btn-small" onClick={() => setMaking(false)}>
                Cancel
              </button>
            )}
          </div>
        </form>
      )}
      {act.error && (
        <p role="alert" className={a.problem}>
          {act.error}
        </p>
      )}
    </section>
  );
}
