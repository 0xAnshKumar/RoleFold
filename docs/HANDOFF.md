# Hunt — Handoff (2026-10-12)

Read this first in any new session. It replaces the lost chat history. Product specs: `docs/PRD v4 …md`,
`docs/TRD v4 …md`, `docs/Side Questions …md`. Design rules: `docs/DESIGN.md` (mandatory for UI).
Past reviews and deferred work: `docs/reviews/` (CEO review, eng review, test plan, `TODOS.md`).

## 1. What Hunt is

A truthful, ATS-safe resume builder plus honest job-fit matching (India-first, global-ready).
Every resume line must trace to a fact the user confirmed; matches show a verdict seal, never a
percentage. **Launch is paste-first**: the user pastes a job description (no scraping, links are never
fetched). The job feed, alerts and skills-insight view are deferred (see `docs/reviews/TODOS.md`).
"Hunt" is a working name; Stampd was rejected (all domains taken, existing brands).

## 2. Owner's standing rules (always honour)

- No scroll-driven animation. **Never change the cursor** (no `cursor:` rules anywhere in `src/`).
- Example persona is a frontend engineer (sample user "Rohan Iyer").
- Two volumes: loud expressive landing page, calm app. No eyebrow/kicker labels above headings, SVG icons
  not text glyphs, yellow highlighter only marks proof in the app, verdict seal not gauges/percentages.
- Ask before departing from `docs/DESIGN.md`.
- AI provider is **Gemini only** (owner has a Gemini key). Use AI only where it adds real value; keep costs low.
- Don't commit unless asked (as of this handoff **nothing is committed** beyond the initial CNA commit).
- Never paste secrets in chat; keys live in `api/.env` (gitignored). Never print `api/.env`.
- Owner does DB/infra setup themselves.

## 3. Repo map

```
src/                     Next.js 16.4 App Router, React 19.3, TS, CSS Modules, Motion 14
  app/page.tsx           landing (HeroDesk, Story, Sections, WhoFor, Receipt, FAQ)
  app/(app)/             jobs, jobs/[id] (match), resumes, resumes/[id] (editor), profile, settings, onboarding
  components/            Nav, ui.tsx (StatusIcon/Stamp/Seal), landing/*, resume/ResumePaper
  lib/api.ts             typed fetch client (X-Dev-User, Idempotency-Key, ApiError, waitFor(op) polling)
  lib/data.ts            server loaders + demo-mode detection
  lib/mock.ts            sample data AND the response-shape contract the API must match
  lib/templates.ts       re-exports shared/resume-templates.json
shared/resume-templates.json   single source of the 6 resume templates (frontend + backend read it)
api/                     Python 3.12+ uv project: FastAPI, SQLAlchemy 2, Alembic, psycopg, Postgres RLS
  app/core/              config, auth (dev only!), errors, idempotency, usage reservations, storage, display
  app/db/                models (~32 tables), session (sets app.user_id for RLS)
  app/routes/            me, profile (experiences/facts/education), imports, jobs, resumes, system
  app/tasks/             queue (Postgres SKIP LOCKED + leases), worker HANDLERS: import, match, tailor,
                         render (exports), delete_user; llm.py = spend cap + cost logging
  app/llm/               gateway.py (only module that talks to Gemini), schemas.py, prompts/*.md
  app/truth/             redact, numbers, checks (statement truth checks), verb_classes.yaml, verdict, url_paste
  app/render.py          PDF via Typst (vendored fonts in api/fonts) + DOCX via python-docx
  alembic/               bootstrap.sql (roles), versions 0001–0004
  tests/                 unit + DB (testcontainers) + live (opt-in)
docs/                    PRD, TRD, Side Questions, DESIGN.md, HANDOFF.md, reviews/
```

## 4. How to run

```bash
# Frontend (demo mode = sample data, works with no backend)
npm install && npx next dev -p 3100            # http://localhost:3100
npm run build && npx eslint src && npx tsc --noEmit

# Backend
cd api && uv sync
uv run pytest -q          # 174 pass + 1 skipped live test; DB tests need Docker running
uv run ruff check app tests
RUN_LIVE_LLM=1 uv run pytest tests/live -s     # opt-in real Gemini smoke test (costs ~cents)
```

**Live mode** (real API + DB): Postgres → run `api/alembic/bootstrap.sql` → set passwords in `api/.env` →
`alembic upgrade head` as hunt_owner → `uvicorn app.main:app --port 8000` → worker (`python -m app.tasks.worker`,
from `api/`) → frontend `.env.local` with `API_URL=http://127.0.0.1:8000` and
`NEXT_PUBLIC_DEV_USER=<any id>`. Demo mode turns on when `NEXT_PUBLIC_DEV_USER` is unset, `HUNT_DEMO=1`, or
`/readyz` fails. Frontend proxies `/v1/*` to `API_URL` (no CORS).

Env files: `.env.example` (frontend), `api/.env.example` (backend). `api/.env` currently holds the Gemini
key, models and a generated `PSEUDONYM_SALT`; DB URLs still have `change-me` passwords.

## 5. AI usage and cost (decided with owner)

