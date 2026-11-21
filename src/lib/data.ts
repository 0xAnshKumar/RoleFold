// Server-side loaders for the app screens. Each returns the src/lib/mock.ts shape, always from the API: there is
// no sample-data mode (owner, 2026-11-21). An unreachable API surfaces as the screen's error state.
import { cookies } from "next/headers";
import { cache } from "react";
import { ApiError, api as send } from "./api";
import { SESSION_COOKIE } from "./auth";
import type { DraftGroup, Fact, Match, Profile, Resume, ResumeListItem, SavedJob, Usage } from "./mock";
import type { ShareState, SharedResume, SkillsInsight } from "./mock";

// shortcut: demo mode is gone, so this is always false and every `demo` prop below is dead; delete them when next
// touching those screens.
export const isDemo = cache(async () => false);

/** GET as the signed-in user: the session cookie goes to the API as a bearer token. */
async function api<T>(path: string): Promise<T> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return send<T>(path, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
}

const orNull = <T,>(p: Promise<T>) => p.catch((e) => (e instanceof ApiError && e.status === 404 ? null : Promise.reject(e)));
// List routes may be cursor-paginated ({items, next_cursor}) or bare arrays.
const items = <T,>(r: T[] | { items: T[] }) => (Array.isArray(r) ? r : r.items);

export const getUsage = cache(() =>
  (async () => {
    const r = await api<{ tailoring?: boolean; period: string; metrics: Record<"tailored_resume" | "deep_match", { used: number; reserved: number; limit: number }> }>("/usage");
    const [y, m] = r.period.split("-").map(Number);
    const n = (k: "tailored_resume" | "deep_match") => ({ used: r.metrics[k].used + r.metrics[k].reserved, limit: r.metrics[k].limit });
    return { tailored: r.tailoring ? n("tailored_resume") : null, matches: n("deep_match"), resetsOn: day(new Date(Date.UTC(y, m, 1))) } satisfies Usage;
  })(),
);

export type AiProvider = "gemini" | "anthropic" | "openai";
export type AiKey = { available: boolean; set: boolean; last4: string | null; provider?: AiProvider | null; added_at?: string | null };
/** Own AI key state (never the key). A server without AI_KEY_ENCRYPTION_KEY says available: false. */
export const getAiKey = () => api<AiKey>("/me/ai-key");

const day = (d: Date) => d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

export const getJobs = () => api<SavedJob[] | { items: SavedJob[] }>("/jobs").then(items);
export const getMatch = (id: string) => orNull(api<Match>(`/jobs/${id}/match`));
export const getJob = (id: string) => orNull(api<SavedJob>(`/jobs/${id}`));
export const getResumes = () => api<ResumeListItem[] | { items: ResumeListItem[] }>("/resumes").then(items);
export const getResume = (id: string) => orNull(api<Resume>(`/resumes/${id}`));

// ---- GET /v1/profile returns the mock `profile` shape plus `facts` and `draftGroups` (api/app/routes/profile.py).

type RawProfile = Profile & { facts: Fact[]; draftGroups: DraftGroup[] };

/** Profile, confirmed facts and the draft queue, from one GET /v1/profile. */
export const getProfile = cache(() =>
  api<RawProfile>("/profile").then(({ facts, draftGroups, ...profile }) => ({ profile, facts, drafts: draftGroups })),
);

// ---- share links and skills insight (api/app/routes/share.py, insights.py)

export const getShare = (resumeId: string) => api<ShareState>(`/resumes/${resumeId}/share`);
export const getSkillsInsight = () => api<SkillsInsight>("/insights/skills");

/** Public, no session. The viewer's address goes along for the API's per-client rate limit. */
export const getShared = (token: string, forwardedFor: string) =>
  orNull(send<SharedResume>(`/shared/${encodeURIComponent(token)}`, { headers: forwardedFor ? { "X-Forwarded-For": forwardedFor } : {} }));
