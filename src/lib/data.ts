// Server-side loaders for the app screens. Each returns the src/lib/mock.ts shape, from the API when
// it's live, or the sample data in demo mode (no NEXT_PUBLIC_DEV_USER and no OIDC_ISSUER, HUNT_DEMO=1, or API not ready).
import { cookies } from "next/headers";
import { connection } from "next/server";
import { cache } from "react";
import { API_URL, ApiError, DEV_USER, api as send } from "./api";
import { SESSION_COOKIE } from "./auth";
import * as mock from "./mock";
import type { DraftGroup, Fact, Match, Profile, Resume, ResumeListItem, SavedJob, Usage } from "./mock";
import type { Feed, Question, ShareState, SharedResume, SkillsInsight } from "./mock";

/** Per request. /readyz checks the database too, so "API up, Postgres not set up" is also demo. */
export const isDemo = cache(async () => {
  await connection();
  if ((!DEV_USER && !process.env.OIDC_ISSUER) || process.env.HUNT_DEMO === "1") return true;
  try {
    return !(await fetch(`${API_URL}/readyz`, { signal: AbortSignal.timeout(1500) })).ok;
  } catch {
    return true;
  }
});

/** GET as the signed-in user: the session cookie goes to the API as a bearer token. */
async function api<T>(path: string): Promise<T> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return send<T>(path, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
}

async function load<T>(sample: T, live: () => Promise<T>): Promise<T> {
  return (await isDemo()) ? sample : live();
}

const orNull = <T,>(p: Promise<T>) => p.catch((e) => (e instanceof ApiError && e.status === 404 ? null : Promise.reject(e)));
// List routes may be cursor-paginated ({items, next_cursor}) or bare arrays.
const items = <T,>(r: T[] | { items: T[] }) => (Array.isArray(r) ? r : r.items);

export const getUsage = cache(() =>
  load(mock.usage, async () => {
    const r = await api<{ period: string; metrics: Record<"tailored_resume" | "deep_match", { used: number; reserved: number; limit: number }> }>("/usage");
    const [y, m] = r.period.split("-").map(Number);
    const n = (k: "tailored_resume" | "deep_match") => ({ used: r.metrics[k].used + r.metrics[k].reserved, limit: r.metrics[k].limit });
    return { tailored: n("tailored_resume"), matches: n("deep_match"), resetsOn: day(new Date(Date.UTC(y, m, 1))) } satisfies Usage;
  }),
);

const day = (d: Date) => d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

export const getJobs = () => load(mock.savedJobs, async () => items(await api<SavedJob[] | { items: SavedJob[] }>("/jobs")));
export const getMatch = (id: string) => load(mock.matches.find((m) => m.id === id) ?? null, () => orNull(api<Match>(`/jobs/${id}/match`)));
export const getJob = (id: string) => load(mock.savedJobs.find((j) => j.id === id) ?? null, () => orNull(api<SavedJob>(`/jobs/${id}`)));
export const getResumes = () => load(mock.resumeList, async () => items(await api<ResumeListItem[] | { items: ResumeListItem[] }>("/resumes")));
export const getResume = (id: string) => load(mock.resumes.find((r) => r.id === id) ?? null, () => orNull(api<Resume>(`/resumes/${id}`)));

// ---- GET /v1/profile returns the mock `profile` shape plus `facts` and `draftGroups` (api/app/routes/profile.py).

type RawProfile = Profile & { facts: Fact[]; draftGroups: DraftGroup[] };

const sample = { profile: mock.profile, facts: mock.facts, drafts: mock.draftGroups };

/** Profile, confirmed facts and the draft queue, from one GET /v1/profile. */
export const getProfile = cache(() =>
  load(sample, async () => {
    const { facts, draftGroups, ...profile } = await api<RawProfile>("/profile");
    return { profile, facts, drafts: draftGroups };
  }),
);

// ---- share links and skills insight (api/app/routes/share.py, insights.py)

export const getShare = (resumeId: string) => load(mock.share, () => api<ShareState>(`/resumes/${resumeId}/share`));
export const getSkillsInsight = () => load(mock.skillsInsight, () => api<SkillsInsight>("/insights/skills"));
export const getQuestions = () => load(mock.questions, async () => (await api<{ items: Question[] }>("/enrichment-questions")).items);

const sampleShared: SharedResume = { name: mock.profile.name, templateId: "tech", sections: mock.resumes[0].sections, extras: { ...mock.resumeExtras, contact: "" } };

/** Public, no session. The viewer's address goes along for the API's per-client rate limit. Demo: only "sample" opens. */
export const getShared = (token: string, forwardedFor: string) =>
  load(token === "sample" ? sampleShared : null, () =>
    orNull(send<SharedResume>(`/shared/${encodeURIComponent(token)}`, { headers: forwardedFor ? { "X-Forwarded-For": forwardedFor } : {} })),
  );

// ---- job feed (api/app/routes/feed.py)

export type FeedQuery = { q?: string; remote?: boolean; days?: number; saved?: boolean };

const sampleFeed = (q: FeedQuery) => ({
  ...mock.feed,
  items: mock.feed.items.filter(
    (i) => (!q.remote || i.remote) && (!q.saved || i.saved) && (!q.q || `${i.title} ${i.company} ${i.location}`.toLowerCase().includes(q.q.toLowerCase())),
  ),
});

export const getFeed = (q: FeedQuery = {}) =>
  load(sampleFeed(q), () => {
    const params = new URLSearchParams();
    if (q.q) params.set("q", q.q);
    if (q.remote) params.set("remote", "true");
    if (q.days) params.set("days", String(q.days));
    if (q.saved) params.set("saved", "true");
    return api<Feed>(`/feed${params.size ? `?${params}` : ""}`);
  });
