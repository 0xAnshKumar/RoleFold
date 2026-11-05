# Hunt API

FastAPI service and task worker. Config comes from `api/.env` (copy `api/.env.example`).

## Tests

```bash
cd api
uv run pytest            # unit tests; DB tests run when Docker is up (testcontainers Postgres 16)
uv run ruff check .
```

Default tests never call a model: an autouse fixture swaps in an empty `FakeLLM`.

## Live Gemini smoke test (opt-in, costs money)

One real call each for `job_extract`, `requirement_map`, `resume_write` and `statement_verify`, through
`build_gateway()`, with fictional input only. Needs `GEMINI_API_KEY` and `LLM_MODEL_FAST/WRITER/VERIFIER`
in `api/.env`; prices come from `LLM_PRICE_*` (defaults in `app/core/config.py`).

```bash
cd api
RUN_LIVE_LLM=1 uv run pytest tests/live -s
```

It checks each output is schema-valid, `tokens_out > 0`, and that thinking tokens are counted in
`tokens_out`, then prints the total estimated cost.

## Restore runbook

Deleting an account writes a tombstone file (named by the salted user hash, never the id) to `TOMBSTONE_DIR`
before the DB rows go. That directory is outside the DB and its backups, so restoring an older backup cannot
bring a deleted user back for good. In production `TOMBSTONE_DIR` must be an object-locked (WORM) bucket mount,
separate from `STORAGE_DIR`, and must not be restored or pruned with the DB.

After any DB restore, before the API or worker take traffic:

```bash
cd api
export RESTORE_DATABASE_URL=postgresql+psycopg://<superuser>@<host>/hunt   # must see every user (bypasses RLS)
uv run python -m app.tasks.reapply_tombstones --dry-run   # prints how many restored users match a tombstone
uv run python -m app.tasks.reapply_tombstones             # deletes them (rows, files); safe to re-run
```

Use the same `PSEUDONYM_SALT` that wrote the tombstones, or nothing will match.

## Admin console

