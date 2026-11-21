// "Find jobs": turn the confirmed profile into one-click searches on job sites. We never list or fetch jobs ourselves.
// None of these sites documents its search URLs. The formats below were checked on 2026-11-21
// (docs/reviews/oss-research-2026-11-21.md); when a site changes one, fix it here only.

export type Search = { role: string; skills: string[]; location: string; remote: boolean; years: number | null };
export type SearchLink = { site: string; href: string; note: string };

type ProfileLike = {
  location?: string | null;
  roles: { title: string; dates: string }[];
  skills: { name: string; evidence: number }[];
  goals?: { roles: string[] } | null;
  prefs?: { locations: string[]; modes: string[] } | null;
};

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/** "Jul 2021" -> months since year 0; "Present" -> now; anything unreadable -> null. */
export function toMonth(s: string, now: Date): number | null {
  if (/present/i.test(s)) return now.getFullYear() * 12 + now.getMonth();
  const m = s.trim().match(/^([a-z]{3})[a-z]*\s+(\d{4})$/i);
  const i = m ? MONTHS.indexOf(m[1].toLowerCase()) : -1;
  return m && i >= 0 ? Number(m[2]) * 12 + i : null;
}

/** Whole years worked, from role date ranges ("Jul 2021 – Present"). Overlapping roles count once. Null if none are readable. */
export function yearsOfExperience(roles: { dates: string }[], now = new Date()): number | null {
  const spans = roles
    .map((r) => r.dates.split(/\s*[–-]\s*/).map((p) => toMonth(p, now)))
    .filter((p): p is [number, number] => p.length === 2 && p[0] !== null && p[1] !== null && p[1] >= p[0])
    .sort((a, b) => a[0] - b[0]);
  if (!spans.length) return null;
  let total = 0;
  let [start, end] = spans[0];
  for (const [s, e] of spans.slice(1)) {
    if (s > end) {
      total += end - start;
      start = s;
    }
    end = Math.max(end, e);
  }
  return Math.floor((total + end - start) / 12);
}

/** The starting search: goal role (else latest title), top two proven skills, preferred city, remote if that's a preference. */
export function defaultSearch(p: ProfileLike): Search {
  const proven = p.skills.filter((k) => k.evidence > 0).sort((a, b) => b.evidence - a.evidence);
  return {
    role: p.goals?.roles[0] ?? p.roles[0]?.title ?? "",
    skills: proven.slice(0, 2).map((k) => k.name),
    location: p.prefs?.locations[0] ?? p.location ?? "",
    remote: !!p.prefs?.modes.includes("Remote") && !p.prefs?.locations.length,
    years: yearsOfExperience(p.roles),
  };
}

const slug = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const qs = (o: Record<string, string | number | null | undefined | false>) =>
  new URLSearchParams(Object.entries(o).filter((e): e is [string, string | number] => e[1] !== null && e[1] !== undefined && e[1] !== false && e[1] !== "").map(([k, v]) => [k, String(v)])).toString();

// Wellfound uses fixed role slugs without seniority, and its own city spellings (unknown ones fall back to the role page).
const SENIORITY = /\b(senior|sr|junior|jr|lead|staff|principal|associate|intern|trainee|i{1,3}|iv|[1-4])\b\.?/gi;
const WELLFOUND_CITY: Record<string, string> = { bengaluru: "bangalore", delhi: "new-delhi" };

export function searchLinks(q: Search): SearchLink[] {
  const role = q.role.trim();
  const city = q.remote ? "" : q.location.trim();
  const words = [role, ...q.skills].filter(Boolean).join(" ");
  const quoted = [role, ...q.skills].filter(Boolean).map((w) => `"${w}"`).join(" ");
  const base = slug(role.replace(SENIORITY, "")) || "software-engineer";
  const wfCity = WELLFOUND_CITY[slug(city)] ?? slug(city);
  return [
    {
      site: "LinkedIn",
      note: "Posted in the last week",
      href: `https://www.linkedin.com/jobs/search/?${qs({ keywords: words, location: city || (q.remote ? "India" : ""), f_WT: q.remote && 2, f_TPR: "r604800" })}`, // checked signed in 2026-11-21: f_WT and f_TPR apply; f_E (experience) is dropped by LinkedIn's AI search, so not sent
    },
    {
      site: "Naukri",
      note: q.years !== null ? `For ${q.years} year${q.years === 1 ? "" : "s"} of experience` : "India’s largest job board",
      // shortcut: remote has no verified Naukri filter, so remote searches drop the city only; recheck if Naukri documents one.
      href: `https://www.naukri.com/${slug(role) || "jobs"}-jobs${city ? `-in-${slug(city)}` : ""}?${qs({ k: [role, ...q.skills].filter(Boolean).join(", "), l: city.toLowerCase(), experience: q.years })}`,
    },
    {
      site: "Indeed",
      note: "Posted in the last week",
      // shortcut: India's Indeed only (India-first); pick the country domain from the location when other markets launch.
      href: `https://in.indeed.com/jobs?${qs({ q: words, l: city, fromage: 7, sc: q.remote && "0kf:attr(DSQF7);" })}`,
    },
    {
      site: "Wellfound",
      note: "Startup jobs",
      href: q.remote || !wfCity ? `https://wellfound.com/role/r/${base}` : `https://wellfound.com/role/l/${base}/${wfCity}`,
    },
    {
      site: "Company career pages",
      note: "Jobs on Greenhouse, Lever, Ashby and Workable, through Google",
      href: `https://www.google.com/search?${qs({ q: `(site:boards.greenhouse.io OR site:jobs.lever.co OR site:jobs.ashbyhq.com OR site:apply.workable.com) ${quoted}${city ? ` "${city}"` : q.remote ? " remote" : ""}` })}`,
    },
    {
      site: "Instahyre",
      note: "Through Google (Instahyre has no search link)",
      href: `https://www.google.com/search?${qs({ q: `site:instahyre.com "${role}"${city ? ` "${city}"` : ""}` })}`, // skills too would narrow one small site to nothing
    },
  ];
}
