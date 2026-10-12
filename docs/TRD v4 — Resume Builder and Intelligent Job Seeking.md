# TRD v4 — Resume Builder and Intelligent Job Seeking

Oct 8, 2026 · @Piyush Jain

This TRD defines how the platform in PRD v4 is built: a multi-tenant web platform on PostgreSQL with pgvector, where models propose and application code validates and writes. Supersedes TRD v3.0. Every generated output follows the truth and freshness contract in §16.

0\. **How to read this document.** MUST / MUST NOT are absolute; SHOULD may be deviated from only with a recorded decision in `docs/decisions/`; MAY is optional. Behavior, values, fields or states not specified here or in the PRD MUST NOT be invented: add an open question (§15) and apply the safe default (no side effects, no data loss, result marked `unknown`, nothing presented to the user as fact). Values marked *proposed* are read from configuration and may be used until confirmed. The invariants in §15 MUST hold for every change.

## 1. Architecture overview

The platform is a stateless web and API tier over one PostgreSQL database that holds records, vectors and text search, with background workers for everything slow. Three design rules shape every component:

1. **PostgreSQL is the source of truth.** Caches, queues and files are derived or referenced from it.
2. **Models propose, code decides.** Models return typed output through one gateway; code validates and performs every write.
3. **Shared work is done once.** Jobs are extracted and embedded once for all users; per-user model calls happen only on demand.

&#91;embedded content: platform architecture · 11 components\]

The API writes records and outbox rows; workers claim tasks from the Postgres task table (Redis is only a cache), call models through the gateway, and render files to object storage.

## 2. Stack and deployment

The stack is deliberately boring: one relational database that also does vector and text search, stateless services, and a durable queue. Every choice can scale an order of magnitude before it needs replacing.

| Layer | Choice | Why |
| --- | --- | --- |
| Frontend | Next.js (React, TypeScript), server-side rendering | Fast first load, SEO for public pages, mature ecosystem |
| API | Python 3.12, FastAPI, Pydantic v2 | Typed contracts shared with model output schemas |
| ORM, migrations | SQLAlchemy 2, Alembic | Explicit transactions; expand-contract migrations |
| Primary database | PostgreSQL 16+ with `pgvector` (HNSW), `pg_trgm`, built-in full-text search | One store for records, vectors and text search; row-level security for isolation |
| Connection pooling | PgBouncer (transaction mode) | Many short API connections |
| Cache and rate limits | Redis (managed) | Feed cache, per-user rate limits (not used as the task queue) |
| Task queue | A PostgreSQL task table claimed with SELECT … FOR UPDATE SKIP LOCKED, behind a `TaskQueue` interface, written in the same transaction as the record | Durable, retryable background work; replaceable by a managed queue later |
| Object storage | S3-compatible (AWS S3 or Cloudflare R2) | Uploaded resumes, generated PDF and DOCX files |
| Embeddings | `bge-m3` (multilingual, 1024 dimensions) served by Hugging Face Text Embeddings Inference | Multilingual for global users; self-hosted keeps cost per user near zero |
| LLM | Provider-agnostic gateway (§10); one fast model for extraction, one stronger model for writing | Cost control; no lock-in |
| PDF rendering | Typst | Deterministic, fast, real text output |
| DOCX rendering | `python-docx` | Native Word output |
| Auth | Managed OIDC provider (email magic link, Google) | Avoids building password handling |
| Email | Transactional email provider | Alerts, verification |
| Observability | OpenTelemetry → managed traces, metrics, logs | Vendor-neutral instrumentation |
| CI/CD | GitHub Actions, container images, infrastructure as code (Terraform) | Repeatable environments |

**Deployment.**

- Containers on a managed platform (AWS ECS Fargate or Google Cloud Run to start; Kubernetes only if needed later).
- Services: `web` (Next.js), `api` (FastAPI), `worker-*` pools per queue, `embedder` (TEI, CPU first, GPU when volume justifies), `renderer` (Typst and DOCX, sandboxed).
- Managed PostgreSQL with pgvector support, multi-AZ, point-in-time recovery; managed Redis.
- Primary region in India (for example AWS `ap-south-1`, Mumbai) for the launch market. Data residency for other markets is decided after legal review (PRD OQ-8). The design MUST NOT hard-code a single region.
- Three environments: `dev`, `staging` (production-like, synthetic data only), `prod`.
- All public traffic through a CDN and web application firewall; internal services are not publicly reachable.

## 3. Multi-tenancy, authentication and isolation

One shared schema, `user_id` on every user-owned row, and PostgreSQL row-level security (RLS) as a second wall behind application checks.

**Data classes:**

| Class | Examples | Access |
| --- | --- | --- |
| User-owned | Profile, facts, preferences, resumes, match analyses, feedback, uploads | Only that user (and audited support access) |
| Shared catalog | Jobs, job versions, requirements, companies, taxonomy | Read by all authenticated users; written only by ingestion workers |
| System | Usage counters, audit log, plans, feature flags | Service roles only |

**Authentication.**

- A managed OIDC provider issues tokens; the API validates them on every request (signature, issuer, audience, expiry).
- The platform keeps its own `users` row keyed by the provider subject. The provider ID is never used as a foreign key elsewhere.
- Sessions in the browser use HTTP-only, secure, same-site cookies; the API also accepts bearer tokens for future mobile clients.
- Email verification is required before alerts are sent.

**Authorization and RLS.**

- Every user-owned table has `user_id NOT NULL` and an RLS policy `user_id = current_setting('app.user_id')::uuid`.
- The API sets `app.user_id` with `SET LOCAL` at the start of each transaction from the validated token, never from request parameters.
- The API's database role MUST NOT have `BYPASSRLS`. Workers that act for a user set `app.user_id` the same way; only the ingestion and maintenance roles touch shared and system tables.
- Object storage keys are prefixed by `user_id`, and files are served only through short-lived signed URLs issued after an ownership check.
- Vector and text search over user-owned data always run inside the same RLS-scoped transaction.
- Support or admin access to user data requires a reason, is time-limited, and is written to the audit log.

**Isolation tests (required in CI):** for every user-owned table and every API route that takes an ID, a test asserts that user B cannot read, list, update or delete user A's rows (PRD A12).

## 4. Data model

UUID primary keys, UTC timestamps, explicit foreign keys. Facts and preferences are versioned (edits create versions); identity and lifecycle fields are relational, model outputs are JSONB with a `schema_version`.

**Profile (user-owned)**

