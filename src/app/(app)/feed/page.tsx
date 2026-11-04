import Link from "next/link";
import PageHeader from "@/components/app/PageHeader";
import a from "@/components/app/app.module.css";
import { getFeed, getUsage, isDemo } from "@/lib/data";
import { AlertSettings, Learned } from "./Side";
import FeedCard from "./FeedCard";
import s from "./feed.module.css";

const DAYS = [
  { value: "", label: "Any time" },
  { value: "3", label: "Last 3 days" },
  { value: "7", label: "Last week" },
  { value: "14", label: "Last 2 weeks" },
];

export default async function FeedPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const one = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : "");
  const query = { q: one("q").slice(0, 100), remote: one("remote") === "1", days: Number(one("days")) || undefined, saved: one("saved") === "1" };
  const filtered = !!(query.q || query.remote || query.days || query.saved);
  const [feed, usage, demo] = await Promise.all([getFeed(query), getUsage(), isDemo()]);
  const left = Math.max(0, usage.matches.limit - usage.matches.used);

  return (
    <>
      <PageHeader
        title="Jobs that may fit you"
        sub="Open jobs from company job boards, ordered by how many of your confirmed skills they mention. That’s an early read, not a verdict: open the full check to see every requirement against your facts."
      />

      <div className={s.layout}>
        <section aria-labelledby="feed-title" className={s.main}>
          <h2 id="feed-title" className="sr-only">
            Feed
          </h2>
          <form className={s.filters} role="search" action="/feed">
            <label className={s.search}>
              <span className="sr-only">Search jobs</span>
              <input type="search" name="q" defaultValue={query.q} placeholder="Search title, company or place" maxLength={100} />
            </label>
            <label className={s.check}>
              <input type="checkbox" name="remote" value="1" defaultChecked={query.remote} />
              Remote only
            </label>
            <label className={s.check}>
              <input type="checkbox" name="saved" value="1" defaultChecked={query.saved} />
              Saved
            </label>
            <label className={s.days}>
              <span className="sr-only">Posted within</span>
              <select name="days" defaultValue={query.days ? String(query.days) : ""}>
                {DAYS.map((d) => (
                  <option key={d.value} value={d.value}>
                    {d.label}
                  </option>
                ))}
              </select>
            </label>
            <button type="submit" className="btn btn-secondary btn-small">
              Show jobs
            </button>
            {filtered && (
              <Link href="/feed" className={s.reset}>
                Clear filters
              </Link>
            )}
          </form>

          {feed.catalogSize === 0 ? (
            <div className={a.empty}>
              <p className="margin-note">No jobs in your feed yet.</p>
              <p className={a.note}>
                We add job boards only after checking that their terms allow it. Until then, paste any job you’re eyeing and we’ll check it
                the same way.
              </p>
              <Link href="/jobs" className="btn btn-primary btn-small">
                Paste a job
              </Link>
            </div>
          ) : feed.items.length === 0 ? (
            <div className={a.empty}>
              <p className="margin-note">{filtered ? "Nothing matches these filters." : "Nothing fits your preferences right now."}</p>
              <p className={a.note}>
                {filtered
                  ? "Try fewer filters, or a different word."
                  : "Jobs that clash with your location, work mode or job type are left out. You can change those on your profile."}
              </p>
              <Link href={filtered ? "/feed" : "/profile"} className="btn btn-secondary btn-small">
                {filtered ? "Clear filters" : "Review your preferences"}
              </Link>
            </div>
          ) : (
            <ul className={s.list}>
              {feed.items.map((item) => (
                <FeedCard key={item.id} item={item} demo={demo} checksLeft={left} checksLimit={usage.matches.limit} />
              ))}
            </ul>
          )}
        </section>

        <aside className={s.side} aria-label="Alerts and what the feed learned">
          <AlertSettings initial={feed.alerts} demo={demo} />
          <Learned initial={feed.learned} demo={demo} />
          <div className={`${a.card} ${s.sideCard}`}>
            <h2 className={s.sideTitle}>Where these come from</h2>
            <p className={a.note}>
              Public job boards that companies publish for sharing their openings. We never scrape sites, and you always apply on the
              company’s own page. Jobs that ask for fees or ID documents are left out.
            </p>
          </div>
        </aside>
      </div>
    </>
  );
}
