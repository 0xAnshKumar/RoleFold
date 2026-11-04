"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import a from "@/components/app/app.module.css";
import { api, exportResume, waitFor, type Operation } from "@/lib/api";
import { TEMPLATES } from "@/lib/templates";
import { useAction } from "@/lib/useAction";
import s from "./resumes.module.css";

/** POST /v1/resumes {template, target} -> wait -> open it. Demo: opens the sample resume (as tailoring does). */
export function NewResume({ demo }: { demo: boolean }) {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const [target, setTarget] = useState("");
  const [template, setTemplate] = useState("classic");
  const { busy, error, setError, run } = useAction();
  const chosen = TEMPLATES.find((t) => t.id === template)!;

  return (
    <>
      <button
        type="button"
        className="btn btn-primary"
        onClick={() => {
          setError(null);
          dialog.current?.showModal();
        }}
      >
        New master resume
      </button>
      <dialog ref={dialog} className={a.dialog} aria-labelledby="new-resume-title" onCancel={(e) => busy && e.preventDefault()}>
        <form
          className={a.form}
          onSubmit={(e) => {
            e.preventDefault();
            run("create", async () => {
              if (demo) return router.push("/resumes/frontend-engineer");
              const r = await api<{ resume_id: string; operation: Operation }>("/resumes", { method: "POST", body: { template, target: target.trim() } });
              const op = await waitFor(r.operation);
              router.push(`/resumes/${(op.result?.resume_id as string | undefined) ?? r.resume_id}`);
            });
          }}
        >
          <h2 id="new-resume-title" className={a.dialogTitle}>
            New master resume
          </h2>
          <p className={a.note}>Built from your confirmed facts for one direction you’re heading. Free and unlimited.</p>
          <label className={a.field}>
            <span>Target role</span>
            <input required maxLength={200} value={target} onChange={(e) => setTarget(e.target.value)} placeholder="e.g. Senior Frontend Engineer" autoFocus />
          </label>
          <label className={a.field}>
            <span>Template</span>
            <select value={template} onChange={(e) => setTemplate(e.target.value)}>
              {TEMPLATES.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
            <span className={a.hint}>
              Best for: {chosen.bestFor.toLowerCase()}. You can switch templates any time in the editor.
            </span>
          </label>
          {error && (
            <p role="alert" className={a.problem}>
              {error}
            </p>
          )}
          <p className={a.quiet} role="status">
            {busy ? "Choosing and wording your confirmed facts, then checking every line. This can take a minute." : demo ? "With sample data, this opens the example resume." : ""}
          </p>
          <div className={a.formActions}>
            <button className="btn btn-primary" type="submit" disabled={!!busy || !target.trim()}>
              {busy ? "Building your resume…" : "Build this resume"}
            </button>
            <button className="btn btn-secondary" type="button" disabled={!!busy} onClick={() => dialog.current?.close()}>
              Cancel
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}

/** Export in the resume's own template, then download. Never blocked by plan limits; not available for sample data. */
export function Downloads({ resumeId, template, demo }: { resumeId: string; template: string; demo: boolean }) {
  const templateId = TEMPLATES.find((t) => t.name === template || t.id === template)?.id ?? "classic";
  const { busy, error, run } = useAction();
  return (
    <>
      {(["pdf", "docx"] as const).map((fmt) => (
        <button
          key={fmt}
          type="button"
          className="btn btn-secondary btn-small"
          disabled={demo || !!busy}
          title={demo ? "Sample data can’t be downloaded" : undefined}
          onClick={() => run(fmt, () => exportResume(resumeId, fmt, templateId))}
        >
          {busy === fmt ? "Preparing…" : fmt === "pdf" ? "Download PDF" : "Download Word"}
        </button>
      ))}
      {error && (
        <p role="alert" className={`${a.problem} ${s.full}`}>
          {error}
        </p>
      )}
    </>
  );
}

/** "Update with new facts": POST /v1/resumes/{id}/regenerate rewrites the master from your current confirmed facts as
 * its next version (same resume, same template), then the list re-reads. Free. Demo: a note, nothing sent. */
export function UpdateResume({ resumeId, demo }: { resumeId: string; demo: boolean }) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const { busy, error, run } = useAction();
  return (
    <>
      <button
        type="button"
        className="btn btn-primary btn-small"
        disabled={!!busy}
        onClick={() =>
          run("update", async () => {
            if (demo) return setNote("Sample data: nothing was rebuilt. In your account this rewrites the resume from your current facts.");
            const r = await api<{ operation: Operation }>(`/resumes/${resumeId}/regenerate`, { method: "POST" });
            await waitFor(r.operation);
            router.refresh();
          })
        }
      >
        {busy ? "Updating…" : "Update with new facts"}
      </button>
      {(busy || note) && (
        <p className={`${a.quiet} ${s.full}`} role="status">
          {busy ? "Rewording your current confirmed facts and checking every line. This can take a minute." : note}
        </p>
      )}
      {error && (
        <p role="alert" className={`${a.problem} ${s.full}`}>
          {error}
        </p>
      )}
    </>
  );
}
