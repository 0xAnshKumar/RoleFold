"use client";

import { useId, useState } from "react";
import a from "@/components/app/app.module.css";
import { Button } from "@/components/ui/Button";
import { Radio } from "@/components/ui/Choice";
import { Dialog } from "@/components/ui/Dialog";
import s from "./jobs.module.css";

const REASONS = ["Fake job", "Asks for money", "Expired", "Wrong details"];

// shortcut: a report is stored as "dismiss" feedback with a "report: <reason>" reason (no moderation queue yet);
// add a reports table + admin view when sources are opened to the public.
export const reportReason = (reason: string) => `report: ${reason}`;

/** "Report this job" dialog (DESIGN.md 3.8): pick a reason, then `onReport` sends it. */
export function ReportDialog({ open, onClose, onReport }: { open: boolean; onClose: () => void; onReport: (reason: string) => Promise<boolean> }) {
  const [reason, setReason] = useState(REASONS[0]);
  const [busy, setBusy] = useState(false);
  const name = useId();
  const submit = async () => {
    setBusy(true);
    const ok = await onReport(reason);
    setBusy(false);
    if (ok) onClose();
  };
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Report this job"
      description="It’s hidden for you, and the report is kept with the job."
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={busy} onClick={submit}>
            Report job
          </Button>
        </>
      }
    >
      <fieldset className={s.reasons}>
        <legend className="sr-only">What’s wrong with it?</legend>
        {REASONS.map((r) => (
          <Radio key={r} name={name} label={r} checked={reason === r} onChange={() => setReason(r)} />
        ))}
      </fieldset>
      <p className={a.note}>Real employers never ask for money to apply, interview or train you.</p>
    </Dialog>
  );
}
