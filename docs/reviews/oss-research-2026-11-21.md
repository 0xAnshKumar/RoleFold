# Open-source prior art (checked 2026-11-21)

For steps 2 (Find jobs links) and 4 (suggestions) of the new journey. Ideas only unless the licence allows reuse.

## Find jobs: search link formats (undocumented by the sites; verify in a real browser, keep in one constants file)

| Site | Format | Confidence |
|---|---|---|
| LinkedIn | `linkedin.com/jobs/search/?keywords=…&location=…&f_WT=2&f_TPR=r604800` (f_WT 1 onsite/2 remote/3 hybrid) | verified signed in: f_WT, f_TPR apply; f_E (experience) is dropped by LinkedIn's AI search |
| Indeed | `in.indeed.com/jobs?q=…&l=…&fromage=7` (remote: `sc=0kf:attr(DSQF7);`) | unverified (403 to bots) |
| Naukri | `naukri.com/react-developer-jobs-in-bengaluru?k=…&l=…&experience=3` | verified 2026-11-21: experience=7 cut 542 results to 241, all ranges include 7 years |
| Wellfound | `wellfound.com/role/l/<role-slug>/<city>`, remote `wellfound.com/role/r/<role-slug>` | verified; fixed role slugs only |
| Instahyre | no verified deep link | link home page or Google `site:instahyre.com` |
| Google | `(site:boards.greenhouse.io OR site:jobs.lever.co OR site:jobs.ashbyhq.com OR site:apply.workable.com) "react" "Bengaluru"` | plain query, no code needed |

## Suggestions: rules worth borrowing

- **Resume Matcher** (github.com/srbhr/Resume-Matcher, Apache-2.0, may copy with notice): `apps/backend/app/services/writing_quality.py`.
  Hard: weak openers ("responsible for", "helped", "assisted", "involved in", "participated in", "worked on",
  "tasked with", "duties included", "in charge of"). Soft: first person, AI-sounding phrases, >35 words,
  no digit, same opener on 3+ bullets. `ats.py`: section completeness by heading, mixed date formats.
- **Reactive Resume** (github.com/reactive-resume/reactive-resume, MIT): `plugins/reactive-resume/skills/resume-bullet-writer/references/verb-bank.md`,
  verbs grouped by ownership level (fits our verb classes) and a duty-phrase rewrite list; warns that power-verb stacking reads as AI.
- **OpenResume** (AGPL, ideas only): "what a parser reads from your PDF" view.

## Template gallery

Reactive Resume (MIT) describes each template with suitable roles and style tags; it has no auto-recommendation,
and most of its templates are two-column (not ATS-safe for us).
