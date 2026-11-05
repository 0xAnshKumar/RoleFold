# Hunt — Product plan (2026-11-06)

Written by the acting CTO for the owner to read at leisure. Decisions are already in effect unless marked
"proposal". Status of the code lives in `docs/HANDOFF.md`; this file is the *why* and the *next*.

## 1. Scope now: two modules

| Module | What the user does | State |
|---|---|---|
| **1. Create the resume** | Upload a resume (or start from scratch) → confirm the facts we read → get a master resume → edit lines → download PDF / Word | On. Being hardened to production grade. |
| **2. Hunt jobs** | After the upload, see real open jobs that fit → run a full check on one → apply on the company's own site | On. Feed ranking fixed on 2026-11-05; more job sources being added. |
| Tailor a resume to one job | Rewrite the resume for a specific posting | **Off** (`TAILORING_ENABLED=false`). Code and tests kept. See §4. |
| Login (OIDC), admin console, share links, alerts | Supporting features | Built, not the focus. Login can wait until a real launch. |

**Why tailoring is off:** it is the riskiest place for the product's promise ("every line is true"). It needs
more checks than we have today (see §4), and the two modules above deliver value without it.

## 2. The core journey (what "production grade" means here)

1. **Upload** a PDF/DOCX/TXT. Parsed in a sandbox, PDFium first (keeps word spacing), 10-page and
   50k-character limits, retries for several minutes if the AI is busy.
2. **Confirm** what we read: roles, facts, education, skills, languages, achievements, career breaks.
3. **Two exits:**
   - **Resume:** create the master resume, edit, export. All lines trace to confirmed facts.
   - **Jobs:** the feed ranks real jobs by confirmed skills, goal roles, experience level and location;
     "Check this job" gives an honest verdict with the posting's own words as evidence.

Production-grade checklist for these two paths (owner can tick these off):

- [x] Real resume (the owner's) imports cleanly; facts are accurate.
- [x] Feed shows only jobs in the preferred country, demotes roles far above the user's level.
- [x] Job check reads every qualification in a posting and is strict about evidence.
- [ ] Enough suitable jobs in the feed (more India boards with junior roles — in progress).
- [ ] "Start from scratch" path verified end to end (in progress).
- [ ] P1 security: verified TLS for email, dev-login header impossible in production (in progress).
- [ ] Google billing on for the Gemini key (owner). Free tier gives 503s and 20 writer calls/day.
- [ ] Hosting: Postgres, object storage, the API Docker image, an hourly `catalog tick` cron.

## 3. Layout redesign (proposal — waits for your UI examples)

Colours and theme come later from you. These are **placement** changes only.

**Navigation.** Six items today (Jobs, Feed, Skills, Resumes, Profile, Settings) is too many and "Jobs" vs
"Feed" confuses. Proposal: **Jobs** (tabs: *For you* / *Saved & pasted*), **Resume**, **Profile** (skills
inside), and Settings under the avatar. After onboarding, land on *Jobs → For you*.

**Job check page** (today the longest, noisiest screen: ~25 requirement boxes, each with a full quote).
Proposal: top = verdict, the 3 biggest gaps, one main action. Below = requirements grouped *Proven / Partly /
Missing*, collapsed, quote on expand. "Close the gap" opens from a gap row instead of a permanent sidebar.

**Feed.** Cards repeat "Uses 1 job check · 29 of 30 left" and three meta lines each. Proposal: one compact
line per card (title, company, place, early read), quota once in the header, filters in one row, the three
side panels (alerts, "what feedback changed", "where these come from") moved into a drawer.

**Onboarding confirm.** Every fact shows 4 level buttons + Edit + Confirm. Proposal: pre-select a level,
one "Confirm all" at the top, and only call out facts that contain numbers (those are what users skip).

**Resume editor.** Fine structurally; move Share to a menu and keep download buttons sticky.

Rule: redesign one journey at a time (upload → confirm → jobs → check → resume), not everything at once.

## 4. Tailoring: what must exist before it comes back

1. Every rewritten line re-verified against its cited facts by code **and** a second model (exists), plus
   a check that the rewrite does not add tools, scale words or seniority the facts lack.
2. Live evaluation set: 20+ real resume/job pairs with human-marked "overclaim" lines; ship only below an
   agreed overclaim rate.
3. A visible diff to the master resume, so the user approves each changed line.
4. Billing on and a per-user daily cap (tailoring is the most expensive AI call).

## 5. Overleaf / LaTeX (proposal)

Why it matters: many Indian engineers keep their resume in Overleaf (e.g. "Jake's Resume"). Meeting them
there removes a reason to leave Hunt.

**Do, in order:**
1. **Paste or upload `.tex` → import.** Add LaTeX as an import format; strip commands to text, feed the
   normal import. Users then confirm facts as usual. Cheap (about a day), biggest pull.
2. **"Code view" of a Hunt resume.** Show the source behind the chosen template and let users change layout
   (spacing, fonts, section order) with a live preview. Hunt already renders with **Typst** (a modern LaTeX
   alternative) which compiles in milliseconds and runs in the browser (WebAssembly), so preview costs no
   server time. Content stays tied to facts; editing a line's words goes back through the truth checks.
3. **Full LaTeX compile — only if users ask.** Needs a TeX engine (e.g. Tectonic) in a sandbox: no
   shell-escape, no file reads outside the job, CPU/time/memory limits, no network — the same isolation as
   our resume parser. Every compiled PDF must still pass the screening-software (ATS) check.

**Don't:** build an Overleaf clone (projects, collaboration, bibliographies, any package); let code mode
bypass the truth checks; run LaTeX with shell-escape on a server; ship pretty templates that ATS can't read.

## 6. Job sources (in progress)

Today: Greenhouse and Lever boards for 7 companies (~1,150 jobs, mostly senior or outside India), so the
feed showed ~6 suitable jobs for a 1.4-year engineer. Adding Ashby and one more ATS, plus 15–30 Indian
company boards with junior roles. Each board still needs your terms decision (T-OQ-2) before production.
Later: let users paste any job link's text (already supported) and save it into the same feed.

## 7. Not doing now (and why)

- Login provider choice, admin console polish, share links, email alerts: built; not needed to prove the
  two modules.
- Scale-out (Redis, replicas): no load yet; triggers are in `api/README.md`.
- Other people's names in resumes are not redacted before AI calls: accepted limit (CEO review D12).
