# RoleFold: GitHub repo metadata proposal (suggestions only, nothing applied)

## About description (max 350 chars)

1. **(Recommended)** Resumes where every AI-written line can prove itself. An evidence-backed AI resume builder: a Gemini writer + verifier LLM pipeline and deterministic checks withhold any claim not backed by a fact you confirmed. Job-fit matching with skill gaps. FastAPI, Postgres RLS, Next.js. (about 285 chars)
2. AI resume builder that refuses to hallucinate: every bullet cites a user-confirmed fact, checked by an LLM verifier and code. Plus ATS-friendly export and job matching with skill-gap analysis. FastAPI + PostgreSQL row-level security + Next.js. (about 245 chars)
3. Truth-checked resumes and honest job-fit scoring. Writer/verifier LLMs, deterministic claim checks, PII redaction, per-call cost logging and a Postgres SKIP LOCKED task queue. Built with FastAPI, PostgreSQL and Next.js. (about 225 chars)

## Website field

Leave blank. Nothing is deployed.

## Topics (15)

`resume-builder`, `ai-resume`, `llm`, `rag`, `gemini`, `job-matching`, `ats`, `fastapi`, `postgresql`, `row-level-security`, `nextjs`, `python`, `typescript`, `llm-verification`, `task-queue`

Optional swaps: `ai-agents` is a stretch (it is a fixed pipeline, not agents); `rag` is fair but retrieval is lexical today.

## Repo hygiene suggestions

- Remove `docs/design-research/craft-shots/*.jpg` (13 third-party craft.do screenshots) from the tree, and decide whether to purge them from history or publish a fresh repo (see ROLEFOLD_REVIEW.md section 6).
- Add a LICENSE (MIT or Apache-2.0 if you want reuse; none exists today, so the code is all-rights-reserved by default).
- Add CI (`.github/workflows`): ruff, pytest with Docker, eslint, tsc. Then a real CI badge becomes truthful.
- Add real product screenshots (e.g. `docs/screenshots/`) and replace the "Screenshots coming soon" line.
- Rename remaining "Hunt" identifiers (FastAPI title, `USER_AGENT`, `smtp_from`, pyproject name) to RoleFold.
- Add `.claude/` and `.gstack/` to the repo `.gitignore` (currently ignored only by your global gitignore).
- Swap real-looking emails in `api/tests/truth/test_redact.py` for example.com; scrub the local username in `docs/reviews/eng-review-2026-10-08.md`.
- Rotate the Gemini key once before or right after going public (HANDOFF lists it as pending).
- Decide whether PRD/TRD/HANDOFF (pricing, plans) and `ROLEFOLD_REVIEW.md` should stay public; the README links to the review.
- Use a GitHub noreply commit email going forward.
- Pin the repo and add a social-preview image.
