# Hunt — Handoff (2026-11-04)

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
- Don't commit unless asked. Commit `c252ba6` holds the project up to 2026-10-12; the 2026-11-04 work below is
  uncommitted.
- Never paste secrets in chat; keys live in `api/.env` (gitignored). Never print `api/.env`.
- Owner does DB/infra setup themselves.

## 3. Repo map

```
src/                     Next.js 16.4 App Router, React 19.3, TS, CSS Modules, Motion 14
  app/page.tsx           landing (HeroDesk, Story, Sections, WhoFor, Receipt, FAQ)
  app/(app)/             jobs, jobs/[id] (match), resumes, resumes/[id] (editor), profile, settings, onboarding
  components/            Nav, ui.tsx (StatusIcon/Stamp/Seal), landing/*, resume/ResumePaper
  lib/api.ts             typed fetch client (bearer or X-Dev-User, Idempotency-Key, ApiError, waitFor polling)
  lib/auth.ts, app/auth/ OIDC code+PKCE login/callback/logout; session = ID token in httpOnly cookie
  proxy.ts               adds the bearer to /v1/* and redirects signed-out users to /signin
  lib/data.ts            server loaders + demo-mode detection
  lib/mock.ts            sample data AND the response-shape contract the API must match
  lib/templates.ts       re-exports shared/resume-templates.json
shared/resume-templates.json   single source of the 6 resume templates (frontend + backend read it)
api/                     Python 3.12+ uv project: FastAPI, SQLAlchemy 2, Alembic, psycopg, Postgres RLS
  app/core/              config, auth (OIDC JWT via JWKS + dev header), errors, idempotency, usage, storage
                         (+ write-once tombstones), parsing (sandboxed PDF/DOCX extraction subprocess), display
  app/db/                models (~32 tables), session (sets app.user_id for RLS)
  app/routes/            me, profile (experiences/facts/education), imports, jobs, resumes, system
  app/tasks/             queue (Postgres SKIP LOCKED + leases), worker HANDLERS: import, match, tailor,
                         render (exports), regenerate, delete_user; reapply_tombstones (restore runbook CLI); llm.py = spend cap
  app/llm/               gateway.py (only module that talks to Gemini), schemas.py, prompts/*.md
  app/truth/             redact, numbers, checks (statement truth checks), verb_classes.yaml, verdict, url_paste
  app/render.py          PDF via Typst (vendored fonts in api/fonts) + DOCX via python-docx
  alembic/               bootstrap.sql (roles), versions 0001–0005 (0005: achievements, languages)
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
uv run pytest -q          # 212 pass + 1 skipped live test; DB tests need Docker running
uv run ruff check app tests
RUN_LIVE_LLM=1 uv run pytest tests/live -s     # opt-in real Gemini smoke test (costs ~cents)
```

**Live mode** (real API + DB): Postgres → run `api/alembic/bootstrap.sql` → set passwords in `api/.env` →
`alembic upgrade head` as hunt_owner → `uvicorn app.main:app --port 8000` → worker (`python -m app.tasks.worker`,
from `api/`) → frontend `.env.local` with `API_URL=http://127.0.0.1:8000` and
`NEXT_PUBLIC_DEV_USER=<any id>`. Demo mode turns on when both `NEXT_PUBLIC_DEV_USER` and `OIDC_ISSUER` are unset,
`HUNT_DEMO=1`, or `/readyz` fails.

**Real login (OIDC, any provider):** frontend `.env.local`: `OIDC_ISSUER`, `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET`,
`APP_URL`; `api/.env`: the same `OIDC_ISSUER` and `OIDC_AUDIENCE=<client id>` (the API verifies the ID token).
Register redirect `{APP_URL}/auth/callback`, post-logout `{APP_URL}/`, scopes `openid email profile`. Issuer
and audience must match on both sides or users bounce between sign-in and 401. No refresh tokens: users sign in
again when the ID token expires (~1h). Tombstones: `TOMBSTONE_DIR` (WORM bucket in prod); restore runbook in
`api/README.md` (`python -m app.tasks.reapply_tombstones`, needs `RESTORE_DATABASE_URL` with BYPASSRLS). Frontend proxies `/v1/*` to `API_URL` (no CORS).

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
6 ATS templates with PDF + DOCX export; full pipeline import → paste job → match → tailor → edit → export;
profile/goals/prefs; facts and education confirm; job status, gap marking, feedback; usage meter; account deletion.

