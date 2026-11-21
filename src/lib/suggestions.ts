// Improve: plain-code suggestions over the user's confirmed profile. No model call, and nothing is ever rewritten for
// the user: each suggestion asks them to edit their own words, answer a question, or fill a gap on their profile.
// Line rules follow Resume Matcher's writing checks (github.com/srbhr/Resume-Matcher, Apache-2.0), re-expressed, plus
// Google's XYZ test (Laszlo Bock): "Accomplished [X] as measured by [Y], by doing [Z]". One card per line, worst first.

import { toMonth } from "./jobSearch.ts";

export type Severity = "fix" | "consider";
type Base = { id: string; severity: Severity; title: string; why: string };
export type Suggestion =
  | (Base & { kind: "edit"; fact: { id: string; version?: number; text: string; role: string }; hint?: string })
  | (Base & { kind: "link"; href: string; action: string });

type FactLike = { id: string; role: string; text: string; version?: number };
type ProfileLike = {
  email?: string | null;
  phone?: string | null;
  drafts: number;
  roles: { id: string; title: string; org: string; dates: string; factIds: string[] }[];
  skills: { name: string; evidence: number }[];
  education: unknown[];
  gaps: { dates: string }[];
};

const WEAK = /^(responsible for|helped(?: with| to)?|assisted(?: with| in)?|involved in|participated in|worked on|tasked with|duties included|in charge of)\b/i;
const FIRST_PERSON = /\bI\b|\b(me|my)\b/i;
// X in XYZ: a word that says something changed. A line with neither this nor a number only lists duties.
const RESULT = /\b(cut|cutting|reduc\w*|increas\w*|grew|grow\w*|improv\w*|sav(?:ed|es|ing)|rais\w*|lower\w*|boost\w*|doubl\w*|tripl\w*|halv\w*|sped|faster|fewer|decreas\w*|eliminat\w*|prevent\w*|won|resolv\w*|so that|result\w* in|leading to|which led)\b/i;
const DIGIT = /\d/;
const XYZ_HINT = "What changed, by how much (from what to what), and how you did it.";
const LONG_WORDS = 40; // XYZ lines (result, measure, method) run longer than plain duty lines
const GAP_MONTHS = 6;

const words = (t: string) => t.trim().split(/\s+/).filter(Boolean);
const monthName = (m: number) => `${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][m % 12]} ${Math.floor(m / 12)}`;

