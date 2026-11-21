"use client";

import Link from "next/link";
import { useState } from "react";
import { buttonClass } from "@/components/ui/Button";
import { Card, cardLink } from "@/components/ui/Card";
import { Checkbox } from "@/components/ui/Choice";
import { ChipRow, FilterChip } from "@/components/ui/Chip";
import { Input } from "@/components/ui/Field";
import { Icon } from "@/components/ui/Icon";
import { searchLinks, type Search } from "@/lib/jobSearch";
import s from "./jobs.module.css";

/** Find jobs (default tab): a search built from the confirmed profile, opened on job sites. We don't list jobs ourselves. */
export default function FindJobs({ initial, skills }: { initial: Search; skills: string[] }) {
  const [q, setQ] = useState(initial);
  const set = (patch: Partial<Search>) => setQ((v) => ({ ...v, ...patch }));
  const toggle = (k: string) => set({ skills: q.skills.includes(k) ? q.skills.filter((x) => x !== k) : [...q.skills, k] });
  const ready = q.role.trim().length > 0;

  return (
    <div className={s.feed}>
      <Card as="section" aria-labelledby="search-h" className={s.searchCard}>
        <h2 id="search-h" className={s.cardTitle}>
          Your search
        </h2>
        <p className={s.meta}>
          Built from your confirmed profile{q.years !== null ? ` · ${q.years} year${q.years === 1 ? "" : "s"} of experience` : ""}. Change anything before you search.
        </p>
        <div className={s.searchFields}>
          <Input label="Role" value={q.role} maxLength={120} onChange={(e) => set({ role: e.target.value })} placeholder="e.g. Frontend Engineer" />
          <Input label="City" value={q.location} maxLength={80} disabled={q.remote} onChange={(e) => set({ location: e.target.value })} placeholder="e.g. Bengaluru" />
        </div>
        <Checkbox label="Remote jobs only" checked={q.remote} onChange={(e) => set({ remote: e.target.checked })} />
        {skills.length > 0 && (
          <ChipRow label="Skills to search for">
            {skills.map((k) => (
              <FilterChip key={k} pressed={q.skills.includes(k)} onClick={() => toggle(k)}>
                {k}
              </FilterChip>
            ))}
          </ChipRow>
        )}
      </Card>

      {ready ? (
        <ul className={s.list} aria-label="Search on job sites">
          {searchLinks(q).map((l) => (
            <li key={l.site}>
              <Card interactive className={s.siteCard}>
                <div className={s.cardText}>
                  <h3 className={s.cardTitle}>
                    <a href={l.href} target="_blank" rel="noopener noreferrer" className={cardLink}>
                      {l.site}
                      <span className="sr-only"> (opens in a new tab)</span>
                    </a>
                  </h3>
                  <p className={s.meta}>{l.note}</p>
                </div>
                <span className={buttonClass("secondary", "sm")} aria-hidden>
                  <span className={s.siteBtn}>
                    Search
                    <Icon name="external" size={16} />
                  </span>
                </span>
              </Card>
            </li>
          ))}
        </ul>
      ) : (
        <p className={s.meta}>Add a role to see searches.</p>
      )}

      <p className={s.footNote}>
        Found a job you like? <Link href="/jobs?paste=1">Paste it here</Link> and we’ll check how well you fit, using only your confirmed facts.
      </p>
    </div>
  );
}
