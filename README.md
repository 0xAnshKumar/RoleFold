# RoleFold

**Resumes where every AI-written line can prove itself.**

![Python](https://img.shields.io/badge/Python-3.12+-3776AB?logo=python&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-009688?logo=fastapi&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-RLS-4169E1?logo=postgresql&logoColor=white)
![Next.js](https://img.shields.io/badge/Next.js-16-000000?logo=nextdotjs&logoColor=white)
![Gemini](https://img.shields.io/badge/Google-Gemini-8E75B2?logo=googlegemini&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-api%20image-2496ED?logo=docker&logoColor=white)
![Tests](https://img.shields.io/badge/tests-273-brightgreen)

RoleFold turns your real experience into evidence-backed, ATS-friendly resumes, and tells you honestly how well you fit a
job, including the skill gaps. What makes it different: a **writer / verifier LLM pipeline plus deterministic code checks**
that withhold any claim not backed by a fact *you* confirmed. If a line can't cite its evidence, it doesn't ship.

**🔗 Web app:** [rolefold-green.vercel.app](https://rolefold-green.vercel.app). The hosted backend (Render + Neon) is being set up; until it is live, app screens show a "couldn't load" state.

> Status: a working pre-launch codebase. The full stack (FastAPI, Postgres, worker, Gemini) runs locally; hosting steps are in `docs/DEPLOY-FREE.md`. There are no users or metrics to report yet.

## Why it exists

AI resume tools are happy to invent a "40% latency reduction" you never achieved. That is a fast way to fail a background
check or an interview. RoleFold flips the default: extract facts from what you actually wrote, ask you to confirm them,
and only let the model rephrase what is already confirmed. The model is the writer, never the source of truth.

## How it works

```mermaid
flowchart LR
  A[Upload or import<br/>PDF, DOCX, TXT, MD, LinkedIn CSV] --> B[PII redaction]
  B --> C[Fact extraction<br/>resume_extract]
  C --> D{You confirm<br/>each fact}
  D --> E[Evidence pack<br/>retrieval]
  E --> F[Writer model<br/>resume_write]
  F --> G[Deterministic checks<br/>numbers, dates, tools, verbs]
  G --> H[Verifier model<br/>statement_verify]
  H -->|passes| I[Resume<br/>PDF / DOCX]
  H -->|fails| J[One rewrite, else line withheld]
  J --> G

  K[Pasted job posting] --> L[Requirement extraction<br/>job_extract + quote check]
  L --> M[Requirement mapping<br/>requirement_map]
  D --> E
  E --> M
  M --> N[Verdict in code<br/>match + skill gaps]
```

1. **Import.** Upload a PDF, DOCX, TXT, MD or LinkedIn CSV. Emails, phones, URLs and your name are redacted before any text reaches a model.
2. **Extract facts.** The model proposes structured facts (roles, projects, skills, achievements). They stay drafts.
3. **You confirm.** Facts are versioned and immutable once confirmed. Only confirmed facts can be cited.
4. **Write.** A writer model drafts each line and must cite fact IDs from an evidence pack.
5. **Check.** Code verifies numbers, dates, employers/titles, tools and overclaiming verbs (e.g. "led" vs "helped") against the cited facts. Then a separate verifier model judges the line. Failures get one rewrite; anything still unsupported is withheld.
6. **Match.** For a job, requirements are extracted (and each quote must appear in the posting), mapped to your confirmed facts, and the final verdict is computed in plain code, not by the model.

The code registers 7 Gemini tasks, but only 5 are on live paths today (`resume_extract`, `job_extract`, `requirement_map`,
`resume_write`, `statement_verify`), so this README doesn't advertise a bigger pipeline than exists.

## Features (what works today)

- **Evidence-backed resume generation** with writer, verifier and deterministic truth checks (`api/app/truth/`).
- **Fact confirmation flow** with immutable fact versions and a draft/confirmed state.
- **Job-fit matching** on pasted job postings: requirement-by-requirement support, skill gaps, and a code-decided verdict.
- **Resume templates and export:** 6 templates (single shared JSON for frontend and backend), PDF and DOCX export, revocable public share links.
- **Postgres row-level security** forced on every table; each request runs with the caller's `app.user_id`.
- **OIDC login** (any provider, ID tokens verified against the provider's JWKS). A dev header exists only behind `DEV_AUTH=1`.
- **PII redaction before LLM calls**, with a gateway-level guard that refuses emails, phones and URLs in prompts.
- **Audit log** and an **admin console** (queue waits, spend, failed-task replay, audited read-only support access).
- **Cost control:** every model call logs tokens and estimated cost; a **global daily spend cap ($5 default)** pauses model work until the next UTC day. Plan-limit reservations exist for deep matches and tailored resumes.
- **Postgres task queue:** `SKIP LOCKED` claiming, leases, retries with backoff, dead-lettering after 5 attempts, admin replay.
- **Account deletion** with tombstones kept outside the DB so a backup restore can't resurrect a deleted user.
- **Demo mode:** the frontend runs on sample data with no backend.

Honest flags:

- Job-targeted resume tailoring is **off by default** (`TAILORING_ENABLED=0`); master resumes use the same writer/verifier path.
- Job catalog adapters (Greenhouse, Lever, Ashby, Workable) are written but **no source is enabled**, and they have not been run against real boards yet. Today the product works on pasted jobs.
- Retrieval is **lexical** (word overlap) today. There are no embeddings.
- The job-alert email digest is log-only until SMTP is configured.

## Tech stack

| Layer | Tech |
|---|---|
| API | Python 3.12+, FastAPI, SQLAlchemy 2, Alembic, Pydantic v2 |
| Database | PostgreSQL 16 (row-level security, SKIP LOCKED queue) |
| LLM | Google Gemini via `google-genai`; model ids are config, not code |
| Rendering | Typst (PDF), python-docx (DOCX), pypdf / pypdfium2 (parsing) |
| Frontend | Next.js 16, React 19, TypeScript, Motion |
| Auth | OIDC (JWKS-verified ID tokens), AES-GCM encrypted refresh cookie |
| Tooling | uv, ruff, pytest, Testcontainers, ESLint, Docker |

## Architecture

```
src/            Next.js app (App Router). Browser calls /v1/* on its own origin; next.config.ts proxies to FastAPI (no CORS)
api/app/        routes/ (FastAPI)  tasks/ (worker + handlers)  llm/ (gateway, prompts, schemas)
                truth/ (checks, redaction)  catalog/ (job ingestion)  core/ (auth, config, usage)  db/
api/alembic/    bootstrap.sql (roles) + migrations 0001-0009
shared/         resume-templates.json, read by both frontend and renderer
docs/           PRD v4, TRD v4, design notes, reviews
```

- The API enqueues work in the same transaction as the record it creates and returns `202`; the frontend polls the task.
- **Three runtime Postgres roles:** `hunt_app` (API), `hunt_worker` (worker), `hunt_owner` (migrations). None has `BYPASSRLS`. A fourth, `hunt_admin`, exists for the optional admin console only.
- The **LLM gateway** (`api/app/llm/gateway.py`) owns model tiers (fast / writer / verifier), schema-validated output, retries, PII guard, spend cap and call logging. Verifier must differ from writer.
- The API/worker image is `api/Dockerfile`; PDF/DOCX parsing runs in a child process with network syscalls blocked on Linux.

## Getting started

Prereqs: Node 24 (`.nvmrc`), [uv](https://docs.astral.sh/uv/), PostgreSQL 16, and a Gemini API key for live mode.
There is no docker-compose file; use any Postgres.

**Full stack:**

```bash
# 1. Postgres (example), then create roles + database as a superuser
docker run -d --name rolefold-pg -e POSTGRES_PASSWORD=postgres -p 5432:5432 postgres:16
cd api
psql "postgresql://postgres:postgres@localhost:5432/postgres" \
  -v owner_pw=change-me -v app_pw=change-me -v worker_pw=change-me -v admin_pw=change-me \
  -f alembic/bootstrap.sql

# 2. Configure: copy api/.env.example to api/.env
#    set GEMINI_API_KEY, LLM_MODEL_FAST/WRITER/VERIFIER (Gemini 3+), PSEUDONYM_SALT (16+ chars), DB passwords
uv sync
uv run alembic upgrade head

# 3. Run the API and the worker (two terminals, from api/)
uv run uvicorn app.main:app --port 8000
uv run python -m app.tasks.worker

# 4. Frontend (repo root): copy .env.example to .env.local
#    set API_URL=http://127.0.0.1:8000 and NEXT_PUBLIC_DEV_USER=<any id>  (needs DEV_AUTH=1 in api/.env)
npm install
npx next dev -p 3100
```

For real sign-in, set `OIDC_ISSUER` / `OIDC_CLIENT_ID` / `OIDC_CLIENT_SECRET` / `SESSION_SECRET` in `.env.local` and
`OIDC_ISSUER` / `OIDC_AUDIENCE` in `api/.env`. Details are in [`api/README.md`](api/README.md) and the `.env.example` files.

## Testing

```bash
cd api
uv run pytest -q                              # 273 tests collected
uv run ruff check app tests
RUN_LIVE_LLM=1 uv run pytest tests/live -s    # opt-in real Gemini smoke test, costs a few cents

# frontend (repo root)
npm run lint && npx tsc --noEmit && npm test
```

- **Unit tests** (truth checks, redaction, gateway, parsing, config) need nothing external. A `FakeLLM` is swapped in automatically, so default runs never call a model.
- **Integration tests** (RLS, queue, pipeline, tombstones, admin) start Postgres 16 with Testcontainers. **77 tests need Docker** and skip without it.
- **Live LLM tests** are marked `live` and skipped unless `RUN_LIVE_LLM=1`.
- There is no CI yet (see roadmap), so these run locally.

## Roadmap: what we're working on

Nothing below is shipped yet.

- [ ] **CI** on GitHub Actions: ruff, pytest with Docker, eslint and tsc
- [ ] **Eval harness:** golden set of postings and profiles, recorded model responses, nDCG@10 and recall@k
- [ ] **Hybrid retrieval:** Postgres full-text + pgvector (HNSW) with reciprocal rank fusion, measured against the lexical baseline
- [ ] **Per-user quotas** on imports, master resumes and regenerates, to close the cost-abuse gap
- [ ] **Faster list views:** store match summaries instead of recomputing them per job
- [ ] **Cross-user extraction cache** in Postgres, so one catalog job is extracted once
- [ ] **Task queue hardening:** lease heartbeats, graceful shutdown, fuller Gemini error mapping, dead-letter replay polish
- [ ] **Enable approved ATS boards** (Greenhouse, Lever, Ashby, Workable) with hourly ingest and a free daily job digest email
- [ ] **Job-targeted tailoring rollout** with one-click tailored PDF
- [ ] **LLM quality evals** and **end-to-end frontend tests**
- [ ] Rename internal identifiers (env vars, DB roles, storage keys, package and folder names) that still say "Hunt"; user-facing branding is already RoleFold

## Privacy and safety

- Row-level security isolates every user's rows at the database, not just in app code.
- Contact details and names are redacted before model calls. Known limit: only names the system knows are caught.
- Deleting an account removes rows and files and writes a tombstone so restores can't bring the user back.
- A global daily spend cap stops runaway model cost.
- **`DEV_AUTH` lets anyone sign in as anyone.** It is for local development only and is ignored in production images (`ENV=production`). Never enable it on a reachable host.
- Never commit `api/.env`; it is gitignored.

## Author

Built by **Ansh Kumar**: [LinkedIn](https://www.linkedin.com/in/anshkumarak111) · [GitHub](https://github.com/0xAnshKumar) · [Web app](https://rolefold-green.vercel.app)
