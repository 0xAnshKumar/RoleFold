"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { Input, Select } from "@/components/ui/Field";
import { Icon } from "@/components/ui/Icon";
import { api, exportResume, waitFor, type Operation } from "@/lib/api";
import { TEMPLATES } from "@/lib/templates";
import { useAction } from "@/lib/useAction";
import s from "./resumes.module.css";

export function Problem({ error, className }: { error: string | null; className?: string }) {
  return (
    error && (
      <p role="alert" className={`${s.problem} ${className ?? ""}`}>
        <Icon name="alert" size={18} />
        {error}
      </p>
    )
  );
}

/** POST /v1/resumes {template, target} -> wait -> open it. Demo: opens the sample resume (as tailoring does). */
export function NewResume({ demo }: { demo: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState("");
  const [template, setTemplate] = useState("classic");
  const { busy, error, setError, run } = useAction();
  const chosen = TEMPLATES.find((t) => t.id === template)!;

  return (
    <>
      <Button
        variant="primary"
        icon={<Icon name="plus" size={18} />}
        onClick={() => {
          setError(null);
          setOpen(true);
        }}
      >
        New master resume
      </Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="New master resume"
        description="Built from your confirmed facts for one direction you’re heading. Free and unlimited."
        footer={
          <>
            <Button variant="ghost" disabled={!!busy} onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" form="new-resume" loading={!!busy} disabled={!target.trim()}>
              {busy ? "Building your resume…" : "Build this resume"}
            </Button>
          </>
        }
      >
        <form
          id="new-resume"
          className={s.dialogForm}
          onSubmit={(e) => {
            e.preventDefault();
            if (!target.trim()) return;
            run("create", async () => {
              if (demo) return router.push("/resumes/frontend-engineer");
              const r = await api<{ resume_id: string; operation: Operation }>("/resumes", { method: "POST", body: { template, target: target.trim() } });
              const op = await waitFor(r.operation);
              router.push(`/resumes/${(op.result?.resume_id as string | undefined) ?? r.resume_id}`);
            });
          }}
        >
          <Input label="Target role" required maxLength={200} value={target} onChange={(e) => setTarget(e.target.value)} placeholder="e.g. Senior Frontend Engineer" autoFocus />
          <Select
            label="Template"
            value={template}
            onChange={(e) => setTemplate(e.target.value)}
            helper={`Best for: ${chosen.bestFor.toLowerCase()}. You can switch templates any time in the editor.`}
          >
            {TEMPLATES.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </Select>
          <Problem error={error} />
          <p className={s.note} role="status">
            {busy ? "Choosing and wording your confirmed facts, then checking every line. This can take a minute." : demo ? "With sample data, this opens the example resume." : ""}
          </p>
        </form>
      </Dialog>
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
        <Button
          key={fmt}
          size="sm"
          loading={busy === fmt}
          disabled={demo || !!busy}
          aria-describedby={demo ? "sample-note" : undefined}
          onClick={() => run(fmt, () => exportResume(resumeId, fmt, templateId))}
        >
          {fmt === "pdf" ? "Download PDF" : "Download Word"}
        </Button>
      ))}
      <Problem error={error} className={s.full} />
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
      <Button
        size="sm"
        icon={<Icon name="refresh" size={16} />}
        loading={!!busy}
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
      </Button>
      {(busy || note) && (
        <p className={`${s.note} ${s.full}`} role="status">
          {busy ? "Rewording your current confirmed facts and checking every line. This can take a minute." : note}
        </p>
      )}
      <Problem error={error} className={s.full} />
    </>
  );
}
