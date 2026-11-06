"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import a from "@/components/app/app.module.css";
import { StatusIcon } from "@/components/ui";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Disclosure } from "@/components/ui/Disclosure";
import { ProofMark } from "@/components/ui/Proof";
import { api } from "@/lib/api";
import type { Fact, JobStatus, Match, Requirement, SavedJob, Status } from "@/lib/mock";
import { useAction } from "@/lib/useAction";
import { ReportDialog, reportReason } from "../Report";
import { useCloseGap } from "./Gap";
import s from "./match.module.css";

// Demo mode: every action applies locally (sample data, nothing sent). Live: saved, then the page re-reads.

const ICON: Record<Status, { icon: Parameters<typeof StatusIcon>[0]["name"]; tone: string; sr: string }> = {
  supported: { icon: "check", tone: "supported", sr: "Proven" },
  match: { icon: "check", tone: "supported", sr: "Matches" },
  partial: { icon: "half", tone: "partial", sr: "Partly proven" },
  no_evidence: { icon: "dash", tone: "missing", sr: "No confirmed fact yet" },
  gap: { icon: "cross", tone: "missing", sr: "Gap, you said so" },
  conflict: { icon: "alert", tone: "conflict", sr: "Doesn't match your preference" },
  unknown: { icon: "question", tone: "missing", sr: "Not stated in posting" },
};

export function StatusGlyph({ status }: { status: Status }) {
  const i = ICON[status];
  return (
    <span className={s.glyph} style={{ color: `var(--${i.tone})` }}>
      <StatusIcon name={i.icon} />
      <span className="sr-only">{i.sr}: </span>
    </span>
  );
}

const GROUPS = [
  { title: "Proven", has: (st: Status) => st === "supported" },
  { title: "Partly", has: (st: Status) => st === "partial" },
  { title: "Missing", has: (st: Status) => st === "no_evidence" || st === "gap" },
];

/**
 * Requirements grouped Proven / Partly / Missing (DESIGN.md 3.10): groups open, rows collapsed, the posting's quote on
 * expand. A link to #req-N (the verdict card's biggest gaps) opens that row. "I don't have this" =
 * POST .../requirements/{rid}/gap, with an undo.
 */
export function Requirements({ jobId, requirements, facts, demo }: { jobId: string; requirements: Requirement[]; facts: Fact[]; demo: boolean }) {
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [local, setLocal] = useState<Record<string, Status>>({}); // until the refreshed match arrives
  const rows = requirements.map((r, i) => ({ r, key: `req-${i}`, status: local[`req-${i}`] ?? r.status }));
  const all = open.size === rows.length;
  const toggle = (key: string, on: boolean) =>
    setOpen((o) => {
      const n = new Set(o);
      if (on) n.add(key);
      else n.delete(key);
      return n;
    });

  useEffect(() => {
    const fromHash = () => {
      const key = decodeURIComponent(location.hash.slice(1));
      if (key.startsWith("req-")) toggle(key, true);
    };
    fromHash();
    window.addEventListener("hashchange", fromHash);
    return () => window.removeEventListener("hashchange", fromHash);
  }, []);

  return (
    <section aria-labelledby="req" className={s.block}>
      <div className={s.blockHead}>
        <h2 id="req" className={s.h2}>
          Requirements
        </h2>
        <Button variant="ghost" size="sm" onClick={() => setOpen(all ? new Set() : new Set(rows.map((x) => x.key)))}>
          {all ? "Collapse all" : "Expand all"}
        </Button>
      </div>
      {GROUPS.map((g) => {
        const items = rows.filter((x) => g.has(x.status));
        if (!items.length) return null;
        return (
          <div key={g.title} className={s.group}>
            <h3 className={s.groupTitle}>
              {g.title} <span className={s.count}>· {items.length}</span>
            </h3>
            <Card as="ul" flush className={s.rows}>
              {items.map(({ r, key, status }) => (
                <li key={key} id={key} className={s.row}>
                  <Disclosure
                    open={open.has(key)}
                    onOpenChange={(on) => toggle(key, on)}
                    summary={
                      <span className={s.rowHead}>
                        <StatusGlyph status={status} />
                        <span className={s.rowText}>{r.text}</span>
                        <span className={s.importance}>{r.importance === "required" ? "Required" : "Nice to have"}</span>
                      </span>
                    }
                  >
                    <RequirementDetail
                      jobId={jobId}
                      r={r}
                      status={status}
                      fact={facts.find((f) => f.id === r.factId)}
                      demo={demo}
                      onStatus={(st) => setLocal((l) => ({ ...l, [key]: st }))}
                    />
                  </Disclosure>
                </li>
              ))}
            </Card>
          </div>
        );
      })}
    </section>
  );
}

