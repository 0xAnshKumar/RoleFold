"use client";

import { useState } from "react";
import { buttonClass } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { StageList } from "@/components/ui/Progress";
import { ProofMark, SignatureLine } from "@/components/ui/Proof";
import { StatusMark } from "@/components/ui/Status";
import { Tabs } from "@/components/ui/Tabs";
import s from "./landing.module.css";

const LEVELS = ["Contributed", "Owned", "Led", "Managed"];

const STEPS = [
  {
    value: "upload",
    label: "Upload",
    title: "Upload your resume",
    body: "PDF, Word or plain text, or start from scratch and answer a few questions. Hunt reads it and pulls out your roles, facts, education and skills.",
    picture: (
      <div className={s.pic}>
        <div className={s.file}>
          <Icon name="doc" size={24} />
          <span className={s.fileName}>rohan-iyer-resume.pdf</span>
          <span className={s.fileMeta}>2 pages</span>
        </div>
        <StageList
          label="Reading your resume"
          stages={[
            { label: "Reading the file", state: "done" },
            { label: "Finding your facts", state: "done" },
            { label: "Ready for you to confirm", state: "current" },
          ]}
        />
      </div>
    ),
  },
  {
    value: "confirm",
    label: "Confirm",
    title: "Confirm what’s yours",
    body: "Check each fact Hunt found, fix the wording, and say how much of it was yours. Nothing reaches your resume until you confirm it.",
    picture: (
      <div className={s.pic}>
        <p className={s.picMeta}>Frontend Engineer · Northwind Commerce</p>
        <p className={s.picFact}>Cut product-page LCP from 4.2s to 2.1s by moving images to a CDN with responsive sizes</p>
        <p className={s.picMeta}>How much of this was yours?</p>
        <div className={s.levels}>
          {LEVELS.map((l) => (
            <span key={l} className={s.level} data-on={l === "Contributed" || undefined}>
              {l}
            </span>
          ))}
        </div>
        <SignatureLine date="3 Oct 2026" reveal />
      </div>
    ),
  },
  {
    value: "download",
    label: "Download",
    title: "Download PDF or Word",
    body: "Pick one of six ATS-safe templates and edit any line. If an edit claims more than your facts show, Hunt says which part and why. Downloads are free.",
    picture: (
      <div className={s.pic}>
        {["Rohan-Iyer-Resume.pdf", "Rohan-Iyer-Resume.docx"].map((f) => (
          <div key={f} className={s.file}>
            <Icon name="resume" size={24} />
            <span className={s.fileName}>{f}</span>
            <span className={buttonClass("secondary", "sm", s.fakeBtn)}>Download</span>
          </div>
        ))}
        <p className={s.picMeta}>Template: Compact Tech · single column</p>
      </div>
    ),
  },
  {
    value: "jobs",
    label: "Find jobs",
    title: "See jobs that fit, honestly",
    body: "Your feed ranks open roles by your confirmed skills, goal, level and location. A full check quotes the posting for every requirement and gives a verdict in words.",
    picture: (
      <div className={s.pic}>
        {[
          { st: "supported" as const, t: "React and TypeScript in production", q: "Deep experience with React and TypeScript in production" },
          { st: "partial" as const, t: "Web performance (Core Web Vitals)", q: "Own web performance: Core Web Vitals, bundle size, rendering" },
          { st: "no_evidence" as const, t: "GraphQL", q: "Experience consuming GraphQL APIs (Apollo or urql)" },
        ].map((r) => (
          <div key={r.t} className={s.picReq}>
            <p className={s.picReqHead}>
              <StatusMark status={r.st} />
              <span>{r.t}</span>
            </p>
            <p className={s.picQuote}>
              <ProofMark quote>“{r.q}”</ProofMark>
            </p>
          </div>
        ))}
      </div>
    ),
  },
];

/** Click-only stepper (DESIGN.md 4.1): ARIA tabs; the picture crossfades only after the visitor picks a step. */
export default function HowItWorks() {
  const [touched, setTouched] = useState(false);
  return (
    <section id="how" className={s.block} aria-labelledby="how-title">
      <h2 id="how-title" className={`t-d1 ${s.h2}`}>
        From the resume you have to jobs worth applying for.
      </h2>
      <div className={s.how} data-touched={touched || undefined}>
        <Tabs
          label="Steps"
          onChange={() => setTouched(true)}
          tabs={STEPS.map((st, i) => ({
            value: st.value,
            label: (
              <>
                <span className={s.stepNum}>{i + 1}</span>
                {st.label}
              </>
            ),
            panel: (
              <div className={s.step}>
                <div className={s.stepText}>
                  <h3 className="t-d2">{st.title}</h3>
                  <p className={s.body}>{st.body}</p>
                </div>
                <div className={s.stepPic}>{st.picture}</div>
              </div>
            ),
          }))}
        />
      </div>
    </section>
  );
}
