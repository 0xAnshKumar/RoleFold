# RoleFold review and roadmap (2026-11-13)

This is a review of the whole repo (backend, worker, migrations, prompts, ingestion, frontend, tests, docs), written before any changes. Key claims were spot-checked by hand: no LICENSE, boilerplate README, 13 craft.do screenshots, `api/.env` ignored, `tailoring_enabled=False` (`api/app/core/config.py:18`), `task_lease_seconds=300`, `llm_daily_spend_cap_usd=5.0`.

## Summary

**Recommended order:**
1. Publish cleanup.
2. Then #2 → #3 → #4 → #8 → #7 → #10 from the roadmap below.

That gives a fast, honest, public repo with measured pgvector numbers in about 1–2 weeks.

**Decisions to make:**
1. Do the publish cleanup and then make the repo public?
   - For the craft.do screenshots in history, choose one: rewrite that commit, or publish a fresh repo.
2. Which roadmap items to start with.

**Resume corrections (current claims vs reality):**
- "7-task Gemini pipeline": 7 tasks are registered but only 5 are called. Say "5-stage", or delete the 2 dead tasks.
- "250+ tests": the real count is 273, but 77 need Docker, there is no CI, and the last full run was 2026-11-04.
- "~$0.16/user/month" is an estimate, not a measurement. Say "estimated", or measure it.
- Tailoring is off by default, and no ATS sources are enabled. Today the product works only on pasted jobs.

---

## 1. What exists today (items marked **C** correct earlier claims)

**Size:** `api/app` 61 files / ~7.8k LOC · `api/tests` 38 / 3.8k · `api/alembic` 12 / 1.2k (migrations 0001–0009) · `src/` (Next 16.4, React 19.3) 145 / 16.7k · `docs/` 27 / 3.7k.

- **C, name:** the code says "Hunt" everywhere: FastAPI title, `USER_AGENT` in `catalog/sources.py:28`, `smtp_from`. "RoleFold" appears nowhere.
- **Data model:** about 32 tables (`db/models.py`).
  - Profile: `users`, `profiles`, `experiences/projects/education`, `facts` + `fact_versions` (immutable versions, draft/confirmed), `user_skills`, `preference_versions`, `career_goals`.
  - Jobs: `jobs/job_versions/job_requirements/job_eligibility` (each user owns their copy), `match_analyses`.
  - Resumes: `resumes`, `resume_drafts`, `resume_versions` (immutable), `resume_exports`, `share_links`.
  - Catalog: `catalog_jobs` (global, no RLS), `catalog_source_runs`, `catalog_feedback`, `feed_settings`.
  - System: `tasks`, `usage_counters/reservations`, `idempotency_keys`, `llm_calls`, `audit_log`, `skill_aliases`.
- **Auth/RLS:** OIDC ID token checked against the provider's keys (`core/auth.py`). A dev header works only with `DEV_AUTH=1`.
  - Every request sets `app.user_id` with SET LOCAL. Row security is forced on all tables.
  - There are 4 DB roles (`bootstrap.sql`): owner, app, worker, and admin (bypasses RLS). This is solid.
- **Request → worker flow:** the API writes the record and enqueues in the same transaction, then returns 202 with an operation.
  - The frontend polls `/v1/tasks/{id}` (`src/lib/api.ts:88`).
  - The worker (`tasks/worker.py`) claims one task at a time (SKIP LOCKED + lease) and runs the handler. The handler's effects and the completion commit together.
  - It retries with backoff, dead-letters after 5 attempts, and the admin console can replay.
- **LLM pipeline:** **C:** 7 tasks are registered (`llm/gateway.py:76`), but only 5 are ever called. `profile_enrich` and `taxonomy_pick` are dead code: enrichment questions are generated in code (`routes/profile.py:658`).
  - Match: `job_extract` → quotes checked against the posting → evidence pack → `requirement_map`. The verdict is decided in code.
  - Resume: `resume_write` → code truth checks → `statement_verify` → one rewrite.
  - Import: `resume_extract`.
- **C, tailoring:** it is **off** by default (`config.py:18`), so `/jobs/{id}/tailored-resume` returns 404. Master resumes use the same writer/verifier path, and they are unlimited.
- **Retrieval:** lexical word overlap. The evidence pack is `match.py:186`; fact selection for resumes is `tailor.py:30`, capped at 16 facts. There are no embeddings.
- **Ingestion:** adapters for Greenhouse, Lever, Ashby, Workable and a manual file (`catalog/sources.py`). Then clean → dedupe (URL key, then 5-word-shingle Jaccard on same company+title) → scam rules → expiry (`catalog/ingest.py`).
  - **C:** no sources are enabled (`CATALOG_SOURCES` is empty), and it has never been tested against real ATS responses. The launch is paste-only.
  - Alerts are weekly only on the free plan; daily is for paid plans, which don't exist yet.
