# TODOS

## Infrastructure

### Scale infrastructure for 1M users
**What:** Partitioning, read replicas, Redis cache, per-queue worker pools, GPU embedder (TRD §8.4, §13.1-13.2).
**Why:** Headroom beyond closed-beta load.
**Context:** Deferred 2026-10-08 (D9, R5). Beta runs single Postgres + one worker pool + Postgres rate limits. Upgrade triggers: queue age p95, API p95, DB CPU, feed launch.
**Effort:** L / M
**Priority:** P3
**Depends on:** Load metrics; feed launch.

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
- **Catalog feed + alerts, skills insight, shareable resume link, admin console**: built 2026-11-04 (branch
  `launch-readiness`). Feed sources stay off until T-OQ-2; see HANDOFF §8.
- **Scale infrastructure** (partial): per-type worker pools done; partitioning/replicas/Redis still open below.
