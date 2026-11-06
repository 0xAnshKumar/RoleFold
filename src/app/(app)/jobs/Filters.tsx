"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChipRow, FilterChip } from "@/components/ui/Chip";
import { Input } from "@/components/ui/Field";
import type { FeedQuery } from "./ForYou";
import s from "./jobs.module.css";

const DAYS = [
  { days: 3, label: "Last 3 days" },
  { days: 7, label: "Last week" },
  { days: 14, label: "Last 2 weeks" },
];

const href = (q: FeedQuery) => {
  const p = new URLSearchParams();
  if (q.q) p.set("q", q.q);
  if (q.remote) p.set("remote", "1");
  if (q.days) p.set("days", String(q.days));
  if (q.saved) p.set("saved", "1");
  return `/jobs${p.size ? `?${p}` : ""}`;
};

/** Search plus one row of chips that apply at once (DESIGN.md 3.5). The search is a plain GET form, so it works without JS. */
export default function Filters({ query }: { query: FeedQuery }) {
  const router = useRouter();
  const go = (patch: Partial<FeedQuery>) => router.push(href({ ...query, ...patch }), { scroll: false });
  const filtered = !!(query.q || query.remote || query.days || query.saved);
  return (
    <div className={s.filters}>
      <form role="search" action="/jobs" className={s.search}>
        <Input type="search" name="q" label="Search jobs" hideLabel defaultValue={query.q} placeholder="Search title, company or place" maxLength={100} />
        {query.remote && <input type="hidden" name="remote" value="1" />}
        {query.days && <input type="hidden" name="days" value={query.days} />}
        {query.saved && <input type="hidden" name="saved" value="1" />}
      </form>
      <ChipRow label="Filters">
        <FilterChip pressed={query.remote} onClick={() => go({ remote: !query.remote })}>
          Remote only
        </FilterChip>
        <FilterChip pressed={query.saved} onClick={() => go({ saved: !query.saved })}>
          Saved
        </FilterChip>
        {DAYS.map((d) => (
          <FilterChip key={d.days} pressed={query.days === d.days} onClick={() => go({ days: query.days === d.days ? undefined : d.days })}>
            {d.label}
          </FilterChip>
        ))}
        {filtered && (
          <Link href="/jobs" scroll={false} className={s.clear}>
            Clear filters
          </Link>
        )}
      </ChipRow>
    </div>
  );
}
