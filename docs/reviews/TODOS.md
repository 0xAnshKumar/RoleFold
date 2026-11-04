# TODOS

## Job seeking

### Catalog ingestion, recommendations feed and email alerts
**What:** Build TRD §8 ingestion, §9.1-9.3 retrieval/ranking, §9.6 feedback loop and PRD §6.2 feed + alerts.
**Why:** Discovery of jobs the user would not find; drives the "acted on a recommended job" half of the north star.
**Context:** Deferred by CEO review 2026-10-08 (D5, row R1). Launch is paste-first. Before building, fix: feed cards need a non-verdict "preliminary fit" state (deep match runs only for top N), alert "strong match" definition and cost, and precompute vs plan-limit accounting. Match-page thumbs (D26) supply labelled data for ranking. Profile embeddings (D13) return with this.
**Effort:** XL (human) / L (CC)
**Priority:** P2
**Depends on:** T-OQ-2 source terms per market; paste-loop metrics from beta.

### Skills insight view
**What:** PRD §6.4 aggregate gaps across best-fit jobs.
**Why:** "What should I learn next" for switchers and learning-gap users.
**Context:** Deferred 2026-10-08 (D6, R2). Gap types are stored per match analysis, so no migration needed. Needs enough analysed jobs per user to be meaningful.
**Effort:** M / S
**Priority:** P3
**Depends on:** Catalog/feed or high paste volume per user.

## Resume

### Shareable resume link
**What:** Read-only web resume behind an unguessable, revocable link (PRD §7).
**Why:** Convenience sharing; possible growth loop.
**Context:** Deferred 2026-10-08 (D7, R3). Needs consent record, revocation, rate limits, enumeration defence.
**Effort:** M / S
**Priority:** P3
**Depends on:** None.

## Infrastructure

### Scale infrastructure for 1M users
**What:** Partitioning, read replicas, Redis cache, per-queue worker pools, GPU embedder (TRD §8.4, §13.1-13.2).
**Why:** Headroom beyond closed-beta load.
**Context:** Deferred 2026-10-08 (D9, R5). Beta runs single Postgres + one worker pool + Postgres rate limits. Upgrade triggers: queue age p95, API p95, DB CPU, feed launch.
**Effort:** L / M
**Priority:** P3
**Depends on:** Load metrics; feed launch.

### Admin web console
**What:** Internal UI for audited support access, DLQ replay, taxonomy curator queue (and later scam/source admin).
**Why:** Friendlier ops for non-engineers.
**Context:** Beta ships audited CLI scripts + runbooks (D29). UI when support staff are non-engineers or feed/scam review arrives.
**Effort:** M / S
**Priority:** P3
**Depends on:** Feed launch or support hiring.

## Quality

### Quality work for non-launch profession groups
**What:** Eval sets, taxonomy tuning and fairness slices for profession groups outside the launch set (PRD §2, OQ-2; TRD §14.1, §14.3).
**Why:** Move groups from "beta" to "supported".
**Context:** Deferred 2026-10-08 (D10, R6). Acceptance A15 (nurse + welder) needs at least one regulated profession in the launch set, or A15 is rescoped to the beta-label path. Decide with OQ-2.
**Effort:** L / M
**Priority:** P2
**Depends on:** OQ-2 launch profession list.

## Completed

- **Move deletion tombstones outside the backed-up database** (P1): done 2026-11-04. Write-once files in
  `TOMBSTONE_DIR`, `python -m app.tasks.reapply_tombstones`, runbook in `api/README.md`. Production still needs
  the directory on an object-locked bucket.
