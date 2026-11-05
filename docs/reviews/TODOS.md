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

## Review follow-ups (2026-11-06)

### SMTP STARTTLS with a verified SSL context
**What:** `api/app/catalog/alerts.py:92` calls `smtp.starttls()` with no context; pass `ssl.create_default_context()`.
**Why:** Without it the certificate is not verified, so alert email (user emails, job lists) can be intercepted.
**Priority:** P1 (security)

### Refuse the dev-login header outside dev
**What:** Refuse `X-Dev-User` in the Docker image and every non-dev environment, and strip it at the proxy.
**Why:** If dev auth is ever on by mistake, that header logs anyone in as any user.
**Priority:** P1 (security)

### Admin action to clear or confirm scam-flagged jobs
**What:** An admin console action (audited, with a reason) to clear a false scam flag or confirm it.
**Why:** Rule-based flags have false positives; today only a re-ingest can change `scam_state`.
**Priority:** P2

### Narrow hunt_admin grants
**What:** Column-level UPDATE on `tasks` only (status, attempts, run_after, lease_until, error fields); no read of raw facts.
**Why:** Least privilege: the admin role is BYPASSRLS, and support reads already go through hunt_app under RLS.
**Priority:** P2

### ID-token cookie size guard
**What:** Check the ID-token cookie size at login and fail clearly (or store it server-side) when near the 4 KB limit.
**Why:** A provider with many claims makes the browser drop the cookie silently, so sign-in loops.
**Priority:** P2

### Share-link rate limit on the trusted client IP, with LRU eviction
**What:** Key the share-link limiter (`api/app/routes/share.py`) on the IP the trusted proxy appended, and evict least-recently-used keys.
**Why:** The first `X-Forwarded-For` entry is client-supplied, so the limit is bypassable; clearing the whole map at 10,000 keys resets everyone's limit.
**Priority:** P2

### Alerts only to a verified email
**What:** Send alert digests only when the OIDC `email_verified` claim is true.
**Why:** Otherwise anyone can sign up with someone else's address and have job alerts sent to it.
**Priority:** P2

### Parser isolation and export as a background task
**What:** Run the PDF/DOCX parser subprocess as a separate uid with a concurrency limit; build the data export as a worker task.
**Why:** A hostile file shares the API's uid today, parallel parses can exhaust memory, and a large export blocks a request worker.
**Priority:** P2

### Feed performance
**What:** Batch the per-card queries, reuse the computed affinity, skip the per-render readyz call in prod, add `audit_log` indexes.
**Why:** The feed page does N queries per card, and admin audit reads scan the table.
**Priority:** P3

## Completed

- **Move deletion tombstones outside the backed-up database** (P1): done 2026-11-04. Write-once files in
  `TOMBSTONE_DIR`, `python -m app.tasks.reapply_tombstones`, runbook in `api/README.md`. Production still needs
  the directory on an object-locked bucket.
- **Catalog feed + alerts, skills insight, shareable resume link, admin console**: built 2026-11-04 (branch
  `launch-readiness`). Feed sources stay off until T-OQ-2; see HANDOFF §8.
- **Scale infrastructure** (partial): per-type worker pools done; partitioning/replicas/Redis still open below.