| Table | Key fields |
| --- | --- |
| `users` | id, auth subject, email, locale, country, plan, created, deleted\_at |
| `profiles` | user\_id, headline, summary\_source, `profile_version` (integer, incremented on any confirmed change) |
| `experiences` | id, user\_id, employer, title, start/end (month precision), location, employment type, status (`draft`, `confirmed`, `rejected`) |
| `facts`, `fact_versions` | fact id, owner entity (experience, project, education), version, description, tools (taxonomy IDs + raw text), responsibility level (1–4), outcome value + unit + method (nullable), completion (`planned`, `in_progress`, `completed`), status, origin (`import`, `manual`, `enrichment`), artifact refs, content hash |
| `projects`, `education`, `certifications`, `achievements`, `languages` | Typed fields per section, each with status and origin |
| `user_skills` | user\_id, skill\_id (taxonomy), raw label, proficiency (user-set, optional), evidence fact IDs |
| `preference_versions` | locations (geo IDs + radius), work modes, employment types, seniority range, salary range + currency, notice period, relocation, visa needs, effective time |
| `career_goals` | target occupations (taxonomy IDs), industries, direction text |
| `imports` | source file key, format, parser and model versions, created entries |
| `enrichment_questions` | question, target entity, priority, state (`open`, `answered`, `skipped`) |

**Resumes (user-owned)**

| Table | Key fields |
| --- | --- |
| `resumes` | id, user\_id, kind (`master`, `tailored`), target (occupation or job\_version\_id), template\_id, parent resume |
| `resume_versions` | resume id, version, `profile_version`, selected fact version IDs, statements (JSONB: text, type, cited fact version IDs, check results), layout options, check summary |
| `resume_exports` | resume version, format (`pdf`, `docx`, `txt`), object key, parse-safety result, created |

**Job catalog (shared)**

| Table | Key fields |
| --- | --- |
| `job_sources` | name, type, market, terms record, attribution text, enabled |
| `companies` | normalized name, aliases, domain, country |
| `jobs` | canonical id, company, source refs, lifecycle (`active`, `expired`, `removed`, `unknown`), first/last seen, apply URL, scam state (none, suspected, confirmed, cleared) |
| `job_versions` | job id, version, raw text, normalized description hash, posted at (nullable), observed at; partitioned by observed month |
| `job_requirements` | job version, requirement id, verbatim quote + offsets, category, importance (`required`, `preferred`, `unknown`), skill\_id or occupation\_id (nullable), extraction version |
| `job_eligibility` | job version, field (closed enum, §8), value, verbatim quote or null |
| `job_embeddings` | job version, `halfvec(1024)`, model version; partitioned like `job_versions` |

**Pasted jobs and ownership.** `jobs.owner_user_id` is NULL for catalog jobs and set for pasted jobs; `job_versions`, `job_requirements`, `job_eligibility` and `job_embeddings` carry the same column. One RLS policy covers every job table: `owner_user_id IS NULL OR owner_user_id = current_setting('app.user_id')::uuid`. Ingestion writes only rows with a NULL owner; `POST /v1/jobs/paste` writes only owned rows. A paste that duplicates a catalog job is recorded in `user_job_links(user_id, private_job_id, catalog_job_id)`; private jobs are never merged into or promoted to the catalog.

**Gates.** `job_requirements.gate` is `none`, `credential` (mandatory licence, certification or degree) or `work_authorization` (visa, citizenship, right to work). Hard preferences act as gates through the eligibility fields.

**Scam states.** `none` → `suspected` (rules or user reports) → `confirmed` or `cleared`. Suspected and confirmed jobs are excluded from recommendations; confirmed jobs are hidden everywhere; `cleared` suppresses re-flagging by the same rule until the description changes. `jobs.report_count` counts user reports.

**Matching (user-owned)**

| Table | Key fields |
| --- | --- |
| `profile_embeddings` | user\_id, purpose (`overall`, per target occupation), `halfvec(1024)`, `profile_version` |
| `recommendations` | user\_id, job\_id, rank, stage-2 score components, generated at, expires at |
| `match_analyses` | user\_id, job\_version\_id, fingerprint (§9.5), eligibility results, requirement results, goal fit, verdict, open questions, model and prompt versions |
| `job_feedback` | user\_id, job\_id, action (`save`, `dismiss`, `applied`, `not_interested`), reason code (nullable), created |
| `preference_suggestions` | user\_id, proposed change, evidence (feedback IDs), state |

**Skill assertions.** `skill_assertions(user_id, skill_id or requirement text, assertion, created, withdrawn_at)` with assertion `has` or `does_not_have`. A `confirmed_gap` result exists only when a `does_not_have` assertion matches; otherwise missing evidence is always `no_evidence_recorded`. Confirming evidence for that skill withdraws the assertion automatically.

**Basis.** `resume_versions`, `resume_exports`, `match_analyses` and each feed build store a `basis` JSONB record (§16).

**System**

| Table | Key fields |
| --- | --- |
| `outbox` | id, task type, payload ref, idempotency key, status, attempts, next retry |
| `idempotency_keys` | user\_id, key, route, request hash, response, expires |
| `usage_counters` | user\_id, metric, period, count |
| `llm_calls` | trace id, user\_id (nullable), purpose, model, prompt version, tokens in/out, cost, latency, cache hit, error class |
| `audit_log` | actor, action, target, reason, time |
| `deletion_requests` | user\_id, requested, stages completed, completed |

**Enum rule:** every enum above is closed. Adding a value requires updating this section and a migration.

## 5. Profile pipeline

Import produces drafts; only the user's confirmation produces facts. Every stage is a typed function with validated input and output.

**5.1 Import**

1. Upload to a signed URL in object storage (limits: 10 MB, 10 pages proposed). Accepted: PDF with a text layer, DOCX, TXT/MD, LinkedIn data export (CSV files). Scanned PDFs: OCR is a later option; until then reject with `NO_EXTRACTABLE_TEXT`.
2. A sandboxed parsing worker (no network, CPU and memory limits, malware scan first) extracts text and layout blocks.
3. Section detection by rules first (heading lexicon in supported languages), LLM second for ambiguous blocks.
4. The extraction model returns typed draft entries (experiences, facts, education, skills, etc.) as JSON against a Pydantic schema. Fields it cannot read are null; it MUST NOT guess dates, numbers or responsibility levels.
5. Code validates: dates parse and are ordered, numbers in drafts appear verbatim in the source text, every draft carries the source text span it came from.
6. Skills and occupations are normalized (§6).
7. Drafts are saved with `status = draft`, `origin = import`. The UI groups them by role for review.

**5.2 Confirmation**

- Confirming sets `status = confirmed`, requires a responsibility level for each fact (pre-filled as a suggestion from the source verb; the user must accept or change it), and increments `profile_version` in the same transaction.
- Bulk confirm per role is allowed; numbers and responsibility levels are highlighted for review.
- Rejecting keeps the draft for audit but excludes it everywhere.

