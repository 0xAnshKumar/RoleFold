# Hunt — Handoff (2026-11-04, branch launch-readiness)

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

- No scroll-linked, pinned or scrubbed animation and no scroll-jacking (owner, 2026-11-06: polish comes from layout,
  real-DOM product visuals, hover/press, state and page transitions; craft.do is the quality bar). Honor
  prefers-reduced-motion. **Never change the cursor** (no `cursor:` rules anywhere in `src/`).
- Scope (2026-11-06): two modules only, resume creation and job hunting; tailoring is off. Plan: `docs/PRODUCT-PLAN.md`.
  Switch: `TAILORING_ENABLED` in `api/.env` (default off): POST `/v1/jobs/{id}/tailored-resume` answers 404
  `{"reason":"tailoring_off"}`, `/v1/usage` drops the tailored meter (`tailoring:false`), and the UI hides the panel.
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
  app/(app)/             jobs (tabs: For you = feed, ?tab=saved = Saved & pasted), jobs/[id] (match), resumes,
                         resumes/[id] (editor + share panel),
                         profile, settings, onboarding
  app/admin/             admin console (ops, support access, skill terms, audit log)
  app/r/[token]/         public shared resume; app/signin, app/unsubscribe
  app/kit/               design-system v2 kit: every primitive in every state, light + night (dev only; HUNT_KIT=1 in prod)
  app/fonts.ts, providers.tsx (MotionConfig + LazyMotion), BootScript.tsx (pre-paint theme + Save-Data)
  components/ui/         v2 primitives, one file each (import from the file, no barrel): Button (+ButtonLink,
                         IconButton, buttonClass), Field (Input/Textarea/Select), Choice (Checkbox/Radio/Switch),
                         Segmented, Chip (FilterChip/ChipRow/SkillChip), Status (StatusMark/VerdictMark/Badge),
                         VerdictSeal, Proof (ProofMark/FactTag/SignatureLine), Card, Tabs (TabLinks/Tabs), Disclosure,
                         Dialog (dialog/wide/drawer/sheet), Toast (ToastProvider/useToast), Skeleton, State
                         (EmptyState/ErrorState), Progress (ProgressBar/StageList), Icon; index.tsx = v1 StatusIcon/Stamp
  components/shell/      AppNav (desktop bar + morphing plate, phone top bar + tab bar + account sheet), theme.ts,
                         BottomActionBar
  components/            landing/* (v1, step 2 rebuilds it), resume/ResumePaper, app/PageHeader
  lib/api.ts             typed fetch client (bearer or X-Dev-User, Idempotency-Key, ApiError, waitFor polling)
  lib/auth.ts, app/auth/ OIDC code+PKCE login/callback/logout; ID token cookie + AES-GCM refresh-token cookie
  proxy.ts               adds the bearer to /v1/*, refreshes expiring sessions, guards app + admin routes
  lib/data.ts            server loaders + demo-mode detection
  lib/mock.ts            sample data AND the response-shape contract the API must match
  lib/templates.ts       re-exports shared/resume-templates.json
shared/resume-templates.json   single source of the 6 resume templates (frontend + backend read it)
api/                     Python 3.12+ uv project: FastAPI, SQLAlchemy 2, Alembic, psycopg, Postgres RLS
  app/core/              config, auth (OIDC JWT via JWKS + dev header), errors, idempotency, usage, storage
                         (+ write-once tombstones), parsing (sandboxed PDF/DOCX extraction subprocess), display
  app/db/                models (~32 tables), session (sets app.user_id for RLS)
  app/routes/            me, profile (experiences/facts/education/achievements/languages/career gaps), imports,
                         jobs, resumes, share, insights, feed, admin, system
  app/catalog/           job sources (Greenhouse/Lever/manual), ingest (dedupe/scam/expiry), feed ranking, alerts, cli
  app/tasks/             queue (Postgres SKIP LOCKED + leases), worker HANDLERS: import, match, tailor,
                         render (exports), regenerate, delete_user, catalog_ingest, alert_digest; reapply_tombstones (restore runbook CLI); llm.py = spend cap
  app/llm/               gateway.py (only module that talks to Gemini), schemas.py, prompts/*.md
  app/truth/             redact, numbers, checks (statement truth checks), verb_classes.yaml, verdict, url_paste,
                         aliases (curator-approved skill aliases)
  app/render.py          PDF via Typst (vendored fonts in api/fonts) + DOCX via python-docx
  alembic/               bootstrap.sql (roles), versions 0001–0009 (0005 achievements/languages, 0006 share links,
                         0007 catalog, 0008 admin role + skill_aliases, 0009 career_gaps.status)
  tests/                 unit + DB (testcontainers) + live (opt-in)
  Dockerfile             one image for API, workers, migrations (build from repo root)
docs/                    PRD, TRD, Side Questions, DESIGN.md, HANDOFF.md, reviews/
```

## 4. How to run

```bash
# Frontend (demo mode = sample data, works with no backend)
npm install && npx next dev -p 3100            # http://localhost:3100
npm run build && npx eslint src && npx tsc --noEmit && npm test   # Node 24 (.nvmrc)

# Backend
cd api && uv sync
uv run pytest -q          # 253 pass + 2 skipped (live tests); DB tests need Docker running
uv run ruff check app tests
RUN_LIVE_LLM=1 uv run pytest tests/live -s     # opt-in real Gemini smoke test (costs ~cents)
```

**Live mode** (real API + DB): Postgres → run `api/alembic/bootstrap.sql` → set passwords in `api/.env` →
`alembic upgrade head` as hunt_owner → `uvicorn app.main:app --port 8000` → worker (`python -m app.tasks.worker`,
from `api/`) → frontend `.env.local` with `API_URL=http://127.0.0.1:8000` and
`NEXT_PUBLIC_DEV_USER=<any id>` (the API needs `DEV_AUTH=1` in `api/.env` to accept it). Demo mode turns on when both `NEXT_PUBLIC_DEV_USER` and `OIDC_ISSUER` are unset,
`HUNT_DEMO=1`, or `/readyz` fails.

**Real login (OIDC, any provider):** frontend `.env.local`: `OIDC_ISSUER`, `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET`,
`APP_URL`; `api/.env`: the same `OIDC_ISSUER` and `OIDC_AUDIENCE=<client id>` (the API verifies the ID token).
Register redirect `{APP_URL}/auth/callback`, post-logout `{APP_URL}/`, scopes `openid email profile`. Issuer
and audience must match on both sides or users bounce between sign-in and 401. Set `SESSION_SECRET` (32+ chars) in the
frontend to keep users signed in via refresh tokens (provider must offer `offline_access`). Admins:
`ADMIN_SUBJECTS` or `ADMIN_ROLE_CLAIM`/`ADMIN_ROLE`, plus `ADMIN_DATABASE_URL` (hunt_admin, BYPASSRLS; created in
`bootstrap.sql`). Job feed: `CATALOG_SOURCES` (empty = off) + hourly cron `uv run python -m app.catalog.cli tick`;
alerts need `SMTP_*` (log-only otherwise). Worker pools: `python -m app.tasks.worker --types import,match`.
All of this is documented in `api/README.md` and the `.env.example` files. Tombstones: `TOMBSTONE_DIR` (WORM bucket in prod); restore runbook in
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

Everything in PRD/TRD launch scope plus the formerly deferred features is built, on branch `launch-readiness`
(not merged to `main`). Checks on 2026-11-04: backend 253 pass + 2 skipped (DB tests ran), ruff, eslint, tsc,
`npm test`, `npm run build` clean; `npm audit --omit=dev` 0 vulnerabilities; Next.js 16.4.5.

- Core: landing; all app screens with every state; demo mode; 6 ATS templates (now with a languages section)
  PDF + DOCX; import → paste job → match → tailor → edit → export; profile, goals, prefs; usage limits.
- Login: provider-agnostic OIDC with refresh tokens; admin console with audited support access, DLQ replay,
  skill-alias curator (aliases applied on import and job extraction), ops stats.
- Truth/privacy: redaction header bug fixed, placeholders restored or blocked, "N+ years" judged in code from role
  dates, match notes say "you".
- Data: tombstones outside the DB + re-apply CLI; zip export with files; account deletion clears the session.
- Uploads: sandboxed parser (subprocess, rlimits, seccomp no-network on Linux), PDFium fallback, page/char limits.
- Profile: projects, career breaks, achievements, publications, languages (imported as drafts to confirm),
  enrichment questions, "Update with new facts".
- New features: job feed (code-only preliminary fit, learned ranking, weekly alerts; no source enabled),
  skills insight, revocable shareable resume links.
- QA: a live run with real Gemini and Postgres passed every flow after 8 fixes; a design pass removed non-proof
  yellow, pill shapes and mono eyebrow labels from the app and fixed 390px layouts.

**Design system v2, step 1 (foundation) done 2026-11-06** (DESIGN.md 6.8): tokens + v1 aliases in globals.css,
fonts, `public/brand/` (scripts in `scripts/brand/`), providers, primitives, app shell, `/kit`. Nav is Jobs / Resume /
Profile (+ Settings under the avatar); `/feed` → `/jobs`, `/skills` → `/profile#skills` (next.config redirects). Old
screens still use v1 CSS through the aliases until steps 3-7 rebuild them. Known: first-load JS on `/jobs` is ~197 KB
gzip against a 150 KB budget; the Next 16 + React 19 runtime alone is ~151 KB.

## 8. Open items (owner)

1. Pick the OIDC provider, register the app, set env vars, do one real sign-in (incl. admin role claim).
2. Google billing ON (the free tier also caps the writer model at 20 requests/day; QA hit it), **rotate the
   Gemini key**, real Postgres, product name. Then rerun `RUN_LIVE_LLM=1 uv run pytest tests/live -s`: the writer
   model's new no-employer-suffix rule and the verifier haven't been live-checked.
3. Production: `TOMBSTONE_DIR` on an object-locked bucket; build `api/Dockerfile`; confirm seccomp parser on a real
   x86_64 host (tested on arm64 only).
4. Job feed: approve sources per market (T-OQ-2) before setting `CATALOG_SOURCES`; untested against real
   Greenhouse/Lever responses and real SMTP.
5. Confirm: an outdated master now also shows "Update with new facts" when the confirmed profile has moved on
   (beyond TRD §16.2 wording; QA change).
6. Spec questions (PRD OQ-1..9, TRD T-OQ-1..7): launch professions, beta size, pricing, legal review, LinkedIn,
   ESCO licence (no taxonomy exists; skill ids come only from curator aliases), data residency.
7. Known limits (`shortcut:` comments mark most): other people's names/nicknames aren't redacted (accepted, D12);
   share-link rate limit is per process; refresh de-dup is per Next instance; digest email can resend if the commit
   fails after sending; "5+ years of React" is judged on total role years; feed has no full-text index; partition/
   replicas/Redis not built (triggers in `api/README.md`); dev-only npm advisory (minimatch) needs a breaking
   upgrade. A rare flaky DB test (a worker task ends `failed` instead of `succeeded`; ~1 in 10+ full runs, not
   reproduced in 40 reruns) is unexplained.

## 9. Decisions made by agents (owner may still override)

Dev auth header (`X-Dev-User`) only with `DEV_AUTH=1` and `ENV` development/test (the proxy strips client-sent ones); 402 `PLAN_LIMIT_REACHED` for limits; 50k-char paste cap and
200-char minimum (`PASTE_TOO_SHORT`); verifier is a different Gemini model (not a different family, as TRD
wanted) because only a Gemini key exists; DOCX uses Times New Roman / Calibri / Arial / Cambria (PDF uses
vendored Tinos / Carlito / Arimo / Libertinus); master resumes are free, tailored resumes count; achievements/languages/career breaks are removed and
re-added rather than edited; draft languages are confirmed on the profile, not in onboarding. Imported career breaks
are drafts with show-on-resume on (they were on the user's own resume); a break without a readable start month is
not imported.

## 10. Tooling notes

gstack skills were installed at `~/.claude/skills/gstack` (reinstall from github.com/garrytan/gstack if
gone); its state lives in `~/.gstack/projects/Hunt-RAG/` (copies in `docs/reviews/`). Headless browser for
screenshots: `~/.claude/skills/gstack/browse/dist/browse`. Codex CLI was too old for outside reviews.
