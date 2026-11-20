# Deploy RoleFold for free: Vercel (web) + Northflank (API, worker, Postgres)

Written 2026-11-21. Northflank's free "Sandbox" plan (checked on northflank.com/pricing that day): 2 services,
2 jobs, 1 database, always on (no sleeping), no card needed, about $20/month of resources included, backups
included, free HTTPS on `*.code.run`. Not stated: CPU/RAM per service and database size, so watch the dashboard.

```
Browser ── Vercel (Next.js) ──/v1──> Northflank service "api"  ──┐
                                     Northflank service "worker" ─┼── Postgres addon
                                     shared volume /srv/api/var ──┘   (uploads, exports, tombstones)
```

You do every step below in your own accounts. Nothing here needs code changes.

## 0. What you need first

- A GitHub repo with this project pushed (Northflank builds from it).
- Your Gemini API key.
- A sign-in provider. The API runs with `ENV=production`, where dev sign-in (`X-Dev-User`) is off, so real users
  need OIDC. Free and simplest: **Google** (Google Cloud console → APIs & Services → Credentials → OAuth client,
  type "Web application"). Redirect URI: `https://<your-vercel-domain>/auth/callback`. Keep the client id and secret.

## 1. Northflank project and Postgres

1. Sign up at northflank.com, create a project (pick the region closest to your users).
2. Add an **addon → PostgreSQL** (version 16 matches local). Turn on backups.
3. Open the addon's connection details. You get an admin user (`ADMIN_USERNAME` / `ADMIN_PASSWORD`) and a host.

## 2. Create RoleFold's database and roles (once)

RoleFold needs its own roles: `hunt_owner` (migrations), `hunt_app` (API), `hunt_worker` (worker), each kept
inside per-user row security. Run `api/alembic/bootstrap.sql` with the addon's admin user. To reach the addon
from your laptop, use Northflank's local forwarding (addon page → "Forward" / Northflank CLI), then:

```bash
# make 4 strong passwords first (one per role), e.g. openssl rand -base64 24
docker run --rm -it -v "$PWD/api/alembic:/sql" --network host postgres:16 \
  psql "postgresql://<ADMIN_USERNAME>:<ADMIN_PASSWORD>@localhost:<forwarded-port>/postgres" \
  -v owner_pw='...' -v app_pw='...' -v worker_pw='...' -v admin_pw='...' -f /sql/bootstrap.sql
```

Known risk: the addon's admin user is not documented as a superuser. If `CREATE ROLE hunt_admin ... BYPASSRLS`
fails, delete that one line from a copy of bootstrap.sql and run it again. Only the admin console needs
`hunt_admin`; leave `ADMIN_DATABASE_URL` unset and the console stays off, everything else works. If
`CREATE DATABASE` is refused too, tell Claude: the fallback is to use the addon's default database.

## 3. Shared volume

Create one **volume**, access mode **Multi Read/Write** (it can't be changed later), small size (1 GB is plenty to
start; it can't be shrunk). You attach it to both services in step 4, mounted at `/srv/api/var`.

## 4. Two services from the same image

For both: **Build from Git** → your repo, **Dockerfile path** `api/Dockerfile`, **build context** `/` (repo root:
the image copies `shared/` from there). Same environment variables for both (step 5). Attach the volume at
`/srv/api/var`.

| Service | Port | Start command |
|---|---|---|
| `api` | 8000, public HTTPS | default (Dockerfile CMD: uvicorn) |
| `worker` | none | custom command: `python -m app.tasks.worker` |

If uploads fail with a permission error on `/srv/api/var`, the volume mounted as root: the image runs as uid
10001. Set the volume/service to run as or allow uid 10001 (Northflank volume settings), or tell Claude.

## 5. Environment variables (both services)

Use Northflank's secret groups so both services share one set.

```
ENV=production
GEMINI_API_KEY=...
LLM_MODEL_FAST=...            # same values as your local api/.env
LLM_MODEL_WRITER=...
LLM_MODEL_VERIFIER=...
DATABASE_URL=postgresql+psycopg://hunt_app:<app_pw>@<addon-host>:5432/hunt
WORKER_DATABASE_URL=postgresql+psycopg://hunt_worker:<worker_pw>@<addon-host>:5432/hunt
MIGRATION_DATABASE_URL=postgresql+psycopg://hunt_owner:<owner_pw>@<addon-host>:5432/hunt
PSEUDONYM_SALT=...            # 16+ random chars; keep it forever (deletion pseudonyms depend on it)
OIDC_ISSUER=https://accounts.google.com
OIDC_AUDIENCE=<google client id>
APP_URL=https://<your-vercel-domain>
AI_KEY_ENCRYPTION_KEY=...     # optional: turns on "use your own AI key"; see api/.env.example
```

Use the addon's **internal** host (private network), not a public one.

## 6. Migrations (a job)

Add a **job** (manual run) from the same build, custom command `alembic upgrade head`, same env vars. Run it once
now and again after every deploy that adds a file under `api/alembic/versions/`. Check it ends at `0010`.

Check the API: `https://<api>.code.run/readyz` should answer 200 (it checks the database too).

## 7. Vercel (web app)

Project → Settings → Environment Variables, then redeploy:

```
API_URL=https://<api>.code.run
OIDC_ISSUER=https://accounts.google.com
OIDC_CLIENT_ID=<google client id>
OIDC_CLIENT_SECRET=<google client secret>
APP_URL=https://<your-vercel-domain>
SESSION_SECRET=<32+ random chars>
```

Remove `HUNT_DEMO` and `NEXT_PUBLIC_DEV_USER` if they are set. Demo (sample) data turns on only when the API's
`/readyz` fails, so if you still see "Sample data", the API or database isn't reachable: check step 6's `/readyz`.

## 8. After it's up

- Sign in on the Vercel URL, upload a resume, confirm a few facts, make a resume, check a job, download a PDF.
- Rotate the Gemini key once before sharing the link widely (HANDOFF open item).
- Free-tier limits aren't published per service: if Northflank shows the API or worker short on memory (PDF
  rendering is the heaviest step), that's the signal to move up a plan.
- Job feed stays off (`CATALOG_SOURCES` empty). When you turn it on, the second free job can run
  `python -m app.catalog.cli tick` hourly.