**5.3 Guided enrichment**

- Questions are generated from gaps: facts without outcomes, skills without evidence, roles with one bullet, target-occupation skills missing from the profile.
- Priority = expected improvement to resume quality checks + number of the user's recommended jobs that cite the related requirement. Top 3–5 shown at a time.
- Answers are free text; the extraction model turns them into draft facts, which the user confirms like imports.

**5.4 Profile embeddings**

- On each `profile_version` change (debounced, proposed 60 s), the embedder builds: one `overall` vector from headline, confirmed facts and skills, and one vector per target occupation from the facts most relevant to it.
- Contact details and names are excluded from embedding input.

**5.5 Export and deletion**

- `GET /v1/me/export` produces a JSON archive of all user-owned data plus resume files.
- Deletion: see §12.

## 6. Skill and occupation taxonomy

Supporting every profession requires a shared vocabulary for skills and occupations. Without it, "Postgres" and "PostgreSQL" are different skills and a nurse's licence is just text.

**Base taxonomy.** Use the European Commission's ESCO classification (occupations and skills, multilingual, free to reuse) as the backbone, with crosswalks to O\*NET for US-style titles and ISCO-08 occupation groups. Store it in `taxonomy_occupations`, `taxonomy_skills` and `taxonomy_relations` (broader, narrower, essential-for, optional-for). Licence terms and the current version are confirmed before import (T-OQ-1).

**Platform extensions.** ESCO lags fast-moving tools (new software, frameworks). The platform keeps an extension layer:

- `skill_aliases`: alias → skill ID, with language and source ("Postgres", "psql" → PostgreSQL).
- `skills_ext`: new skills not yet in the base, each mapped to its nearest broader ESCO concept.
- Additions come from frequent unmapped terms in job requirements, reviewed by a curator queue before they are used for matching.
- India-specific titles and qualifications (for example common degree names and professional certifications) are added as aliases and extensions.

**Normalization procedure** (for any free-text skill or occupation, from profiles or jobs):

1. Exact match on normalized alias (lowercase, punctuation-stripped, language-aware).
2. Otherwise embedding nearest neighbours over taxonomy labels and aliases (top 10).
3. If the top candidate's similarity is above `TAXONOMY_AUTO_ACCEPT` (proposed 0.92), accept. Between `TAXONOMY_REVIEW_MIN` (proposed 0.80) and that threshold, a fast model picks among candidates or returns `none`. Below, store as unmapped raw text.
4. Unmapped terms are kept (never dropped), still usable for text search, and counted for the curator queue.

**Uses:** skill overlap in matching (§9), requirement-to-fact mapping hints, resume keyword alignment, gap aggregation across jobs, and profession-aware resume sections (licences for regulated occupations, publications for research).

## 7. Resume engine

The engine is a pipeline of five stages. Only stage 3 calls a writing model; every other stage is deterministic code.

**7.1 Select (code)**

- Input: confirmed fact versions at the current `profile_version`, target (occupation ID or job version ID), template, length rule.
- Relevance score per fact = skill overlap with the target's skills (taxonomy IDs, weighted by importance for a job) + embedding similarity to the target + recency + outcome present. Weights in `resume_selection.yaml`, versioned.
- Greedy fill to the page budget per section, keeping chronology inside each role. Selected fact version IDs are recorded on the resume version.

**7.2 Plan (code)**

- Section order from the template and profession rules (for example licences early for regulated occupations, education first for freshers).
- Character budget per bullet and per section derived from the template's measured layout.

**7.3 Write (model)**

- Input: selected facts (structured), target requirements as normalized values (never raw job text), style rules, budgets. **Names and contact details are not sent**; they are inserted at render time.
- Output: typed statements, each `{type, text, cited_fact_version_ids}` where type is `candidate_fact`, `summary` or `connective`. Structured output against a JSON schema.

**7.4 Validate (code, then verifier)**

| Check | Rule | On failure |
| --- | --- | --- |
| Citation | Every `candidate_fact` and `summary` cites ≥ 1 confirmed fact version at the current profile version | Block |
| Numbers | Every number and unit in the text appears in a cited fact; digits only; only permitted derivation is duration from dates | Block |
| Dates, employers, titles | Must equal the cited entity's values | Block |
| Tools and skills | Each named tool resolves (via aliases) to a skill in a cited fact | Block |
| Responsibility | Verb class (lexicon `verb_classes.yaml`, per language) ≤ the fact's responsibility level | Block |
| Tense and completion | Planned or in-progress work never written as completed | Block |
| Semantic support | A verifier model from a different family than the writer judges whether the statement implies anything not in the cited facts; `connective` statements must contain no claims about the candidate | Block or flag |
| Style | Length within budget, no first-person pronouns unless the template allows, banned filler list | Auto-fix or suggest |

Blocked statements are retried once with the failure reason, then withheld and shown to the user with the reason. User edits are re-validated the same way. If the verifier is unavailable, statements that pass the code checks are marked `code_checked_only` and export shows a notice; export is not blocked.

**7.5 Render (code)**

- Templates are Typst source files (PDF) plus a matching `python-docx` builder (DOCX), each versioned. All templates share one structural contract: single column, standard headings from a fixed list per language, embedded standard fonts, no tables, text boxes, images or header/footer content, real text with a correct reading order.
- Rendering runs in the sandboxed `renderer` service; output files go to object storage.

**7.6 Parse-safety check (code)**

- Extract text from the PDF with two independent extractors (for example `pdfminer.six` and Poppler `pdftotext`), and from the DOCX with `python-docx`.
- Parse the extracted text with the platform's own section parser and compare against the resume version's source data: name, email, phone, each section heading, each employer, title and date range, each skill.
- Pass only if every field is recovered by both extractors in the right order. Failures name the field.
- Template CI runs the round-trip against a fixture set of synthetic profiles (short, long, fresher, every supported profession group) on every template change.

This check proves that our own extractors recover every field. It does not certify compatibility with any ATS vendor, and product copy MUST NOT claim that a resume passes every ATS. During beta, a few common ATS systems are spot-checked manually and the results recorded in `docs/decisions/`.

**7.7 Quality signals (code)**

Page count, bullet length distribution, share of bullets with an outcome, passive voice and filler detection, date-format consistency, gaps longer than `GAP_FLAG_MONTHS` (proposed 6) without an explanation. Shown as suggestions; none is a numeric "ATS score".

## 8. Job ingestion

Jobs are processed once and shared by every user. This is the main cost lever: extraction and embedding cost scales with the number of jobs, not the number of users.

