# Side Questions — PRD v4 and TRD v4

Oct 8, 2026 · @Piyush Jain

Thirty reviewer questions with their answers. Each says where the answer landed: an update to the PRD or TRD, an answer recorded here only, or a deliberately simpler approach to avoid over-engineering at this stage.

## The core question

**Question:** What was true when a result was generated, what is true now, and when should the result be recalculated? Until that is defined, resumes, matching, caching, feedback and background work can disagree.

**Answer:** every generated output is an immutable snapshot that records what it was built from, and freshness is computed by comparing that record with the current state.

- **What was true then.** Each resume version, match analysis, feed and export stores a `basis`: profile version, the exact fact version IDs used, preference and goal versions, job version, taxonomy version, and model, prompt and rules versions. Fact versions are never edited; an edit creates a new version, so the basis always points at what was true then.
- **What is true now.** The current profile, preferences, goals and job version.
- **Freshness.** Comparing the two gives `current` (nothing it used has changed), `outdated` (something it used has changed) or `superseded` (a newer version of the output exists).
- **When to recalculate:**

| Output | Policy when outdated |
| --- | --- |
| Resume | Never regenerated automatically; it is the user's document. Shows an "outdated" badge naming what changed; the user chooses to regenerate. |
| Match page | Eligibility, goal fit and verdict recomputed in code on every view, using current preferences (no model call). The requirement mapping is re-run on that view only if the evidence pack changed. |
| Recommendations feed | Rebuilt in the background; labeled with the profile version it reflects. |
| Export file | A downloaded file can't be changed; the resume version it came from carries the badge. |

**Landed in:** TRD §16 (new section, "Truth and freshness contract").

## Profile, resumes and matching

**Q1 · An old resume after a fact changes**

- **Question:** Profile v10 says 30%, resume v1 says 30%, then the user changes the fact to 25%. Is resume v1 still valid?
- **Answer:** Yes, as a snapshot of profile v10. It stays downloadable and shows "1 fact changed since this version (30% → 25%)". The rule "only current confirmed facts" applies to *generating* new content; exporting an existing version reproduces the fact versions it pinned.
- **Landed in:** TRD §16.

**Q2 · Stale match results after a profile change**

- **Question:** The cache fingerprint used only intersecting facts, so new evidence could be missed.
- **Answer:** The fingerprint is gone. On every view, code rebuilds the evidence pack for that job from the current profile (cheap and deterministic) and compares it with the pack stored on the analysis. Any difference, including new facts, unmapped skills or taxonomy changes, marks the mapping outdated and re-runs it on that view.
- **Landed in:** TRD §9.5.

**Q3 · "No evidence" versus "confirmed gap"**

- **Question:** How is "confirmed gap" stored, so missing information is never treated as a missing skill?
- **Answer:** A `skill_assertions` record is created only when the user explicitly says "I don't have this". Without that record the result is always `no_evidence_recorded`. Adding evidence for the skill later withdraws the assertion automatically.
- **Landed in:** TRD §4.

**Q4 and Q25 · Mandatory qualifications versus coverage**

- **Question:** A candidate could score high on requirements while missing a licence, visa or other must-have.
- **Answer:** Gates come before coverage. Requirements that are a mandatory credential (licence, certification, required degree), work authorization, or a hard preference (location, work mode) are gates.
  - A gate the user doesn't meet gives the verdict **Not eligible**, whatever the coverage.
  - An unknown gate caps the verdict at **Good fit with gaps**, with the eligibility question shown first.
  - Coverage thresholds apply only after gates.
- **Landed in:** PRD §6.3, TRD §9.4.

**Q12 · Which preferences apply to an old match**

- **Question:** Should an old match use the preferences from when it was made, or current ones?
- **Answer:** Always current ones. The preference-dependent parts (eligibility, goal fit, verdict) are recomputed in code on every view, so they cost nothing. The preference version used originally stays in the basis for audit only.
- **Landed in:** TRD §16.

**Q18 · Complete snapshot contract**

- **Question:** Outputs depend on many versions; which are recorded?
- **Answer:** All of them, in one fixed `basis` schema: profile, fact versions, preferences, goals, job, taxonomy, model, prompt, rules and template versions. A test rebuilds an output from its basis to prove it's reproducible.
- **Landed in:** TRD §16.

**Q20 · Tailored resume failures across systems**

