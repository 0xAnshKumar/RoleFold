"use client";

import { useState, useSyncExternalStore } from "react";
import { FactTag, ProofMark, SignatureLine } from "@/components/ui/Proof";
import { StatusMark } from "@/components/ui/Status";
import { VerdictSeal } from "@/components/ui/VerdictSeal";
import type { Verdict } from "@/lib/mock";
import s from "./landing.module.css";

type Line = { id: string; text: string; factId: string; fact: string; source: string };
type Props = {
  name: string;
  roleLine: string;
  lines: Line[];
  confirmedOn: string;
  job: { title: string; company: string; verdict: Verdict; counts: number[]; req: { text: string; quote: string; factId: string; fact: string } };
};

// The visitor's real date in their own locale. The server renders without it, so hydration never mismatches.
const noop = () => () => {};
const today = () => new Intl.DateTimeFormat(undefined, { weekday: "short", day: "numeric", month: "short" }).format(new Date());

/**
 * Hero mockup (DESIGN.md 4.1): real components with sample data. Hovering a resume line, or focusing or tapping its
 * fact tag, links it: the tag outlines and the source card below swipes its proof mark on. The third line is linked
 * on first paint; nothing plays by itself.
 */
export default function HeroMockup({ name, roleLine, lines, confirmedOn, job }: Props) {
  const [active, setActive] = useState(lines[2].id);
  const [touched, setTouched] = useState(false);
  const date = useSyncExternalStore(noop, today, () => "");
  const line = lines.find((l) => l.id === active)!;
  const short = confirmedOn.split(" ").slice(0, 2).join(" ");
  const link = (id: string) => {
    setActive(id);
    setTouched(true);
  };

  return (
    <figure className={`${s.mock} ${s.enter}`} style={{ "--i": 2 } as React.CSSProperties} aria-label="Example: resume lines linked to the facts they came from, and a job check">
      <div className={s.sheet}>
        <div className={s.sheetHead}>
          <div>
            <p className={s.sheetName}>{name}</p>
            <p className={s.sheetMeta}>Frontend Engineer · Bengaluru</p>
          </div>
          <span className={s.sample}>Sample</span>
        </div>
        <p className={s.sheetRole}>{roleLine}</p>
        <ul className={s.sheetLines}>
          {lines.map((l) => (
            <li key={l.id} className={s.sheetLine} data-active={l.id === active || undefined} onPointerEnter={() => link(l.id)}>
              <span>{l.text}</span>
              <FactTag id={l.factId} date={short} fact={l.fact} linked={l.id === active} onFocus={() => link(l.id)} onClick={() => link(l.id)} />
            </li>
          ))}
        </ul>
      </div>

      <div className={s.source} aria-live="polite">
        <div className={s.sourceHead}>
          <span className="tag">
            {line.factId} · {short}
          </span>
          <span className={s.sourceLabel}>From your old resume</span>
        </div>
        <p key={active} className={touched ? s.swipe : undefined}>
          <ProofMark quote>{line.source}</ProofMark>
        </p>
        <SignatureLine date={confirmedOn} />
      </div>

      <div className={s.check}>
        <div className={s.checkHead}>
          <div>
            <p className={s.checkTitle}>{job.title}</p>
            <p className={s.checkMeta}>{job.company}</p>
            <p className={s.checkMeta}>{date ? `Checked today, ${date}` : "Checked today"}</p>
          </div>
          <span className={s.sealWrap}>
            <VerdictSeal verdict={job.verdict} size={64} press />
          </span>
        </div>
        <p className="sr-only">
          Requirements: {job.counts[0]} proven, {job.counts[1]} partly proven, {job.counts[2]} with no confirmed fact yet.
        </p>
        <div className={s.checkMarks} aria-hidden>
          <StatusMark status="supported">Proven · {job.counts[0]}</StatusMark>
          <StatusMark status="partial">Partly · {job.counts[1]}</StatusMark>
          <StatusMark status="no_evidence">Missing · {job.counts[2]}</StatusMark>
        </div>
        <div className={s.req}>
          <p className={s.reqTitle}>
            <StatusMark status="supported" /> {job.req.text}
          </p>
          <p className={s.reqLabel}>From the posting</p>
          <p>
            <ProofMark quote>“{job.req.quote}”</ProofMark>
          </p>
          <p className={s.reqFact}>
            <span className={s.reqLabel}>Your fact</span>
            <span className="tag">{job.req.factId}</span>
            <span>{job.req.fact}</span>
          </p>
        </div>
      </div>
    </figure>
  );
}