`/admin` in the web app (`app/routes/admin.py` behind it): operations (queue waits per task type, today's AI spend
against `LLM_DAILY_SPEND_CAP_USD`), failed/dead-lettered tasks with replay, a taxonomy curator queue (unmapped skill
terms from user skills, current fact tools and skill requirements; approve as an alias of a skill id or mark "not a
skill", stored in `skill_aliases`), audited support access, and the audit log.

- **Who:** auth subjects in `ADMIN_SUBJECTS` (comma-separated `{OIDC_ISSUER}|{sub}`; `dev|<name>` with the dev
  header outside production), or users whose ID token has `ADMIN_ROLE` (default `hunt-admin`) in the top-level claim
  named by `ADMIN_ROLE_CLAIM` (e.g. `groups`; the provider must put it in the ID token). Everyone else gets 403.
- **Audit:** every action writes `audit_log` with the admin's user id and the reason they typed (10+ characters):
  `admin.task.replay`, `admin.taxonomy.approve|reject`, `admin.support.open`, and `admin.support.view` for every read.
- **Support access:** opening a session needs a reason and lasts `ADMIN_SUPPORT_MINUTES` (default 30); the session is
  its `admin.support.open` audit row, usable only by the admin who opened it. Reads run as `hunt_app` with
  `app.user_id` set to that one user in a `READ ONLY` transaction, so RLS scopes every row and nothing can be written.
  Deleting the user pseudonymizes those audit targets like actor ids.
- **DB role:** cross-user reads (queue, spend, skill terms, user lookup, audit log) need `hunt_admin`, a `BYPASSRLS`
  role created by `alembic/bootstrap.sql`. Migration 0008 grants it only: SELECT on `users, tasks, llm_calls,
  audit_log, user_skills, facts, fact_versions, job_requirements`, UPDATE on `tasks` (replay), INSERT on `audit_log`,
  and read/write on `skill_aliases`. Set `ADMIN_DATABASE_URL` to it; unset turns the console off (503). On a cluster
  bootstrapped before 0008, create the role first (as a superuser), or `alembic upgrade head` stops with that message:

  ```sql
  CREATE ROLE hunt_admin LOGIN BYPASSRLS NOSUPERUSER NOCREATEDB NOCREATEROLE PASSWORD '...';
  ```

Replay puts a task back in the queue with fresh attempts. Handlers are idempotent, and a usage reservation released
when the task failed stays released, so the replayed run isn't charged. `skill_aliases` is not read by matching yet:
it is the reviewed list the TRD §6 normalizer will use once the taxonomy is built.

## Workers and scaling

One process can run every task type, or a pool can take only some, so slow or bursty work doesn't hold up the rest:

```bash
uv run python -m app.tasks.worker                       # all types
uv run python -m app.tasks.worker --types import,match  # an "interactive" pool
uv run python -m app.tasks.worker --types render        # exports
uv run python -m app.tasks.worker --types delete_user,regenerate,tailor
uv run python -m app.tasks.worker --types catalog_ingest,alert_digest   # job feed + alerts (if enabled)
```

Pools share the one Postgres queue (SKIP LOCKED); run as many processes per pool as you like. Every pool requeues
expired leases. A type no running pool lists stays queued, so keep at least one process covering every type
(the admin console's Operations page shows queue waits per type).

Beta runs on one Postgres primary, these worker pools, and Postgres-backed rate limits. Upgrade when the numbers say so
(TODOS "Scale infrastructure for 1M users", TRD §13.1-13.2), not before:

| Trigger | Next step |
|---|---|
| Queue wait p95 for a type stays above its target (match/tailor/import: ~1 min) | More processes in that type's pool, then a dedicated pool |
| API p95 latency up while DB CPU is fine | More API instances (stateless) |
| DB CPU high or reads dominate | Read replicas for analytics and the future catalog/feed; RLS-scoped user reads stay on the primary |
| Feed launch (catalog, per-user feeds) | Redis cache for feeds, job cards and taxonomy lookups; embedding service, GPU only when CPU throughput is the limit |
| `tasks` table or catalog grows past what vacuum keeps up with | Partition (tasks by created month, catalog by source/time) |

## Job catalog sources

`CATALOG_SOURCES` (empty = feed off) lists boards as `kind:token[=Company name]`, comma-separated. Kinds:
`greenhouse:<board>`, `lever:<site>`, `ashby:<job board name>`, `workable:<account subdomain>` (each the public JSON
job-board API the ATS publishes for showing jobs elsewhere; one GET per board per run, no HTML pages) and
`manual:<file.json|csv>`. `api/.env.example` has a probed list of India boards with entry-to-mid engineering roles;
each still needs its terms decision (TRD T-OQ-2) before production. Try one board now:

```bash
uv run python -m app.catalog.cli sources                 # what CATALOG_SOURCES enables
uv run python -m app.catalog.cli ingest ashby:sarvam     # fetch one now; prints new/updated/rejected counts
```

## Docker

`api/Dockerfile` builds one image for the API, the workers and migrations. Build from the repo root (the renderer reads
`shared/resume-templates.json`):

```bash
docker build -f api/Dockerfile -t hunt-api .
docker run --env-file api/.env hunt-api alembic upgrade head                  # MIGRATION_DATABASE_URL
docker run --env-file api/.env -p 8000:8000 hunt-api                          # API (uvicorn)
docker run --env-file api/.env hunt-api python -m app.tasks.worker --types render   # a worker pool
```

The image sets `ENV=production` (no dev header) and runs as a non-root user. Mount `STORAGE_DIR` and `TOMBSTONE_DIR`
(default under `/srv/api/var`; tombstones on an object-locked bucket).

**Upload parsing has no network.** PDF/DOCX parsing runs in a child process (`app/core/parsing.py`) that, on Linux,
installs a seccomp filter before reading the file: `socket()`, `socketpair()` and `io_uring_setup()` fail with EPERM,
so a parser exploit can reach neither the internet nor local sockets (Postgres, the Docker socket). It needs no
privileges and works under Docker's default seccomp profile (and Kubernetes RuntimeDefault), so no `--security-opt` or capabilities.
(`unshare --net --map-root-user` was the other option, but Docker's default profile refuses it.) If the filter can't
be installed on Linux, the child refuses to parse and the upload fails, never parsing unprotected. Build the image for
the host's native architecture: under QEMU emulation the filter can't be installed. On macOS (dev) the filter is
skipped, so don't deploy there.