/** Every suggestion for this profile, fixes first. */
export function suggest(profile: ProfileLike, facts: FactLike[], now = new Date()): Suggestion[] {
  const out: Suggestion[] = [];
  // Ids carry the fact version, so an edited line is checked afresh and an old dismissal no longer hides it.
  const key = (rule: string, f: FactLike) => `${rule}:${f.id}:${f.version ?? 0}`;

  if (profile.drafts > 0)
    out.push({
      id: `drafts:${profile.drafts}`, kind: "link", severity: "fix", href: "/onboarding?step=confirm", action: "Confirm entries",
      title: `${profile.drafts} entr${profile.drafts === 1 ? "y" : "ies"} still to confirm`,
      why: "Only what you confirm goes on your resume. Unconfirmed work is left out.",
    });

  for (const r of profile.roles)
    if (!r.factIds.length)
      out.push({
        id: `empty-role:${r.id}`, kind: "link", severity: "fix", href: profile.drafts ? "/onboarding?step=confirm" : "/profile#exp", action: profile.drafts ? "Confirm entries" : "Add what you did",
        title: `Nothing confirmed under ${[r.title, r.org].filter(Boolean).join(", ") || "one of your roles"}`,
        why: "A role with no lines looks empty to a recruiter. Add one or two things you did there.",
      });

  for (const f of facts) {
    const opener = f.text.trim().match(WEAK)?.[1];
    const n = words(f.text).length;
    const card = (rule: string, severity: Severity, title: string, why: string, hint?: string): Suggestion => ({ id: key(rule, f), kind: "edit", severity, fact: f, title, why, hint });
    const c = opener
      ? card("weak", "fix", `“${opener[0].toUpperCase()}${opener.slice(1).toLowerCase()}” hides what you did`, "Start with what you did yourself, like built, fixed, ran or led. Keep it true to your part.", XYZ_HINT)
      : !DIGIT.test(f.text)
        ? RESULT.test(f.text)
          ? card("no-number", "consider", "Add a number", "You say what changed; a number shows by how much, ideally from what to what (4s to 2.1s). Add one only if you know it.", XYZ_HINT)
          : card("no-measure", "consider", "Can you measure it?", "Strong lines give the result, how it was measured and how you got there (Google’s XYZ formula). This one has no measure yet: a number, a before and after, or who it reached. Add it only if it’s true.", XYZ_HINT)
          : FIRST_PERSON.test(f.text)
            ? card("first-person", "consider", "Drop “I” and “my”", "Resume lines read best without them: “Cut load time…”, not “I cut load time…”.")
            : n > LONG_WORDS
              ? card("long", "consider", `A long line (${n} words)`, "Recruiters skim. Cut it to what changed, by how much and how, or split it in two.")
              : null;
    if (c) out.push(c);
  }

  // Same first word on 3+ lines of one role (Resume Matcher's repeated_opener).
  for (const r of profile.roles) {
    const counts = new Map<string, number>();
    for (const f of facts.filter((x) => r.factIds.includes(x.id))) {
      const w = words(f.text)[0]?.toLowerCase().replace(/[^a-z]/g, "");
      if (w) counts.set(w, (counts.get(w) ?? 0) + 1);
    }
    for (const [w, c] of counts)
      if (c >= 3)
        out.push({
          id: `repeat:${r.id}:${w}`, kind: "link", severity: "consider", href: "/profile#exp", action: "Edit on your profile",
          title: `${c} lines under ${r.title || "one role"} start with “${w[0].toUpperCase()}${w.slice(1)}”`,
          why: "Vary the first word so each line stands out.",
        });
  }

  // Gaps of 6+ months between roles that no career break explains. Recording one is the user's choice.
  const spans = profile.roles
    .map((r) => r.dates.split(/\s*[–-]\s*/).map((p) => toMonth(p, now)))
    .filter((p): p is [number, number] => p.length === 2 && p[0] !== null && p[1] !== null)
    .sort((a, b) => a[0] - b[0]);
  const breaks = profile.gaps.map((g) => g.dates.split(/\s*[–-]\s*/).map((p) => toMonth(p, now)));
  let end = spans[0]?.[1] ?? 0;
  for (const [s, e] of spans.slice(1)) {
    const covered = breaks.some(([bs, be]) => bs !== null && be !== null && bs <= end + 1 && be >= s - 1);
    if (s - end >= GAP_MONTHS && !covered)
      out.push({
        id: `gap:${end}:${s}`, kind: "link", severity: "consider", href: "/profile#breaks", action: "Add a career break",
        title: `A ${s - end}-month gap: ${monthName(end)} to ${monthName(s)}`,
        why: "Recruiters often ask. You can add a career break with a reason, or leave it as it is.",
      });
    end = Math.max(end, e);
  }

  if (!profile.skills.some((k) => k.evidence > 0))
    out.push({ id: "no-skills", kind: "link", severity: "fix", href: "/profile#skills", action: "Add skills", title: "No proven skills yet", why: "Screening software looks for skills. Add the tools you used, then a line that shows each one." });
  if (!profile.education.length)
    out.push({ id: "no-education", kind: "link", severity: "consider", href: "/profile#edu", action: "Add education", title: "No education", why: "Most screening forms ask for it, even for senior roles." });
  if (!profile.email || !profile.phone)
    out.push({ id: "contact", kind: "link", severity: "fix", href: "/profile", action: "Add contact details", title: !profile.email ? "No email on your resume" : "No phone number on your resume", why: "Employers need a way to reach you. Contact details are never sent to an AI model." });

  return out.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === "fix" ? -1 : 1));
}