function RequirementDetail({ jobId, r, status, fact, demo, onStatus }: { jobId: string; r: Requirement; status: Status; fact?: Fact; demo: boolean; onStatus: (s: Status) => void }) {
  const router = useRouter();
  const closeGap = useCloseGap();
  const { busy, error, run } = useAction();
  const setGap = (confirmed: boolean) =>
    run("gap", async () => {
      if (demo) return onStatus(confirmed ? "gap" : "no_evidence");
      const m = await api<Match>(`/jobs/${jobId}/requirements/${r.id}/gap`, { method: "POST", body: { confirmed } });
      const next = m.requirements.find((x) => x.id === r.id)?.status;
      if (next) onStatus(next);
      router.refresh(); // the verdict and counts may change too
    });
  const canMark = demo || !!r.id;

  return (
    <div className={s.detail}>
      <p className={s.label}>From the posting</p>
      <p className={s.quote}>
        <ProofMark quote>“{r.quote}”</ProofMark>
      </p>
      {fact && (
        <>
          <p className={s.label}>Your fact</p>
          <p className={s.fact}>
            <span className="tag" title={fact.id}>
              {fact.id.length > 8 ? fact.id.slice(0, 6) : fact.id}
            </span>
            <span>{fact.text}</span>
          </p>
        </>
      )}
      {r.note && <p className={a.note}>{r.note}</p>}
      {status === "no_evidence" && (
        <>
          <p className={a.note}>No confirmed fact yet.</p>
          <div className={s.detailActions}>
            <Button size="sm" onClick={() => closeGap(r)}>
              I have this: add a fact
            </Button>
            {canMark && (
              <Button size="sm" variant="ghost" loading={busy === "gap"} onClick={() => setGap(true)}>
                I don’t have this
              </Button>
            )}
          </div>
        </>
      )}
      {status === "partial" && (
        <div className={s.detailActions}>
          <Button size="sm" onClick={() => closeGap(r)}>
            Add more detail as a fact
          </Button>
        </div>
      )}
      {status === "gap" && (
        <div className={s.detailActions}>
          <p className={a.note}>You said you don’t have this. It stays out of your resumes and counts as a gap here.</p>
          {canMark && (
            <Button size="sm" variant="ghost" loading={busy === "gap"} onClick={() => setGap(false)}>
              Undo
            </Button>
          )}
        </div>
      )}
      {error && (
        <p role="alert" className={a.problem}>
          {error}
        </p>
      )}
    </div>
  );
}

const STATUS_BUTTONS: { status: JobStatus; idle: string; on: string }[] = [
  { status: "saved", idle: "Save", on: "Saved" },
  { status: "applied", idle: "Mark as applied", on: "Marked applied" },
  { status: "not_interested", idle: "Not for me", on: "Not interested" },
];

/** PATCH /v1/jobs/{id} {status}, plus "Report this job". "Applied" is only what you marked: we never apply for you. */
export function JobStatusButtons({ jobId, initial, demo }: { jobId: string; initial: SavedJob["status"] | null; demo: boolean }) {
  const router = useRouter();
  const [status, setStatus] = useState(initial);
  const [reporting, setReporting] = useState(false);
  const [reported, setReported] = useState(false);
  const { busy, error, run } = useAction();

  const set = (next: JobStatus) =>
    run(next, async () => {
      if (!demo) {
        const j = await api<SavedJob>(`/jobs/${jobId}`, { method: "PATCH", body: { status: next } });
        setStatus(j.status ?? next);
        router.refresh();
      } else setStatus(next);
    });
  const report = (reason: string) =>
    run("report", async () => {
      if (!demo) await api(`/jobs/${jobId}/feedback`, { method: "POST", body: { action: "dismiss", reasons: [reportReason(reason)] } });
      setReported(true);
      if (!demo) router.refresh();
    });

  return (
    <>
      <div className={s.statusRow} role="group" aria-label="Your status for this job">
        {STATUS_BUTTONS.map((b) => (
          <Button key={b.status} variant="ghost" size="sm" aria-pressed={status === b.status} loading={busy === b.status} onClick={() => status !== b.status && set(b.status)}>
            {status === b.status ? b.on : b.idle}
          </Button>
        ))}
        {reported ? (
          <span className={s.reported}>Reported. It’s hidden from your feed.</span>
        ) : (
          <Button variant="ghost" size="sm" onClick={() => setReporting(true)}>
            Report this job
          </Button>
        )}
      </div>
      {error && (
        <p role="alert" className={a.problem}>
          {error}
        </p>
      )}
      {reporting && <ReportDialog open onClose={() => setReporting(false)} onReport={report} />}
    </>
  );
}
