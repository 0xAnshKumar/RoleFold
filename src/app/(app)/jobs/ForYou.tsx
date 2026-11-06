import { ButtonLink } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/State";
import type { Feed } from "@/lib/mock";
import FeedCard from "./FeedCard";
import Filters from "./Filters";
import s from "./jobs.module.css";

type SP = Record<string, string | string[] | undefined>;
export type FeedQuery = { q: string; remote: boolean; days?: number; saved: boolean };

/** Filters live in the URL (DESIGN.md 3.5) so they survive reload and Back. */
export function feedQuery(sp: SP): FeedQuery {
  const one = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : "");
  return { q: one("q").slice(0, 100), remote: one("remote") === "1", days: Number(one("days")) || undefined, saved: one("saved") === "1" };
}

/** "For you" tab of /jobs: filters, compact job cards, one footer note. Feed settings live in a drawer (JobsActions). */
export default function ForYou({ query, feed, demo, checksLeft, checksLimit }: { query: FeedQuery; feed: Feed; demo: boolean; checksLeft: number; checksLimit: number }) {
  const filtered = !!(query.q || query.remote || query.days || query.saved);
  return (
    <section aria-labelledby="feed-title" className={s.feed}>
      <h2 id="feed-title" className="sr-only">
        Jobs for you
      </h2>
      {feed.catalogSize > 0 && <Filters query={query} />}

      {feed.catalogSize === 0 ? (
        <EmptyState
          title="No jobs in your feed yet"
          action={
            <ButtonLink href="/jobs?paste=1" scroll={false}>
              Paste a job
            </ButtonLink>
          }
        >
          We add job boards only after checking that their terms allow it. Until then, paste any job you’re eyeing and we’ll check it the same way.
        </EmptyState>
      ) : feed.items.length === 0 ? (
        <EmptyState
          title={filtered ? "Nothing matches these filters" : "No good matches today"}
          action={<ButtonLink href={filtered ? "/jobs" : "/profile#goals"}>{filtered ? "Clear filters" : "Review your must-haves"}</ButtonLink>}
        >
          {filtered
            ? "Try fewer filters, or a different word."
            : "New jobs arrive every hour. Jobs that clash with your location, work mode or job type are left out; widening those finds more."}
        </EmptyState>
      ) : (
        <ul className={s.list}>
          {feed.items.map((item) => (
            <FeedCard key={item.id} item={item} demo={demo} checksLeft={checksLeft} checksLimit={checksLimit} />
          ))}
        </ul>
      )}

      <p className={s.footNote}>
        Jobs come from company career sites and their public job boards; you always apply on the company’s own page. No genuine employer asks for money.
      </p>
    </section>
  );
}