- **Cost:** `llm_calls` logs tokens and cost per call, and there is a global daily cap of $5. The $0.16/user/month figure is an estimate in HANDOFF, not a measurement.
- **Tests:** **C:** 216 test functions collect to 273 tests; 77 of them skip without Docker. The last full DB run was 2026-11-04, and one test is flaky.
  - Frontend: 2 `node --test` files. No end-to-end tests, no LLM evals, **no CI**.
- **Deploy:** **C:** only `api/Dockerfile` exists (one image for API, worker and migrations). There is no compose file, no frontend Dockerfile, no CI and nothing deployed.
- **Half-built:** design step 8 cleanup; `skill_aliases` isn't used by matching; README is the create-next-app boilerplate.

## 2. Weaknesses

**Performance**
1. **N+1 queries on list views.** `GET /v1/jobs` (`routes/jobs.py:112-115`) calls `_list_item` → `assess()` for every job.
   - `assess()` (`match.py:376-455`) runs about 10 queries and **rebuilds and redacts the whole evidence pack** (`match.py:451-453`) just to compute freshness.
   - The same happens in `routes/feed.py:44-48` and `routes/insights.py:28-38`.
2. **Every request writes.** Each request, including task polls, runs 2 upserts (`core/auth.py:111,116`).
3. **Missing index for the spend cap.** `spent_today()` sums `llm_calls` before every model call (`tasks/llm.py:38-41`), but there is no `created_at` index (`0001:56`), so it does a full scan.
4. **Feed is recomputed from scratch per request.**
   - `to_tsvector` runs per row (`feed.py:339`), and search is `ILIKE '%q%'` on description (`feed.py:335`).
   - Skill matching is a Python regex per skill × 300 jobs (`feed.py:176`).
   - `affinity()` is computed twice (`feed.py:100`, `routes/feed.py:51`). Nothing is cached.
5. **Extraction cache is in-process** (`gateway.py:338-340`). Each worker loses it on restart.
   - Every user who opens the same catalog job pays `job_extract` again.
   - A retry of a match also re-runs `job_extract`.
6. **Worker is serial.** One process handles one I/O-bound task at a time and polls every 1 s (`worker.py:98-107`).
   - The tailor flow makes up to 4 model calls back to back (`tailor.py:141-154`). Verifying the lines that passed could run alongside the rewrite of the blocked ones.
7. **Demo-mode fallback.** `isDemo()` calls `/readyz` with a 1.5 s timeout on every page load (`src/lib/data.ts:12-21`). If the API is slow, a **signed-in user silently sees sample data**.

**Reliability**
- **Lease can expire mid-task.** The lease is 300 s (`config.py:53`) and there is no heartbeat. A worst-case match takes about 630 s: (60 s + 45 s) × 3 retries × 2 for the repair attempt.
  - Another worker then re-runs it and pays for the model calls again.
  - The handler's DB transaction stays open across all model calls (`worker.py:54-57`): connections are held and vacuum is blocked.
- **Gemini errors are misclassified.** 4xx errors other than 429 are re-raised raw, and only `httpx.TimeoutException` is mapped (`gateway.py:184-186`).
  - Config errors and connection errors therefore become INTERNAL_ERROR with retry on (`worker.py:65-67`): 5 pointless attempts, and their call records are never logged.
- **No SIGTERM handling** in the worker. A deploy strands its task until the lease runs out.
- **Cost-based denial of service.** Only deep matches and tailored resumes reserve usage (`jobs.py:67,223`). Imports (`routes/imports.py:151`), master resumes and regenerates (`routes/resumes.py:204,219`) have no limit. One user can use up the global $5/day for everyone.
- **ATS fetches** use sync urllib with no retry or conditional GET, while a DB transaction is open (`sources.py:46-54`). The share-link rate limit is per process (`share.py:101`).
- **Raw resume text stays in `tasks.payload`** when an import fails or dies: it is scrubbed only on success (`tasks/imports.py:218`). The admin role can SELECT `tasks`.
- **Observability** is just `logging.basicConfig`: no metrics, no error tracking.

**Architecture**
- Layers point the wrong way: tasks import from routes (`match.py:40`, `regenerate.py:15`, `imports.py:30`), and `feed.py:36` imports private helpers from `tasks/match.py`.
- The response contract is maintained by hand in `src/lib/mock.ts` rather than generated from OpenAPI.
- There are two different `description_hash` functions (`routes/jobs.py:37`, `catalog/ingest.py:109`).
- The verifier is priced at writer rates (`config.py:66`), so cost is overestimated.