- **Question:** Tailoring touches the job, profile, match, usage, model, validation and rendering. What happens when a step fails?
- **Answer:** Simple ordered steps with one commit point, not a saga framework: reserve usage → freeze the basis → select facts → write → validate → render → commit the resume version and convert the reservation to usage. Failure before the commit releases the reservation and leaves nothing visible. If the profile changes mid-run, the result completes against its frozen basis and is immediately marked outdated.
- **Landed in:** TRD §11.1 (simplified).

**Q30 · The central source-of-truth contract**

- **Answer:** See *The core question* above.
- **Landed in:** TRD §16.

## Jobs and sources

**Q5 · Who owns a pasted job**

- **Question:** Catalog jobs are shared; pasted jobs are private. How do both fit one data model and RLS?
- **Answer:** `jobs.owner_user_id` is empty for catalog jobs and set for pasted jobs; job child tables carry the same column. One RLS rule covers all job tables: owner is empty or equals the current user. Ingestion writes only catalog rows; the paste route writes only owned rows. A paste that duplicates a catalog job is linked to it, never merged into or promoted to the shared catalog.
- **Landed in:** TRD §4.

**Q9 and Q27 · A source outage looks like jobs disappearing**

- **Question:** If a source API fails and returns nothing, jobs could be wrongly expired.
- **Answer:** Every fetch is recorded in `source_runs` as `complete`, `partial` or `failed`. Only complete runs count toward a job's absence. A complete run that returns fewer than half the jobs of the previous complete run is treated as partial: nothing expires, and an alert fires.
- **Landed in:** TRD §8.3.

**Q10 · Scam detection is more than a flag**

- **Question:** Suspected, reviewed safe, confirmed, user-reported and false-positive states are missing.
- **Answer:** Four states are enough for now: `none` → `suspected` (rules or user reports) → `confirmed` or `cleared`. Suspected and confirmed jobs are excluded from recommendations; confirmed jobs are hidden everywhere. `cleared` stops the same rule re-flagging the job until its content changes. The count of cleared jobs is the false-positive measure, and user reports are a counter on the job, not a separate state.
- **Landed in:** TRD §4 (simplified from the six states proposed).

**Q17 · Job identity edge cases**

- **Question:** How are syndicated jobs, URL changes, requisition ID changes, edits and reposts handled?
- **Answer:** Rules applied in order:
  1. Same source and same requisition ID: the same job; a changed description creates a new version.
  2. Requisition ID changed, but the same apply URL or near-identical description: the same job.
  3. Another source with the same normalized company, compatible title and location, and a near-duplicate description: the same canonical job, with an extra source reference (syndication).
  4. Close matches below the auto-merge threshold go to a review queue.
  5. A repost after the job expired is treated as a new job, so it can be recommended again.

  URLs are attributes, not identity. These rules already fit §8.2's identity step, so no new tables are needed.
- **Landed in:** answered here.

**Q24 · A malicious job poisons the extractor**

- **Question:** Quote validation proves text exists, not that "required" is correct. Malicious text could mark an optional skill as mandatory.
- **Answer:** The damage is bounded by design: extraction output can only change how that one job is assessed. It never writes user data, never reaches resume writing as raw text, and never triggers actions. To reduce wrong labels, the required/preferred label is cross-checked against simple cues ("must", "required", "nice to have", section headings). If the model and the cues disagree, the item becomes `unknown`. Users can also mark "this isn't required".
- **Landed in:** TRD §10.2 (one rule added); double extraction for gates is deferred.

## Platform and operations

**Q6 · "Immediate" updates versus background processing**

- **Question:** The PRD says profile changes update matches immediately, but the TRD uses queues and debouncing.
- **Answer:** The PRD now says "within seconds". Every match page and feed shows which profile version it reflects. After an edit, the code-only parts (eligibility, verdict) update on the next view right away, and "refreshing evidence…" shows while a model step runs.
- **Landed in:** PRD §6.5, TRD §16.

**Q7 · Tasks lost between the outbox, Redis and workers**

- **Question:** Idempotency prevents duplicates, but a task could still be lost between Postgres, Redis and the worker.
- **Answer:** Redis is no longer the task queue. Tasks are rows in a Postgres table that workers claim with `FOR UPDATE SKIP LOCKED`. The task is written in the same transaction as the record, and its state (`queued`, `running`, `done`, `failed`) lives only in Postgres, so there is no gap between two systems. Redis stays for caching and rate limits only. This is simpler as well as safer.
- **Landed in:** TRD §2, §11.1.

**Q13 · Usage limits bypassed by concurrent requests**