Added 2026-11-04 (all tests green, 212 backend incl. DB tests; eslint, tsc, build clean):
- Production login: provider-agnostic OIDC (backend JWKS validation, frontend code+PKCE, sign-in page, sign-out).
  Smoke-tested against a local fake provider only, not yet a real one.
- `redact()` address rules apply only to real resume headers (`header=True`, import only).
- Tailor and match restore redaction placeholders from one shared map; lines with leftover placeholders are blocked.
- Deletion tombstones written outside the DB (at request and in the worker) + re-apply CLI and runbook.
- Uploads: sandboxed parsing subprocess (timeout, rlimits, empty env), PDFium fallback extractor (pypdfium2),
  10-page / 50k-char limits (413 FILE_TOO_LARGE), no orphan files on failed requests, `NO_EXTRACTABLE_TEXT` only.
- Gaps closed: draft facts under projects (incl. new project), onboarding enrichment questions (code, no AI) and
  draft edit, "Update with new facts" (regenerate master as next version), career breaks, achievements and
  publications (profile + resumes), export is a zip with data.json + uploads + resume files, languages stored.
- Next.js 16.4.0 → 16.4.5 (critical RCE advisories fixed).

## 8. Open items

No code items left for launch scope. Remaining work is owner setup / decisions:
1. Pick the OIDC provider, register the app, set env vars, and do one real sign-in end to end.
2. Real Postgres; Google billing ON before any real user data; **rotate the Gemini key**; choose the product name.
3. Production: `TOMBSTONE_DIR` on an object-locked bucket; run upload parsing in a no-network container/nsjail
   (`shortcut:` in `api/app/core/parsing.py`; RLIMIT_AS is ignored on macOS).
4. Owner sign-off needed: a languages section in resume templates (would change DESIGN.md template orders).
5. Spec open questions (PRD OQ-1..9, TRD T-OQ-1..7): launch professions, beta size, pricing, legal review,
   LinkedIn, ESCO licence, data residency.
6. Later (TODOS, deferred by owner on 2026-11-04): catalog feed + alerts, skills insight, shareable resume link,
   admin console, scale-out. Landing page keeps its own expressive radius/pill rules (owner, 2026-11-04).
7. Known limits: no refresh tokens; other people's names/nicknames aren't redacted; garbled PDF text made of normal
   letters passes the quality check; dev-only npm advisories (minimatch via eslint tooling) need a breaking upgrade.

## 9. Decisions made by agents (owner may still override)

Dev auth header only in non-production; 402 `PLAN_LIMIT_REACHED` for limits; 50k-char paste cap and
200-char minimum (`PASTE_TOO_SHORT`); verifier is a different Gemini model (not a different family, as TRD
wanted) because only a Gemini key exists; DOCX uses Times New Roman / Calibri / Arial / Cambria (PDF uses
vendored Tinos / Carlito / Arimo / Libertinus); master resumes are free, tailored resumes count; achievements/languages/career breaks are removed and
re-added rather than edited; draft languages are confirmed on the profile, not in onboarding.

## 10. Tooling notes

gstack skills were installed at `~/.claude/skills/gstack` (reinstall from github.com/garrytan/gstack if
gone); its state lives in `~/.gstack/projects/Hunt-RAG/` (copies in `docs/reviews/`). Headless browser for
screenshots: `~/.claude/skills/gstack/browse/dist/browse`. Codex CLI was too old for outside reviews.