**Test gaps:** no retrieval or LLM-quality evals (the eng review's TRD §14.1 evals were never built), no lease-expiry or concurrency test, no frontend end-to-end tests, no CI.

## 3. pgvector plan

**Where it pays off, most to least:**
1. **Feed retrieval** (job ↔ profile).
2. **Cross-source dedup:** the current Jaccard check only compares jobs with the same `company_key`/`title_key`.
3. **`select_facts` in `tailor.py:30`:** the 16-fact cap really does cut facts.
4. **Evidence pack:** least value. The 4000-token cap (`config.py:57`) rarely bites, so ranking currently changes nothing for typical profiles.

**Schema (migration 0010):**
- `CREATE EXTENSION vector`.
- `catalog_job_embeddings(catalog_job_id PK, model, dim, content_hash, embedding vector(768))` with `HNSW (embedding vector_cosine_ops) WITH (m=16, ef_construction=64)`.
- `fact_embeddings(fact_version_id PK, user_id, embedding vector(768))` with RLS like the rest, a btree index on `user_id`, and **no ANN index**.
- `profile_embeddings(user_id PK, profile_version, embedding)`.
- Add a stored `tsvector` generated column on `catalog_jobs` with a GIN index, plus `pg_trgm` for search.

**Model:** Gemini `gemini-embedding-001` at `output_dimensionality=768`, normalized in code. At 3072 dimensions, a plain `vector` can't take an HNSW index (2000-dim limit).
- Last known price was about $0.15 per 1M tokens, half that via the batch API; check current pricing.
- 10k postings × ~800 tokens ≈ $1.20 once. Facts cost about $0.001 per user.
- Use task types `RETRIEVAL_DOCUMENT` / `RETRIEVAL_QUERY`.
- Embedding runs in a new worker task, enqueued on ingest and on fact confirm, keyed by `content_hash` so nothing is embedded twice.

**Hybrid search:**
- Take the top 100 from the `tsvector` ranking (user skill and goal terms) and the top 100 from vector distance to the profile embedding.
- Fuse them with RRF, `score = Σ 1/(60+rank)`, in one SQL query using two CTEs.
- Then let the existing code scorer (`feed.py:250`) re-rank, so the skill chips stay explainable.
- Dedup: ANN candidates with cosine > 0.95, confirmed with shingle Jaccard.

**Index choice:** HNSW over IVFFlat. It needs no training, has better recall at this scale, and copes with constant inserts.

**RLS:**
- `catalog_jobs` is global, so HNSW is safe there.
- For per-user facts, an ANN index would apply RLS *after* taking the global top-k and return too few rows. With ~100 rows per user, an exact scan through the `user_id` btree is faster anyway. Keep it index-less, or use pgvector ≥0.8 `hnsw.iterative_scan` if you ever add one.
- The worker writes as hunt_worker with `set_user`.

**Evaluation (do this first):** build a golden set of about 30 postings × 3 synthetic profiles (Rohan plus 2 more), with gold fact IDs per requirement and relevance labels 0–2 per job.
- Metrics: recall@k for fact selection, nDCG@10 for the feed, and `requirement_map` support accuracy end to end.
- Compare lexical vs vector vs hybrid offline, with embeddings cached in fixtures. Run it as a pytest `eval` marker in CI.

## 4. Prioritized roadmap (impact ÷ effort)

| # | What | Why | Files | Effort |
|---|---|---|---|---|
| 1 | Enable 10–20 approved boards, hourly `cli tick`, **free daily digest**, fix the `/feed` link in the email | This is the daily-use hook, and it costs no model calls | `api/.env`, `routes/feed.py:112`, `catalog/alerts.py:72` | S |
| 2 | Store the match summary (verdict and gaps) on `match_analyses`; freshness by `profile_version` | Removes the N+1s and makes lists fast | `routes/jobs.py:92`, `routes/feed.py:44`, `insights.py`, `match.py:451` | S |
| 3 | Persist the `job_extract` cache in Postgres, keyed by (prompt_version, model, hash) | One extraction per catalog job across all users; retries get cheaper | `gateway.py:277-306,338`, new table | S |
| 4 | Per-user daily quotas on import/master/regenerate; `llm_calls(created_at)` index; cache the auth upsert | Closes the cost DoS; fewer writes | `core/usage.py`, `routes/imports.py`, `routes/resumes.py`, `core/auth.py` | S |
| 5 | Application tracker: applied/interviewing/offer/rejected, notes, follow-up dates, reminders in the digest | Gives users a reason to come back daily | `models.py` JobFeedback, migration, `routes/jobs.py:157`, jobs UI | M |
| 6 | Queue hardening: lease heartbeat, model calls outside the DB transaction, full Gemini error mapping, SIGTERM, LISTEN/NOTIFY, N threads per worker | Reliability and throughput | `worker.py`, `queue.py`, `gateway.py:177`, `tasks/llm.py` | M |
| 7 | Eval harness (golden set, recorded responses, CI) | Needed before changing retrieval or prompts | `tests/evals/` | M |
| 8 | CI (GitHub Actions: ruff, pytest with Docker, eslint/tsc), compose file | Proves the 273 tests actually run | `.github/workflows`, `docker-compose.yml` | S |
| 9 | Tailoring on + one-click tailored PDF (tailor → render chained) | Core promise of the product | `config.py:18`, `jobs.py:211`, `tailor.py`, `exports.py`, match page | M |
| 10 | pgvector hybrid feed + dedup (section 3) | Better recall and synonyms; scales past to_tsvector scans | `feed.py:311`, `ingest.py:168`, migration 0010 | M–L |
| 11 | Server-sent events for task progress (extracting → mapping → verdict); remove the `isDemo` fallback for signed-in users | Feels faster; no fake data | `routes/system.py`, `src/lib/api.ts:88`, `data.ts:12` | M |
| 12 | Observability: JSON logs with trace_id → task → llm_calls, Sentry, p95 per task type | Find failures before users do | `main.py`, `worker.py` | S |
| 13 | Cheapest demo: Vercel (frontend) + one Fly.io x86 machine (API + worker processes, volume for storage) + Neon/Supabase Postgres with pgvector | Live for ~$0–10/month | Dockerfile, `fly.toml`; cron via GitHub Actions | M |
| 14 | Generate TS types from OpenAPI; move domain logic out of `tasks/match.py` and routes | Stops contract drift; cleaner layers | `src/lib/mock.ts`, `app/services/` | M |

For #13: check that the DB host lets you create the 4 roles. The admin role needs to bypass RLS, but the admin console can stay off (leave `ADMIN_DATABASE_URL` unset).

## 5. Resume-ready wording

Fill in the X/Y numbers only after measuring them.

- *(True today)* "Built a truth-checked resume and job-match platform (FastAPI, PostgreSQL row-level security, Next.js) in which every AI-written line cites a user-confirmed fact; a Gemini writer/verifier pipeline plus deterministic checks withholds unsupported claims."
- *(After #10 + #7)* "Implemented hybrid retrieval (Postgres full-text + pgvector HNSW, reciprocal rank fusion) over N postings from Greenhouse/Lever/Ashby/Workable, raising nDCG@10 from X to Y on a hand-labeled eval set."
- *(After #6 + #3)* "Hardened a Postgres SKIP LOCKED task queue (lease heartbeats, graceful shutdown, dead-letter replay) and added a cross-user extraction cache, cutting p95 job-check latency from X s to Y s."
- *(After #4 + #12)* "Held LLM spend to $X per active user/month with per-call token/cost logging, per-user quotas and a global spend cap."

## 6. Before making the repo public

- **Secrets:** a `git log -p --all` scan found **none**. I searched for Google `AIza…`, `sk-`, `ghp_`, AWS keys, private keys, service-account `private_key`, and `KEY/SECRET/PASSWORD/TOKEN=` lines.
  - The only hit is a dummy test constant in `src/lib/auth.test.mjs:6`.
  - No `.env` was ever committed: only `.env.example` and `api/.env.example`, both with empty values.
  - `api/.env` holds the Gemini key locally and is ignored (`.gitignore:34`). **Rotate the Gemini key anyway**; HANDOFF §8.2 already lists that as pending.
- **Third-party content:** `docs/design-research/craft-shots/*.jpg` are 13 screenshots of craft.do. Remove them.
- **Personal data:**
  - Fixtures use real-provider-looking emails: `api/tests/truth/test_redact.py:6,15,40` (gmail.com / infosys.com addresses). Switch them to example.com.
  - The commit author email is visible in history; use a GitHub noreply address from now on.
  - `docs/reviews/eng-review-2026-10-08.md:102` contains your local username.
  - Decide whether the PRD/TRD/HANDOFF (pricing, plans) should be public.
- **Missing pieces:** no LICENSE. `README.md` is the create-next-app boilerplate. Rename "Hunt" to RoleFold across the code.
- **.gitignore:** `.claude/` and `.gstack/` are ignored only by your global gitignore. Add them to the repo's `.gitignore`. `api/var/` (user uploads) is already ignored.

---
I did not run the test suite or the app, and did not check current Gemini embedding prices or which managed-Postgres hosts allow an RLS-bypassing role. The most serious risks: the lease-expiry double run (section 2, Reliability) and the unlimited import/master-resume cost path, which can use up the shared daily budget for every user.