Gemini is called for 7 tasks only: `resume_extract`, `profile_enrich`, `job_extract` (cached by job text),
`taxonomy_pick`, `requirement_map`, `resume_write`, `statement_verify`. Everything else is code (verdict,
eligibility, number checks, ATS checks, fact selection, rendering).

| Tier | Model (in `api/.env`) | ~Price per 1M in/out |
|---|---|---|
| fast | `gemini-3.5-flash-lite` | $0.30 / $2.50 |
| writer | `gemini-3.8-flash` | $0.75 / $3.75 (intro until 31 Dec 2026, then ~2×) |
| verifier | `gemini-3.5-flash-lite` (must differ from writer) | $0.30 / $2.50 |

Controls: thinking level `low` per task; thinking tokens counted as output; daily global spend cap
`LLM_DAILY_SPEND_CAP_USD` (default 5; work waits, never switches provider); plan limits 10 tailored resumes
+ 30 match pages/month via usage reservations (released on failure); every call logged to `llm_calls` with
tokens/cost. Estimate ≈ $0.16 (~₹14) per active user/month. One full live E2E run cost $0.0137.
Gemini 2.5-pro is unavailable to new users; 3.1-pro has 0 free-tier quota.

## 6. Truth model (core differentiator)

Facts are versioned and user-confirmed; resume lines cite fact IDs. Checks: numbers must exist in cited facts
(units included), verb classes can't overstate responsibility, summary lines may only name skills/numbers from
cited facts, a second model verifies implications; failing lines get one rewrite then are withheld. Job
requirements need verbatim quotes from the posting; required/preferred labels are cross-checked with cues.
Pasted job text is datamarked as untrusted (I-4). Contact details and the user's stored name are redacted
before any model call (other people's names / nicknames / initials are NOT detected — documented limitation).

## 7. Status

Done and verified: landing page; all app screens with loading/empty/error/progress/limit states; demo mode;
6 ATS templates (Classic, Compact Tech, Modern, Campus, Combination, Academic CV) with PDF + DOCX export;
full pipeline import → paste job → match → tailor → edit (re-checked) → export; profile/goals/prefs; facts and
education confirm; job status, gap marking, feedback; usage meter; data export; account deletion (hashed
tombstone). A live E2E run with a fictional persona passed after fixing 9 integration bugs; a Codex review's
findings 2–8 were fixed afterwards.

## 8. Open items (priority order)

1. **No production login (release blocker).** `api/app/core/auth.py` only accepts `X-Dev-User` outside
   production and rejects bearer tokens. Owner has not chosen a provider yet (options discussed: Clerk,
   Supabase Auth, Auth0, Google-only via Auth.js). Backend should validate OIDC JWTs via JWKS
   (provider-agnostic); frontend needs sign-in UI + sending the bearer token instead of X-Dev-User.
2. **`redact()` address heuristic bug:** any line within the first 8 lines counts as "header", so a one-line
   fact containing words like "main/phase/block/floor" + a digit can be replaced wholesale by
   `⟦ADDRESS_n⟧` before reaching the model. Fix: apply header heuristics only to real resume headers.
3. **Placeholders can leak into resumes:** tailor never `restore()`s redaction placeholders in model output,
   so a line could show `⟦NAME_1⟧` / `⟦EMAIL_1⟧`. Restore or reject such lines.
4. Owner setup: real Postgres, Google billing ON before any real user data (free tier lets Google train on
   data), **rotate the Gemini key** (it was pasted in chat), pick the product name.
5. Pre-launch hardening: deletion tombstones outside backed-up DB (P1 in TODOS), sandboxed file parsing,
   second PDF extractor for parse-safety, 10-page upload limit, orphan upload files on failed requests.
6. Smaller gaps: "Save as draft fact" files under experiences only (no project option); onboarding
   "One quick question" and draft "Edit" stubs; "Update with new facts" and "Add a career break" stubs;
   achievements/publications have no data source; `/v1/me/export` archive lacks resume files; import error
   code naming (`NO_TEXT_FOUND` vs TRD `NO_EXTRACTABLE_TEXT`); languages from imports not stored.
7. Owner questions pending: should the landing page also follow the app's 10px radius / no-pill rules?
8. Later (TODOS): catalog feed + alerts, skills insight, shareable resume link, admin console, scale-out.

## 9. Decisions made by agents (owner may still override)

Dev auth header only in non-production; 402 `PLAN_LIMIT_REACHED` for limits; 50k-char paste cap and
200-char minimum (`PASTE_TOO_SHORT`); verifier is a different Gemini model (not a different family, as TRD
wanted) because only a Gemini key exists; DOCX uses Times New Roman / Calibri / Arial / Cambria (PDF uses
vendored Tinos / Carlito / Arimo / Libertinus); master resumes are free, tailored resumes count.

## 10. Tooling notes

gstack skills were installed at `~/.claude/skills/gstack` (reinstall from github.com/garrytan/gstack if
gone); its state lives in `~/.gstack/projects/Hunt-RAG/` (copies in `docs/reviews/`). Headless browser for
screenshots: `~/.claude/skills/gstack/browse/dist/browse`. Codex CLI was too old for outside reviews.
