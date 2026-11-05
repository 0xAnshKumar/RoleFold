"use client";

import { useState } from "react";
import PageHeader from "@/components/app/PageHeader";
import a from "@/components/app/app.module.css";
import { api } from "@/lib/api";
import { useAction } from "@/lib/useAction";
import s from "../admin.module.css";
import { Loaded, REASON_MIN, ReasonField, useLoad, when } from "../shared";

type Term = { term_norm: string; example: string; uses: number; users: number };
type Decision = { alias_norm: string; alias: string; skill_id: string | null; status: "approved" | "rejected"; updated_at: string };

/** Curator queue (TRD §6): unmapped skill terms, most people first. Approve as an alias of a skill, or mark not a skill. */
export default function TaxonomyPage() {
  const queue = useLoad<{ items: Term[]; decided: Decision[] }>("/admin/taxonomy/queue");
  const [reason, setReason] = useState("");
  const [skill, setSkill] = useState<Record<string, string>>({});
  const { busy, error, run } = useAction();
  const ready = reason.trim().length >= REASON_MIN && !busy;

  const decide = (t: Term, skillId: string | null) =>
    run(t.term_norm, async () => {
      await api("/admin/taxonomy/decisions", { method: "POST", body: { term: t.example, skill_id: skillId, reason } });
      await queue.reload();
    });

  return (
    <>
      <PageHeader
        title="Skill terms"
        sub="Skills people and job posts named that don’t map to a known skill yet. Counts only: no names or surrounding text."
      />
      <section className={`${a.card} ${a.section}`}>
        <ReasonField id="taxonomy-reason" value={reason} onChange={setReason} />
        {error && (
          <p role="alert" className={a.problem}>
            {error}
          </p>
        )}
      </section>

      <Loaded state={queue}>
        {(d) => (
          <>
            <section className={a.section} aria-labelledby="queue">
              <h2 id="queue" className={a.h2}>
                Waiting for a decision
              </h2>
              {d.items.length ? (
                <div className={`${a.cardFlat} ${s.tableWrap}`}>
                  <table className={s.table}>
                    <thead>
                      <tr>
                        <th>Term</th>
                        <th className={s.num}>People</th>
                        <th className={s.num}>Uses</th>
                        <th>Decision</th>
                      </tr>
                    </thead>
                    <tbody>
                      {d.items.map((t) => (
                        <tr key={t.term_norm}>
                          <td>{t.example}</td>
                          <td className={s.num}>{t.users}</td>
                          <td className={s.num}>{t.uses}</td>
                          <td>
                            <form
                              className={s.inline}
                              onSubmit={(e) => {
                                e.preventDefault();
                                decide(t, skill[t.term_norm]?.trim() || null);
                              }}
                            >
                              <input
                                aria-label={`Skill id for ${t.example}`}
                                placeholder="Skill id, e.g. postgresql"
                                value={skill[t.term_norm] ?? ""}
                                onChange={(e) => setSkill({ ...skill, [t.term_norm]: e.target.value })}
                              />
                              <button type="submit" className="btn btn-primary btn-small" disabled={!ready || !skill[t.term_norm]?.trim()}>
                                {busy === t.term_norm ? "Saving…" : "Approve alias"}
                              </button>
                              <button type="button" className="btn btn-secondary btn-small" disabled={!ready} onClick={() => decide(t, null)}>
                                Not a skill
                              </button>
                            </form>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className={a.empty}>
                  <p className="margin-note">Every term has a decision.</p>
                </div>
              )}
            </section>

            {d.decided.length > 0 && (
              <section className={a.section} aria-labelledby="decided">
                <h2 id="decided" className={a.h2}>
                  Recent decisions
                </h2>
                <p className={a.note}>To change one, decide the same term again.</p>
                <ul className={`${a.cardFlat} ${a.rows}`}>
                  {d.decided.map((x) => (
                    <li key={x.alias_norm}>
                      <div className={a.rowMain}>
                        <span className={a.rowTitle}>
                          {x.alias} → {x.skill_id ?? "not a skill"}
                        </span>
                        <span className={a.mono}>{when(x.updated_at)}</span>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </>
        )}
      </Loaded>
    </>
  );
}
