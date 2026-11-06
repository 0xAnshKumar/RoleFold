"use client";

import { createContext, useContext, useState } from "react";
import a from "@/components/app/app.module.css";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { ProofMark } from "@/components/ui/Proof";
import type { Profile, Requirement } from "@/lib/mock";
import DraftFact from "./DraftFact";
import s from "./match.module.css";

const Ctx = createContext<(r: Requirement | null) => void>(() => {});
export const useCloseGap = () => useContext(Ctx);

/**
 * "Close the gap" drawer (DESIGN.md 4.6): opened from the verdict card or from a Missing/Partly row, never a permanent
 * sidebar. It shows what the posting asks, then turns your answer into a draft fact you confirm. Nothing is invented.
 */
export function GapProvider({
  enrichment,
  roles,
  projects,
  demo,
  children,
}: {
  enrichment: string;
  roles: Profile["roles"];
  projects: Profile["projects"];
  demo: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [req, setReq] = useState<Requirement | null>(null);
  return (
    <Ctx.Provider
      value={(r) => {
        setReq(r);
        setOpen(true);
      }}
    >
      {children}
      <Dialog open={open} onClose={() => setOpen(false)} variant="drawer" title="Close the gap">
        <div className={s.gap}>
          {req && (
            <div className={s.gapAsk}>
              <p className={s.label}>What the posting asks</p>
              <p className={s.quote}>
                <ProofMark quote>“{req.quote}”</ProofMark>
              </p>
            </div>
          )}
          <DraftFact key={req?.text ?? ""} question={req ? `Have you done this: ${req.text}? Say where and what you did.` : enrichment} roles={roles} projects={projects} demo={demo} />
          <div className={s.gapAsk}>
            <p className={s.label}>If you haven’t done it</p>
            <p className={a.note}>
              Say so on the requirement with “I don’t have this”. It stays off your resumes and is counted under What to learn next on your
              profile. Don’t claim it here: a learning plan isn’t a fact.
            </p>
          </div>
          <Button className={s.start} onClick={() => setOpen(false)}>
            Done
          </Button>
        </div>
      </Dialog>
    </Ctx.Provider>
  );
}

/** The verdict card's one main action. */
export function CloseGapButton({ first }: { first: Requirement | null }) {
  const open = useCloseGap();
  return (
    <Button variant="primary" onClick={() => open(first)}>
      Close a gap
    </Button>
  );
}
