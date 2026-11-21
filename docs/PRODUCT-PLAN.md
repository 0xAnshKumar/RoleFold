# RoleFold — Product plan (updated 2026-11-21)

Written by the acting CTO for the owner to read at leisure. Decisions are already in effect unless marked
"proposal". Status of the code lives in `docs/HANDOFF.md`; this file is the *why* and the *next*.

## 1. Scope now: one journey, two modules

| Step | What the user does | Where |
|---|---|---|
| 1. Upload | Upload a PDF/DOCX/TXT (or start from scratch). One "Check and build" screen: the lines we read on the left (ticked, numbers highlighted), a live resume preview on the right, contact and goals below; one button confirms and builds the first master in the recommended template. | `/onboarding` |
| 2. Improve | Plain-code suggestions on their own facts: weak openers, Google's XYZ test (what changed, by how much, how), long lines, gaps, missing sections. They edit in their own words or answer a question; nothing is rewritten for them. | `/improve` |
| 3. Pick a template | Their resume shown in all six ATS-safe templates, one recommended; pick, edit, download PDF / Word. | `/resumes` |
| 4. Find jobs | A search built from the profile (role, city, remote, proven skills), opened on LinkedIn, Naukri, Indeed, Wellfound, company career pages and Instahyre. A job they like is pasted back for an honest fit check. | `/jobs` |

**We don't list jobs** (owner, 2026-11-21: "seriously useless"). The job feed, its sources, ranking, alerts and
job reporting were removed; the big job sites already do listing better. Our value is the true resume and the
honest check. Tailoring stays **off** (`TAILORING_ENABLED=false`, §4). LaTeX/Overleaf is **dropped** (§5).

## 2. What "production grade" means here

- [x] Real resume (the owner's) imports cleanly; facts are accurate.
- [x] Job check reads every qualification in a posting and is strict about evidence.
- [x] Find jobs links checked against the live sites (2026-11-21): Naukri experience filter and LinkedIn
  "past week" apply; Wellfound role/city pages resolve.
- [x] LinkedIn remote filter confirmed signed in (2026-11-21); its experience filter is dropped by LinkedIn's AI
  search, so we don't send it.
- [ ] Indeed links (it blocks automated checks).
- [ ] "Start from scratch" path verified end to end.
- [ ] Google billing on for the Gemini key (owner). Free tier gives 503s and 20 writer calls/day.
- [ ] Phone (360-390px) pass over Improve, the template gallery and Find jobs.

## 3. Layout redesign (proposal — waits for your UI examples)

Colours and theme come later from you. These are **placement** changes only.

**Navigation.** Six items today (Jobs, Feed, Skills, Resumes, Profile, Settings) is too many and "Jobs" vs
"Feed" confuses. Proposal: **Jobs** (tabs: *For you* / *Saved & pasted*), **Resume**, **Profile** (skills
inside), and Settings under the avatar. After onboarding, land on *Jobs → For you*.

**Job check page** (today the longest, noisiest screen: ~25 requirement boxes, each with a full quote).
Proposal: top = verdict, the 3 biggest gaps, one main action. Below = requirements grouped *Proven / Partly /
Missing*, collapsed, quote on expand. "Close the gap" opens from a gap row instead of a permanent sidebar.

**Feed** (obsolete: the feed was removed 2026-11-21). Cards repeat "Uses 1 job check · 29 of 30 left" and three meta lines each. Proposal: one compact
line per card (title, company, place, early read), quota once in the header, filters in one row, the three
side panels (alerts, "what feedback changed", "where these come from") moved into a drawer.

**Onboarding confirm.** Done 2026-11-21: one check-and-build screen with a live preview (DESIGN.md 4.3).

**Resume editor.** Fine structurally; move Share to a menu and keep download buttons sticky.

Rule: redesign one journey at a time (upload → confirm → jobs → check → resume), not everything at once.

## 4. Tailoring: what must exist before it comes back

1. Every rewritten line re-verified against its cited facts by code **and** a second model (exists), plus
   a check that the rewrite does not add tools, scale words or seniority the facts lack.
2. Live evaluation set: 20+ real resume/job pairs with human-marked "overclaim" lines; ship only below an
   agreed overclaim rate.
3. A visible diff to the master resume, so the user approves each changed line.
4. Billing on and a per-user daily cap (tailoring is the most expensive AI call).

## 5. Overleaf / LaTeX (dropped 2026-11-21)

Owner: "leave the LaTeX thing." The template gallery covers the need to choose a look. If it returns: export
`.tex` + "Open in Overleaf" first; editing would need a browser TeX engine (unmaintained) or a sandboxed server one,
and hand edits can't be truth-checked.

## 6. Job sources (removed 2026-11-21)

Replaced by Find jobs (§1). The catalog tables from migration 0007 are kept, unused, until a drop migration.
Link formats live in `src/lib/jobSearch.ts`; prior art and checks in `docs/reviews/oss-research-2026-11-21.md`.

## 7. Not doing now (and why)

- Login provider choice, admin console polish, share links: built; not needed to prove the journey.
- Saving searches, alerts, applying for the user: not planned.
- Scale-out (Redis, replicas): no load yet; triggers are in `api/README.md`.
- Other people's names in resumes are not redacted before AI calls: accepted limit (CEO review D12).