- **Question:** Two simultaneous requests at 9/10 could both succeed.
- **Answer:** A limited action reserves usage with one atomic update that only succeeds while used plus reserved is below the limit. The task converts the reservation to usage on success and releases it on failure; abandoned reservations expire after an hour. The idempotency key stops retries from counting twice.
- **Landed in:** TRD §11.1.

**Q19 · API contracts for long operations**

- **Question:** Request, response and state semantics are missing for generation, tailoring, matching, export and usage.
- **Answer:** One shared *operation* object for every long action: id, type, state (`queued`, `running`, `succeeded`, `failed`, `canceled`), basis, result reference, error. Clients poll it or subscribe to progress events. Profile edits stay synchronous and return the new profile version. Full request and response bodies come from the OpenAPI schema as each endpoint is built, rather than being written up front.
- **Landed in:** TRD §11.2 (simplified).

**Q21 · Two meanings of "deletion completed"**

- **Question:** Live data is deleted quickly but backups remain until retention ends.
- **Answer:** The user sees two dates: removed from live systems, and fully purged from backups.
- **Landed in:** PRD §8, TRD §12.4.

**Q22 · Backup restore after deletion**

- **Question:** How do tombstones survive and get reapplied after a restore?
- **Answer:** For now, a tombstone table (hashed user ID and deletion date) plus a written restore checklist: restore, re-apply tombstones, verify that no deleted user remains, then go live. Before the first production restore with real users, tombstones move to storage outside the backed-up database so a restore can't roll them back.
- **Landed in:** answered here (simplified; hardening deferred).

**Q23 · Model failover and data governance**

- **Question:** Failover could send data to a provider not approved for it.
- **Answer:** A provider allowlist (`providers.yaml`) records which data types each model may receive, its regions, and its no-training and retention terms. The gateway only fails over within that list. If nothing approved is available, the work waits in the queue; it is never sent elsewhere.
- **Landed in:** TRD §10.1.

## Product claims and quality

**Q8 · The ATS check is overstated**

- **Question:** The check proves our own extractors can read the file, not that every ATS can.
- **Answer:** Correct. It is renamed the **parse-safety check**, and the product never claims compatibility with every ATS. During beta, a few common ATS systems are spot-checked by hand.
- **Landed in:** PRD §3, §5.4, §9; TRD §7.6.

**Q11 and Q26 · Old or contradictory feedback**

- **Question:** Old dismissals of onsite jobs could keep affecting ranking after the user switches to hybrid, and behavior from months ago never fades.
- **Answer:** Feedback signals fade with a 30-day half-life (proposed). Signals about a dimension, such as work mode, are dropped when the user changes that preference. Because recent behavior weighs more, contradictions resolve toward what the user does now. Users can view and reset learned signals.
- **Landed in:** TRD §9.6 (one line).

**Q14 · What "applied" means**

- **Question:** The platform can't verify that an application was submitted.
- **Answer:** The status reads "Marked as applied (by you)". It is self-reported and never presented as verified tracking.
- **Landed in:** PRD §7.

**Q15 · "Any profession" versus tested quality**

- **Question:** Quality can't be equally validated for every profession at launch.
- **Answer:** Every profession can use the platform. Profession groups that pass the quality gates at launch are labeled *supported*; the rest are labeled *beta*. Quality is reported per group, and groups move to supported as evaluation data grows.
- **Landed in:** PRD §2.

**Q16 · Taxonomy mapping creates false matches**

- **Question:** "React Native" could map to "React", or "Financial modeling" to "Financial analysis".
- **Answer:**
  - Only an exact skill ID gets full credit.
  - Broader or narrower skills get partial credit and are labeled "related skill" on the match page.
  - A curated list of look-alike pairs (React and React Native, financial modeling and financial analysis) is never merged and has regression tests.
  - Users can correct a mapping on their own profile.
- **Landed in:** TRD §9.2 (one line); the look-alike list lives with the taxonomy extensions (§6).

**Q28 · Broken cross-references**

- **Answer:** Fixed. The TRD's reading guide is now numbered §0. PRD references to TRD §16 and §20 now point to §14 and §15.3.
- **Landed in:** PRD §1, §8, §9, §12; TRD §0.

**Q29 · Fairness isn't operational**

- **Question:** Slices, sample sizes and the blocking procedure aren't defined.
- **Answer:** For now, report quality per slice: profession group, career stage, country and language. The metrics are match relevance, unsupported-statement rate and parse-safety pass rate. A slice needs at least 200 rated events to be reported; below that it shows "insufficient data". The 10-point gap is a review trigger owned by the product lead, not an automatic release blocker. Statistical blocking is added after launch, once slices have enough data.
- **Landed in:** answered here (simplified).