**8.1 Sources**

- Each source is an adapter implementing `fetch(cursor) → records` with its own rate limits, attribution and terms record in `job_sources`.
- Candidate source types: public company job-board feeds published by applicant-tracking systems, licensed aggregator APIs, and later direct employer postings. A source is enabled only after a decision record covering terms, permitted use, attribution, geography coverage and measured text completeness (T-OQ-2).
- MUST NOT scrape sites whose terms prohibit it. Every source has a kill switch.
- User-pasted jobs go through the same pipeline but are stored as `user_submitted` jobs visible only to that user (they are user-owned, under RLS), unless matched to an existing catalog job.

**8.2 Pipeline**

```text
fetch → validate → clean → normalize → resolve identity → version
      → scam check → extract (model) → validate spans → normalize skills
      → embed → index → mark active
```

1. **Clean:** strip markup, remove invisible and zero-width characters and hidden HTML elements; record that something was stripped.
2. **Normalize:** company (alias table), title, location (geocoded to a place ID; "remote" with region scope), employment type, salary (amount, currency, period) when stated, posted date when stated. Anything not stated is `unknown`.
3. **Identity:** source requisition ID first; then canonical apply URL; then near-duplicate detection (MinHash over the normalized description with the same normalized company and title). Duplicates attach to one canonical job with several source refs. Near-duplicates below the auto-merge threshold go to a review queue.
4. **Version:** a new version only when the normalized description hash changes; relative dates and tracking parameters are excluded from the hash.
5. **Scam check:** rules (fees to apply, requests for ID documents or bank details, messaging-app-only contact, salary far outside range for the occupation) plus user reports. Flagged jobs are excluded from recommendations pending review.
6. **Extract:** a fast model returns atomic requirements and eligibility fields, each with a verbatim quote. Untrusted text is datamarked (§10).
7. **Validate spans:** code locates each quote in the cleaned text and records offsets; a quote that is absent or ambiguous makes that item `unknown`. Closed eligibility fields map from quotes by deterministic rules; conflicting quotes mean `unknown`.
8. **Normalize skills** (§6), **embed** the description and requirement list, **index**.

**Eligibility fields (closed enum):** `location`, `work_mode`, `employment_type`, `experience_years_min`, `experience_years_max`, `education_level`, `required_licence`, `visa_sponsorship`, `salary`, `language`, `notice_period`, `shift_or_travel`.

**8.3 Lifecycle**

- A job is `active` while its source still lists it. Disappearing from a feed sets `expired` only after `JOB_EXPIRE_GRACE_DAYS` (proposed 3) of consecutive absence, never on a single failed fetch.
- Jobs older than `JOB_MAX_AGE_DAYS` (proposed 60) without re-observation are expired.
- Expired jobs stay readable for users who saved them; they leave recommendations.

**Source health.** Every fetch writes a `source_runs` row with status `complete`, `partial` or `failed`, plus the job count. Only `complete` runs count toward a job's absence. A complete run returning fewer than half the jobs of the previous complete run is recorded as `partial`: no jobs expire and an alert fires. A source whose last run was not complete is shown as degraded, and expiry for its jobs is paused.

**8.4 Storage at scale**

- `job_versions`, `job_requirements` and `job_embeddings` are partitioned by observed month. HNSW indexes are built per partition; queries scan only partitions inside the active window.
- Old partitions are detached and archived after `JOB_ARCHIVE_MONTHS` (proposed 12).

## 9. Matching engine

Matching runs in four stages that get more expensive and more precise. Stages 0–2 are SQL and code with no per-user model calls; stage 3 calls a model only for jobs the user actually looks at.

| Stage | Input → output | Cost per user | Runs when |
| --- | --- | --- | --- |
| 0 Filter | All active jobs → eligible set | SQL | Every feed build |
| 1 Retrieve | Eligible set → top `RETRIEVE_K` (proposed 300) | SQL + vector index | Every feed build |
| 2 Rank | Top 300 → feed of `FEED_SIZE` (proposed 50) with score components | Code | Every feed build |
| 3 Deep match | One (user, job) → full match analysis | One or two model calls | User opens a job, pastes a job, or for the top `PRECOMPUTE_TOP_N` (proposed 5) feed cards per day |

**9.1 Stage 0: hard filters (SQL)**

From the current preference version: location (place ID within radius, or remote with matching region), work mode, employment type, experience range overlap (job unknown passes), required licence the user lacks and has confirmed as missing (excluded), active and not scam-flagged, posted within `FEED_MAX_AGE_DAYS` (proposed 30). Unknown job fields pass the filter but are surfaced as unknown later.

**9.2 Stage 1: hybrid retrieval**

Three candidate lists merged with reciprocal rank fusion:

1. Vector: cosine similarity between profile embeddings (overall and per target occupation) and job embeddings, HNSW with iterative scan for filtered queries.
2. Skill overlap: count of the job's required and preferred skill IDs present in the user's evidenced skills (taxonomy IDs, exact skill IDs count fully; broader or narrower relations count as partial and are labeled "related skill"; pairs on the curated look-alike list (for example React and React Native) never count as a match).
3. Text: full-text match of target titles and top skills against the job title and description.

**9.3 Stage 2: ranking (code)**

```text
rank_score = w_skill × required_skill_coverage + w_pref × preferred_skill_coverage
           + w_sem × semantic_similarity + w_goal × goal_fit + w_seniority × seniority_fit
           + w_fresh × freshness + w_fb × feedback_affinity − w_unknown × critical_unknowns
```

- Coverage here is computed from taxonomy IDs only (job requirements vs user's evidenced skills); it is a ranking signal, not the user-facing assessment.
- `feedback_affinity` comes from the user's saves and dismissals with reasons (per company, occupation, work mode, seniority), bounded to ± `FEEDBACK_MAX_WEIGHT` so feedback can reorder but never hide a category alone.
- Diversity: at most `FEED_MAX_PER_COMPANY` (proposed 3) per company in the top 20.
- Weights are versioned config, tuned offline on labeled data and online by experiment (§14). They are never shown as a probability.
- Feeds are cached per user in Redis and rebuilt on profile version change, preference change, new feedback (debounced), or every `FEED_REFRESH_HOURS` (proposed 12).

**9.4 Stage 3: deep match (model + code)**

1. Load the job version's requirements and eligibility (already extracted at ingestion).
2. **Eligibility (code):** compare each field to the preference version → `match`, `conflict` or `unknown`, each with its quote.
3. **Requirement mapping (model):** input is the requirement list (normalized values and IDs, datamarked quotes) and an evidence pack of the user's confirmed facts ranked by taxonomy overlap, capped at `EVIDENCE_PACK_TOKENS` (proposed 4,000). Output per requirement: `supported`, `partial` or `no_evidence_recorded`, with cited fact version IDs and a one-line reason. `confirmed_gap` comes only from the user.
4. **Validate (code):** cited facts exist, are confirmed and current, belong to the user; a requirement with no valid citation becomes `no_evidence_recorded`.
5. **Gap typing (code):** supported but absent from the user's current resume → presentation gap; `no_evidence_recorded` → evidence gap; `confirmed_gap` → learning gap.
6. **Goal fit (code):** occupation, seniority and industry vs career goals → `aligned`, `partly`, `not_aligned`, `unknown`.
7. **Open questions (code + template text):** one per `unknown` eligibility field that the user's preferences constrain.
8. **Verdict (code, rules in `verdict_rules.yaml`):**
   - **Gates first:** any gate the user doesn't meet (a `credential` or `work_authorization` requirement the user confirmed lacking, or an eligibility `conflict` with a hard preference) → *Not eligible*, regardless of coverage. Any `unknown` gate caps the verdict at *Good fit with gaps* and puts its question first. The coverage rules below apply only after the gates.
   - required coverage ≥ `STRONG_REQ` (proposed 0.8) and goal fit aligned → *Strong fit*
   - required coverage ≥ `GOOD_REQ` (proposed 0.6) → *Good fit with gaps*
   - required coverage ≥ `STRETCH_REQ` (proposed 0.35) → *Stretch*
   - otherwise *Poor fit*; fewer than `MIN_REQUIREMENTS` (proposed 3) atomic requirements → "Not enough detail in this posting" instead of a verdict.
   - Required coverage = Σ(support) / count over required items, with supported = 1, partial = 0.5, others = 0.

**9.5 Caching and staleness**

Each match analysis stores the evidence pack it was built from (fact version IDs) and its basis (§16). On every view, code rebuilds the evidence pack for that job from the current profile; this is deterministic and cheap.

- If the rebuilt pack differs from the stored one, the requirement mapping is outdated and is re-run on this view (one model call), with a banner naming the change ("updated because you added X").
- Eligibility, goal fit and verdict are recomputed in code on every view, using the current preference and goal versions, with no model call.

No fingerprint rules are needed: any change that would alter the model's input, including new facts, unmapped skills or taxonomy updates, changes the rebuilt pack and is detected.

**9.6 Feedback loop**

- Each feedback event updates `feedback_affinity` features and is logged for offline training.
- When `PREF_SUGGEST_MIN` (proposed 4) dismissals with the same reason occur within 14 days, a `preference_suggestion` is created. It is applied only on user confirmation.
- Feedback signals decay with a 30-day half-life (proposed), and signals about a dimension (for example work mode) are dropped when the user changes that preference. Users can view and reset learned feedback signals.

## 10. LLM layer

All model calls go through one internal gateway module. No other module may import a provider SDK.

**10.1 Gateway responsibilities**

- **Task registry:** each task (`resume_extract`, `profile_enrich`, `job_extract`, `taxonomy_pick`, `resume_write`, `statement_verify`, `requirement_map`) declares its prompt file, output schema (Pydantic), model tier, timeout, max retries and token caps.
- **Model routing:** tier `fast` (extraction, classification, mapping) and tier `writer` (resume writing); verifier is a different model family from the writer. Concrete models are config, chosen by quality on the eval sets (§14) and data-use terms (no training on our data, contractual).
- **Structured output:** JSON-schema-constrained responses; schema validation in code; one repair retry, then fail with `validation` error class.
- **Versioning:** `prompt_version` = content hash of the prompt file and schema, recorded on every output.
- **Caching:** response cache keyed by hash(task, prompt version, model, normalized input). Job extraction is cached per job version and shared across all users.
- **Budgets:** per-user daily token budget by plan, global daily spend cap per provider, and circuit breakers. Exceeding a cap queues or rejects new work with a clear message; it never silently falls back to a different paid provider.
- **Resilience:** timeouts, exponential backoff with jitter on 429/5xx, failover only to models listed in providers.yaml as approved for the task's data class and the user's region, with no-training and retention terms recorded; if no approved model is available, the work stays queued and is never sent elsewhere.
- **Logging:** every call writes `llm_calls` (tokens, cost, latency, cache hit, error class). Prompts and outputs with personal data are not logged by default; a sampled, access-controlled, short-retention store (proposed 14 days) is used for quality review.

**10.2 Prompt-injection containment**

Job text and uploaded documents are untrusted. Containment, not prompt wording, is the control:

- Models have **no tools** and cannot trigger actions. All writes are made by application code after validation.
- Untrusted text appears only inside clearly delimited, datamarked blocks, and only in extraction tasks (`job_extract`, `resume_extract`).
- Downstream tasks (`requirement_map`, `resume_write`) receive **normalized values and IDs**, not raw quotes. Quotes are shown to the user from the database, never passed back into generation.
- Model output is rendered as **plain text**. URLs in model output are stripped unless they equal a URL stored on the record. No Markdown or HTML from model output is ever rendered.
- Hidden-text stripping at ingestion (§8.2) and an adversarial fixture suite in CI (§14). The extractor's required/preferred label is cross-checked against simple cues ("must", "required", "nice to have", section headings); when they disagree, the item becomes unknown. Users can mark a requirement as "not actually required" for their own view.

**10.3 Data minimization**

- Names, email, phone, street address and links are never sent to models; resumes receive them at render time.
- Only confirmed facts needed for the task are sent (selected facts for writing; the evidence pack for mapping).
- `docs/data-flow.md` lists each task, which fields it sends, and to which provider. It is updated with every prompt change and reviewed in code review.

## 11. Async processing and API contracts

**11.1 Background work**

- Any operation that calls a model, renders a file or touches many rows runs as a task. The API writes the record and an `outbox` row in one transaction; workers claim queued rows with SELECT … FOR UPDATE SKIP LOCKED. Task state (queued, running, done, failed) lives only in Postgres, so no task can be lost between two systems; a running task whose worker dies is returned to queued after its lease expires.
- Queues by workload, each with its own worker pool and concurrency: `ingest`, `extract`, `embed`, `match`, `resume`, `render`, `email`, `maintenance`.
- Delivery is at-least-once; every task handler MUST be idempotent (keyed by task idempotency key; writes use upserts or version checks).
- Retries: exponential backoff with jitter, max `TASK_MAX_ATTEMPTS` (proposed 5); then dead-letter queue with an alert. Poison tasks never block other tasks.
- Per-user concurrency limit (proposed 3 running model tasks) so one user cannot starve others.
- Debounce: profile-version-driven work (embeddings, feed rebuild) coalesces bursts within `DEBOUNCE_SECONDS` (proposed 60) into one task.

**Usage limits.** A limited action first reserves usage with one atomic statement: `UPDATE usage_counters SET reserved = reserved + 1 WHERE user_id = $1 AND metric = $2 AND period = $3 AND used + reserved < $limit RETURNING id`. No row returned means `PLAN_LIMIT_REACHED`. The task converts the reservation into usage on success and releases it on failure; reservations not settled within 1 hour expire. The request's idempotency key prevents double counting.

**Tailoring sequence.** Reserve usage → freeze the basis (job version, profile version, match analysis ID) → select facts → write → validate → render → commit the resume version and convert the reservation, in one transaction. Failure before the commit releases the reservation and leaves nothing visible. If the profile changes during the run, the result completes against its frozen basis and is immediately shown as outdated (§16).

**11.2 API conventions**

- REST under `/v1`, JSON, OpenAPI generated from Pydantic models and committed.
- Long operations return `202 Accepted` with an operation object: id, type, state (queued, running, succeeded, failed, canceled), basis, result reference and error. Profile edits are synchronous and return the new profile version; clients poll `GET /v1/tasks/{id}` or subscribe via server-sent events.
- Side-effecting routes require an `Idempotency-Key` header; same key and body replays the stored response, same key with a different body returns `409 IDEMPOTENCY_CONFLICT`.
- Updates carry the entity `version`; a stale version returns `409 VERSION_CONFLICT`.
- Cursor pagination on all list routes.
- Rate limits per user and per IP (Redis token bucket), returning `429` with `retry_after`.
- Error shape: `{"error": {"code", "message", "details", "trace_id"}}`.

**11.3 Routes**

| Area | Routes |
| --- | --- |
| Account | `GET/PATCH /v1/me`, `GET /v1/me/export`, `POST /v1/me/delete` |
| Profile | `POST /v1/imports`, `GET /v1/profile`, CRUD on `/v1/experiences`, `/v1/facts`, `/v1/projects`, `/v1/education`, `/v1/certifications`, `/v1/achievements`, `/v1/skills`; `POST /v1/{entity}/{id}/confirm` and `/reject`; `GET /v1/enrichment-questions`, `POST /v1/enrichment-questions/{id}/answer` |
| Preferences, goals | `GET/PUT /v1/preferences`, `GET/PUT /v1/goals`, `GET /v1/preference-suggestions`, `POST /v1/preference-suggestions/{id}/accept` and `/dismiss` |
| Resumes | `POST /v1/resumes`, `GET /v1/resumes`, `GET /v1/resumes/{id}`, `POST /v1/resumes/{id}/generate`, `PATCH /v1/resumes/{id}/statements/{sid}`, `POST /v1/resumes/{id}/export` |
| Templates | `GET /v1/templates` |
| Jobs | `GET /v1/jobs/feed`, `GET /v1/jobs/search`, `GET /v1/jobs/{id}`, `POST /v1/jobs/paste`, `POST /v1/jobs/{id}/report` |
| Matching | `GET /v1/jobs/{id}/match`, `POST /v1/jobs/{id}/feedback`, `GET /v1/insights/skills` |
| Tailoring | `POST /v1/jobs/{id}/tailored-resume` |
| Usage | `GET /v1/usage` |
| System | `GET /v1/tasks/{id}`, `GET /healthz`, `GET /readyz` |

**Error codes (closed list):** `VALIDATION_ERROR`, `UNSUPPORTED_FORMAT`, `NO_EXTRACTABLE_TEXT`, `FILE_TOO_LARGE`, `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `IDEMPOTENCY_CONFLICT`, `VERSION_CONFLICT`, `UNCONFIRMED_ENTRY`, `RESPONSIBILITY_LEVEL_REQUIRED`, `INSUFFICIENT_JOB_DETAIL`, `PLAN_LIMIT_REACHED`, `RATE_LIMITED`, `DEPENDENCY_UNAVAILABLE`.

## 12. Security and privacy

**12.1 Threat model**

| Threat | Control |
| --- | --- |
| Cross-user data access (IDOR) | Application ownership checks + RLS + CI isolation tests (§3) |
| Account takeover | Managed OIDC, magic links with short expiry, Google sign-in, session revocation, new-device email |
| Malicious uploads (malware, zip bombs, parser exploits) | Size and page limits, malware scan, sandboxed parser with no network and resource limits, file-type sniffing not extension trust |
| Prompt injection via jobs or resumes | Containment rules (§10.2) |
| Data exfiltration via rendered output | Plain-text rendering, URL stripping, strict Content Security Policy |
| XSS, CSRF | Framework escaping, CSP, same-site cookies, CSRF tokens on cookie-auth mutations |
| Scraping of the catalog or user resumes | Rate limits, bot protection at the edge, no public resume enumeration (share links are unguessable and revocable) |
| Abuse of free tier (bulk accounts) | Email verification, per-IP signup limits, plan limits, anomaly alerts on cost per account |
| Insider access | Least-privilege IAM, no standing production data access, time-boxed audited break-glass |
| Secret leakage | Secrets manager, no secrets in code or images, rotation, secret scanning in CI |

**12.2 Encryption and secrets**

- TLS 1.2+ everywhere, including internal service traffic.
- Encryption at rest for database, backups, object storage and Redis, with keys in a cloud KMS.
- Contact fields (email, phone, address) additionally encrypted at the application level (envelope encryption) so they are unreadable in database dumps and analytics replicas.

**12.3 Data handling**

- Analytics and BI use a pseudonymized replica: no names, contact fields or free-text facts.
- Logs never contain resume text, facts, contact data or tokens; log scrubbing is tested.
- Retention: uploads kept while the account exists unless the user deletes them; sampled model inputs and outputs 14 days (proposed); audit log 1 year (proposed); backups 30 days (proposed).

**12.4 Deletion pipeline**

`POST /v1/me/delete` starts a `deletion_request` that, in order: revokes sessions, deletes object-storage files, deletes user-owned rows (cascades include embeddings, match analyses, feedback, usage), purges cache keys, removes the user from email lists, and records completion. Backups age out within the backup retention period; restored backups re-apply pending deletions from a tombstone list before use. The user sees two dates: removed from live systems, and fully purged from backups when backup retention expires (PRD A13). Until tombstones move to storage outside the backed-up database, every restore follows the checklist in docs/ops: restore, re-apply tombstones, verify no deleted user remains, then go live.

**12.5 Compliance**

- Consent records for optional processing (alerts, marketing, share links).
- A grievance and data-request contact as required by applicable law; legal review before launch (PRD OQ-8). The design keeps data region-configurable so residency requirements can be met per market.
- Model providers and other processors listed with data-processing agreements; no training on platform data.

## 13. Scalability, reliability and operations

**13.1 Design capacity** (proposed planning target, to be revised from beta data)

| Dimension | Target | Rough sizing |
| --- | --- | --- |
| Registered users | 1 million | — |
| Daily active users | 100,000 | \~1–2 feed builds/s average, \~15/s peak |
| Active jobs in catalog | 2 million | Job vectors at `halfvec(1024)` ≈ 2 KB each ≈ 4 GB plus index overhead |
| Profile vectors | \~3 per user | ≈ 6 GB at 1 million users |
| Resume exports | 50,000/day | Renderer pool scales horizontally |

These volumes stay within a single well-sized PostgreSQL primary with read replicas. When vectors pass \~10 million or filtered vector queries miss latency targets, move job vectors to `pgvectorscale` or a dedicated vector database for the job index only, behind the existing retrieval interface.

**13.2 Scaling strategy**

- API, web, workers and renderer are stateless and autoscale on CPU and queue depth.
- Read replicas serve catalog search, feed builds and analytics; writes and RLS-scoped user reads use the primary (or replicas with read-your-writes handling for the session).
- Redis caches feeds, job cards and taxonomy lookups.
- Embedding service batches requests; GPU nodes added when CPU throughput is the bottleneck.
- Ingestion is throttled per source and runs off-peak where possible.

**13.3 Service levels (proposed)**

| SLO | Target |
| --- | --- |
| API availability (monthly) | 99.5% at launch, 99.9% after hardening |
| Feed page p95 | ≤ 1.5 s (cached) / ≤ 3 s (rebuild) |
| Match page p95 when cached | ≤ 1 s; first deep match ≤ 15 s with progress |
| Resume generation p95 | ≤ 30 s |
| Export (render + ATS check) p95 | ≤ 10 s |
| Job freshness | New source postings searchable within 6 h |

**13.4 Graceful degradation**

- LLM provider down or budget hit: browsing, editing, existing resumes and exports keep working; new generation and new deep matches queue with a visible message.
- Embedding service down: feeds served from cache; new profiles get text and skill-overlap retrieval only.
- Redis down: feeds are rebuilt from Postgres on request and rate limiting falls back to a per-instance limiter; background tasks are unaffected because they live in Postgres.
- A failed source: other sources unaffected; the source is marked degraded.

**13.5 Data durability and recovery**

- Managed Postgres with multi-AZ, point-in-time recovery; RPO ≤ 5 minutes, RTO ≤ 1 hour (proposed).
- Object storage with versioning; cross-region backup copy.
- Quarterly restore drill into staging, recorded.

**13.6 Deployment and migrations**

- Every change through CI: tests, isolation tests, type checks, template round-trip suite, adversarial suite, migration dry run.
- Expand-contract migrations only; destructive steps run in a later release after code no longer uses the column.
- Blue/green or rolling deploys with automatic rollback on health or error-rate regression.
- Feature flags for every new model, prompt, ranking weight set and source; prompt and weight changes ship as config with a version, not code.

**13.7 Observability**

- OpenTelemetry traces across web, API, tasks and model calls with one trace ID.
- Dashboards: request latency and errors, queue depth and age per queue, dead-letter count, LLM spend per task and per active user, cache hit rates, ingestion freshness per source, parse-safety pass rate, match-page latency.
- Alerts (paged): availability SLO burn, dead-letter growth, spend over daily cap, RLS policy violation attempts, ingestion stalled > 12 h, deletion requests overdue.
- Audit log for admin access, deletions, source enable/disable, and preference-suggestion applications.

## 14. Quality evaluation and cost model

**14.1 Evaluation sets** (versioned in `evals/`, synthetic or consented data only)

| Set | Contents | Gates |
| --- | --- | --- |
| Resume parsing | 300+ resumes across profession groups, career stages, layouts and countries, labeled with entries and dates | Field-level precision and recall; Phase 1 gate (≥ 90% of roles and dates correct) |
| Parse-safety check | Synthetic profiles × every template × PDF/DOCX | 100% on the fixture set before a template ships; ≥ 98% on real exports |
| Faithfulness adversarial | Facts plus planted writer errors: changed numbers, inflated verbs, invented tools, completed-instead-of-planned, implied claims | Zero blocked-check misses on code checks; verifier TPR/TNR reported per failure type |
| Job extraction | 500+ postings across professions and markets with labeled requirements, importance and eligibility quotes | Requirement precision and recall; eligibility accuracy; unknown-as-match rate = 0 on the critical subset |
| Taxonomy mapping | Labeled free-text skills and titles → taxonomy IDs | Accuracy per profession group |
| Match relevance | (profile, job) pairs labeled Strong / Good / Stretch / Poor by reviewers blind to system output | Verdict agreement; pairwise ranking agreement with bootstrap 95% CIs |
| Injection | Jobs and resumes with hidden or explicit instructions, exfiltration URLs | Attack success = any change in output vs the clean twin, or any non-allowlisted URL in output; target 0 |

**14.2 Judges.** Where a model judges quality (paraphrase support, bullet quality), it is from a different family than the generator and validated against 50+ human-labeled pass and 50+ fail examples per failure type before use, with TPR/TNR recorded.

**14.3 Online measurement.**

- Experiments (A/B) for ranking weights, prompts and templates, with guardrail metrics (unsupported-statement rate, latency, cost per user).
- Feedback events (thumbs, saves, dismissals, exports without edits) logged as labels for offline evaluation.
- **Fairness slices:** match relevance, verdict distribution and resume quality checks reported by profession group, career stage, country and language. A slice more than `FAIRNESS_GAP` (proposed 10 points) below the overall rate blocks a ranking change.

**14.4 Cost model**

Cost per active user per month:

```latex
C_{user} = \sum_{t \in tasks} n_t \cdot (tokens^{in}_t \cdot p^{in}_{m(t)} + tokens^{out}_t \cdot p^{out}_{m(t)}) \cdot (1 - h_t) + C_{infra} / MAU
```

where n is uses per month, p is the price per token for the task's model, and h is the cache hit rate. Job extraction and embedding are shared catalog costs divided across all users.

Proposed planning assumptions for a typical active free user (to be replaced by measured values in Phase 1):

| Task | Uses / month | Tokens in / out per use |
| --- | --- | --- |
| `resume_extract` + `profile_enrich` | 1 + 5 | 6,000 / 2,000 and 1,000 / 300 |
| `resume_write` + `statement_verify` | 6 resumes | 4,000 / 1,500 and 3,000 / 500 |
| `requirement_map` | 15 deep matches | 5,000 / 1,000 |
| `taxonomy_pick` | 20 | 500 / 50 |

**Cost levers, in order:** cache shared job work; deep match only on demand; fast model tier wherever quality allows; batch verification per resume; plan limits (PRD §7); evidence-pack token caps.

## 15. Defaults, open questions and invariants

**15.1 Proposed defaults** (configuration, never hard-coded; startup fails on missing or invalid keys)

| Key | Value | Section |
| --- | --- | --- |
| `UPLOAD_MAX_MB` / pages | 10 / 10 | §5.1 |
| `TAXONOMY_AUTO_ACCEPT` / `TAXONOMY_REVIEW_MIN` | 0.92 / 0.80 | §6 |
| `GAP_FLAG_MONTHS` | 6 | §7.7 |
| `JOB_EXPIRE_GRACE_DAYS` / `JOB_MAX_AGE_DAYS` / `JOB_ARCHIVE_MONTHS` | 3 / 60 / 12 | §8.3 |
| `RETRIEVE_K` / `FEED_SIZE` / `PRECOMPUTE_TOP_N` | 300 / 50 / 5 | §9 |
| `FEED_MAX_AGE_DAYS` / `FEED_REFRESH_HOURS` / `FEED_MAX_PER_COMPANY` | 30 / 12 / 3 | §9 |
| `EVIDENCE_PACK_TOKENS` | 4,000 | §9.4 |
| `STRONG_REQ` / `GOOD_REQ` / `STRETCH_REQ` / `MIN_REQUIREMENTS` | 0.8 / 0.6 / 0.35 / 3 | §9.4 |
| `PREF_SUGGEST_MIN` | 4 in 14 days | §9.6 |
| `TASK_MAX_ATTEMPTS` / `DEBOUNCE_SECONDS` / per-user model tasks | 5 / 60 / 3 | §11.1 |
| Sampled model I/O retention / backups / audit log | 14 days / 30 days / 1 year | §12.3 |
| `FAIRNESS_GAP` | 10 points | §14.3 |

**15.2 Open questions**

| ID | Question | Blocks | Safe behavior until resolved |
| --- | --- | --- | --- |
| T-OQ-1 | ESCO licence terms, version, and O\*NET usage terms | Taxonomy import | Alias table only; unmapped skills kept as text |
| T-OQ-2 | Approved job sources per launch market | Phase 4 catalog | Paste-a-job only |
| T-OQ-3 | Concrete model choices per tier, with no-training data terms | Phase 1 | No model calls with real user data |
| T-OQ-4 | Managed auth provider and cloud provider | Phase 1 deploy | Local dev only |
| T-OQ-5 | Data residency per market after legal review | Non-India launch | Single India region; no non-India marketing |
| T-OQ-6 | Resume languages beyond English; verb lexicons per language | Later | English only |
| T-OQ-7 | OCR for scanned resumes | Later | Reject with `NO_EXTRACTABLE_TEXT` |

**15.3 Invariants** (each has at least one automated test referencing its ID)

| ID | Invariant |
| --- | --- |
| I-1 | Only confirmed, current fact versions appear in resumes, evidence packs and "supported" match results. |
| I-2 | No resume statement is exported unless it passed every code check; no statement exceeds its fact's responsibility level or alters a number, date, employer or title. |
| I-3 | Models have no tools. All writes happen in application code after validation. |
| I-4 | Raw job or upload text appears only in extraction prompts; generation receives normalized values and IDs. |
| I-5 | Model output and untrusted text are rendered as plain text; non-allowlisted URLs are never rendered. |
| I-6 | A user can never read or modify another user's data; RLS is enforced for every user-owned table and the API role has no RLS bypass. |
| I-7 | Missing source data is stored as `unknown`, never as a default or a guess. A missing or conflicting quote means `unknown`. |
| I-8 | No value is presented as a hiring probability or a numeric ATS score. |
| I-9 | Preferences change only by explicit user action; suggestions are applied only on confirmation. |
| I-10 | Names and contact details are never sent to a model provider. |
| I-11 | A completed deletion request leaves no user data in the database, object storage, caches or search indexes; backups expire within the stated retention. |
| I-12 | Plan limits and budget caps never block downloading an existing resume and never switch to an unapproved provider. |
| I-13 | The platform never submits applications and never scrapes a source whose terms prohibit it. |
| I-14 | Protected characteristics are never used as matching or ranking inputs. |
| I-15 | Every background task handler is idempotent; a repeated delivery produces no duplicate effect. |

## 16. Truth and freshness contract

Every generated output is an immutable snapshot of what was true when it was made. Freshness is computed by comparing that snapshot with the current state, never by tracking invalidations.

**16.1 Basis.** `resume_versions`, `resume_exports`, `match_analyses` and every feed build store a `basis` JSONB record with a fixed schema: `profile_version`, `fact_version_ids`, `preference_version`, `goals_version`, `job_version_id` (when a job is involved), `taxonomy_version`, model and prompt versions, rules versions (selection, verdict), and template version. Fact versions are never edited; an edit creates a new version.

**16.2 Freshness states** (computed on read):

- `current`: nothing the output used has changed.
- `outdated`: something it used has changed. A resume is outdated when any cited fact version is superseded or withdrawn, or its target job has a new version; a match mapping is outdated when the rebuilt evidence pack differs (§9.5); a feed is outdated when the profile or preference version is newer than its basis.
- `superseded`: a newer version of the same output exists.

**16.3 Recalculation policy**

| Output | When outdated |
| --- | --- |
| Resume version | Never regenerated automatically. Stays downloadable with a badge naming what changed; the user chooses to regenerate. |
| Match analysis | Eligibility, goal fit and verdict are recomputed in code on every view under current preferences; the mapping is re-run on that view only if the evidence pack changed. The original preference version stays in the basis for audit. |
| Feed | Rebuilt in the background, debounced; the page shows the profile version it reflects. |
| Export file | A downloaded file cannot change; its resume version carries the badge. |

**16.4 Updates versus corrections.** When editing a fact, the user marks it as an update (new information) or a correction (the old value was wrong). After a correction, resume versions citing the old fact version show a warning, and re-exporting them requires the user to acknowledge it or regenerate.

**16.5 Consistency.** The system is eventually consistent. Every match page and feed displays the profile version it reflects. Code-only layers update on the next view; model steps show "refreshing evidence…". Target: the feed reflects the latest profile within 60 seconds at p95 (proposed).

**16.6 Invariant I-16.** Every generated output stores a complete basis and shows its freshness state. A CI test rebuilds sample outputs from their basis and checks they are identical.
