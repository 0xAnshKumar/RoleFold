"""Recommendations feed (TRD §9.1-9.3, §9.6): SQL filter + text retrieval, then ranking in code. No model calls.

Cards carry a *preliminary fit* (strong / some / little skill overlap with the posting text), never a verdict:
the verdict needs the full check (deep match), which runs only when the user opens it and then counts as one
deep_match like a pasted job (routes/feed.py). Nothing is precomputed (PRECOMPUTE_TOP_N = 0 at beta): a
precomputed check would either spend model calls on jobs nobody opens or charge users for checks they never asked for.

Not built (yet): profile/job embeddings (D13; lexical retrieval is cheap and good enough at beta scale), taxonomy
IDs (no taxonomy exists; skills match by label with a look-alike list), preference suggestions after repeated
dismissals (TRD §9.6), a per-user feed cache (computed per request).
"""

import re
import uuid
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta

from sqlalchemy import func, select, text
from sqlalchemy.orm import Session

from app.catalog.ingest import key
from app.core.config import get_settings
from app.db.models import (
    CareerGoal,
    CatalogFeedback,
    CatalogJob,
    Fact,
    FactVersion,
    FeedSettings,
    Job,
    JobFeedback,
    PreferenceVersion,
    UserSkill,
)
from app.tasks.match import goal_fit, latest, tokens

RANK_VERSION = "rank-1"
WEIGHTS = {"skill": 3.0, "goal": 1.5, "fresh": 0.5, "feedback": 1.0, "unknown": 0.3}  # versioned with RANK_VERSION
FEEDBACK_MAX = 1.0  # TRD FEEDBACK_MAX_WEIGHT: feedback reorders, never hides a category on its own
HALF_LIFE_DAYS = 30
TOP, MAX_PER_COMPANY = 20, 3  # TRD §9.3 diversity
SENIORITY = {"intern", "junior", "senior", "sr", "staff", "lead", "principal", "head", "director", "manager"}
# Curated look-alikes (TRD §9.2): having the key does not mean having these, so they never count as it.
LOOKALIKE = {"react": ["react native"], "java": ["javascript"], "c": ["c++", "c#"], "go": ["google"]}


@dataclass
class UserSide:
    skills: dict[str, float]  # label (lowercase) -> 1.0 evidenced by a confirmed fact, 0.5 self-declared
    labels: dict[str, str]  # lowercase -> as the user wrote it
    goals: CareerGoal | None
    prefs: PreferenceVersion | None
    affinity: dict[str, float] = field(default_factory=dict)

    @property
    def terms(self) -> list[str]:
        words = {w for s in self.skills for w in re.findall(r"[a-z0-9]+", s)}
        words |= {w for t in (self.goals.target_occupations if self.goals else []) for w in tokens(str(t))}
        return sorted(w for w in words if len(w) > 1)[:60]


def user_side(db: Session, uid: uuid.UUID, now: datetime | None = None) -> UserSide:
    """Under the user's RLS context: confirmed facts' tools, the skills list, goals, preferences, feedback."""
    skills: dict[str, float] = {}
    labels: dict[str, str] = {}

    def add(raw: str | None, weight: float) -> None:
        label = (raw or "").strip()
        if 1 <= len(label) <= 60:
            skills[label.lower()] = max(skills.get(label.lower(), 0), weight)
            labels.setdefault(label.lower(), label)

    for tools in db.scalars(select(FactVersion.tools).join(Fact, Fact.id == FactVersion.fact_id)
                            .where(Fact.status == "confirmed", FactVersion.version == Fact.current_version)):
        for t in tools or []:
            add(t.get("raw"), 1.0)
    for s in db.scalars(select(UserSkill)):
        add(s.raw_label, 1.0 if s.evidence_fact_ids else 0.5)
    return UserSide(skills, labels, latest(db, CareerGoal), latest(db, PreferenceVersion),
                    affinity(db, uid, now or datetime.now(UTC)))


# ---------------------------------------------------------------- feedback (TRD §9.6, CEO D26)


def dims(job: CatalogJob, reason: str | None = None) -> set[str]:
    """What a feedback event is about. A reason narrows it; no reason means company and role words."""
    r = (reason or "").lower()
    if "location" in r and job.location:
        return {f"location:{key(job.location)}"}
    if "senior" in r:
        return {f"title:{w}" for w in tokens(job.title or "") if w in SENIORITY} or {f"company:{job.company_key}"}
    return {f"company:{job.company_key}"} | {f"title:{w}" for w in tokens(job.title or "")}


def feedback_state(db: Session) -> dict[uuid.UUID, CatalogFeedback]:
    """The latest feed feedback row per catalog job (its current state)."""
    rows = db.scalars(select(CatalogFeedback).distinct(CatalogFeedback.catalog_job_id)
                      .order_by(CatalogFeedback.catalog_job_id, CatalogFeedback.created_at.desc()))
    return {r.catalog_job_id: r for r in rows}


def affinity(db: Session, uid: uuid.UUID, now: datetime) -> dict[str, float]:
    """Decayed signal per dimension from feed saves/dismissals and from match-page thumbs on feed jobs.

    Feed card: save +1, dismiss with a reason -1, dismiss without one -0.3 (a weak signal, PRD §6.5).
    Match page (D26): "right" +0.5 (opened, and the read held up), "wrong: verdict too high" -0.5, "too low" +0.5.
    """
    reset = db.scalar(select(FeedSettings.signals_reset_at).where(FeedSettings.user_id == uid))
    events: list[tuple[CatalogJob, float, str | None, datetime]] = []
    state = feedback_state(db)
    jobs = {j.id: j for j in db.scalars(select(CatalogJob).where(CatalogJob.id.in_(list(state))))} if state else {}
    for fb in state.values():
        job = jobs[fb.catalog_job_id]
        if fb.action == "save":
            events.append((job, 1.0, None, fb.created_at))
        elif fb.action == "dismiss":
            events.append((job, -1.0 if fb.reason_code else -0.3, fb.reason_code, fb.created_at))
    for fb, job in db.execute(select(JobFeedback, CatalogJob).join(Job, Job.id == JobFeedback.job_id)
                              .join(CatalogJob, CatalogJob.id == Job.catalog_job_id)
                              .where(JobFeedback.action.in_(["assessment_right", "assessment_wrong"]))):
        reason = (fb.reason_code or "").lower()
        w = 0.5 if fb.action == "assessment_right" or "too low" in reason else -0.5 if "too high" in reason else 0
        if w:
            events.append((job, w, None, fb.created_at))
    out: dict[str, float] = defaultdict(float)
    for job, w, reason, at in events:
        if reset and at <= reset:
            continue
        decay = 0.5 ** (max(0.0, (now - at).total_seconds()) / 86400 / HALF_LIFE_DAYS)
        for d in dims(job, reason):
            out[d] += w * decay
    return dict(out)


def job_affinity(job: CatalogJob, learned: dict[str, float]) -> float:
    if not learned:
        return 0.0
    words = [learned.get(f"title:{w}", 0.0) for w in tokens(job.title or "")]
    score = (learned.get(f"company:{job.company_key}", 0.0) * 0.6 + (sum(words) / len(words) if words else 0) * 0.4
             + learned.get(f"location:{key(job.location)}", 0.0))
    return max(-FEEDBACK_MAX, min(FEEDBACK_MAX, score))


def learned_summary(learned: dict[str, float], limit: int = 4) -> list[dict]:
    """What the user can see and reset (PRD §6.5)."""
    top = sorted((kv for kv in learned.items() if abs(kv[1]) >= 0.3), key=lambda kv: -abs(kv[1]))[:limit]
    return [{"kind": d.split(":", 1)[0], "label": d.split(":", 1)[1], "direction": "more" if v > 0 else "fewer"}
            for d, v in top]


# ---------------------------------------------------------------- scoring (code)


def skill_hits(posting: str, skills: dict[str, float]) -> list[str]:
    """User skills named in the posting, by label, whole words only; look-alikes don't count."""
    text_l = posting.lower()
    hits = []
    for s in skills:
        t = text_l
        for other in LOOKALIKE.get(s, []):
            if other not in skills:
                t = t.replace(other, " ")
        if re.search(rf"(?<![a-z0-9]){re.escape(s)}(?![a-z0-9+#])", t):
            hits.append(s)
    return hits


def preliminary(weight: float, goal: str) -> str:
    """The card's early read from the posting text. Not a verdict and never shown as a number."""
    if weight >= 4 or (weight >= 3 and goal == "aligned"):
        return "strong"
    return "some" if weight >= 2 else "little"


def is_strong(item: dict) -> bool:
    """"Strong match" for email alerts: a strong early read and a role that isn't against the user's goals."""
    return item["fit"] == "strong" and item["_goal"] != "not_aligned"


def _has(values: list, word: str) -> bool:
    return any(word in str(v).lower() for v in values)


def passes(job: CatalogJob, prefs: PreferenceVersion | None) -> bool:
    """Stage 0 hard preferences (TRD §9.1). Anything the job doesn't state passes and shows as unknown later."""
    if prefs is None:
        return True
    modes = [str(m).lower() for m in prefs.work_modes]
    if modes and job.remote is True and not _has(modes, "remote"):
        return False
    if modes and job.remote is False and all("remote" in m for m in modes):
        return False
    if prefs.locations and job.location and job.remote is not True:
        loc = job.location.lower()
        if not any(str(p).lower() in loc for p in prefs.locations if str(p).strip()) and "remote" not in loc:
            return False
    if prefs.employment_types and job.employment_type:
        want = {key(str(t)).replace(" ", "") for t in prefs.employment_types}
        if key(job.employment_type).replace(" ", "") not in want:
            return False
    return True


def score(job: CatalogJob, side: UserSide, now: datetime) -> dict:
    hits = skill_hits(f"{job.title or ''}\n{job.description}", side.skills)
    weight = sum(side.skills[h] for h in hits)
    goal = goal_fit(job.title, side.goals)
    age = (now - (job.posted_at or job.first_seen_at)).total_seconds() / 86400
    fresh = min(1.0, max(0.0, 1 - age / get_settings().feed_max_age_days))  # a future "posted" date is not fresher
    unknown = bool(side.prefs and side.prefs.locations and not job.location and job.remote is None)
    rank = (WEIGHTS["skill"] * min(weight, 6) / 6 + WEIGHTS["goal"] * {"aligned": 1, "partly": 0.5}.get(goal["status"], 0)
            + WEIGHTS["fresh"] * fresh + WEIGHTS["feedback"] * job_affinity(job, side.affinity)
            - WEIGHTS["unknown"] * unknown)
    return {
        "fit": preliminary(weight, goal["status"]),
        "skills": [side.labels[h] for h in sorted(hits, key=lambda h: (-side.skills[h], h))][:6],
        "goal": goal["text"] if goal["status"] in ("aligned", "partly") else None,
        "_goal": goal["status"], "_rank": rank,
    }


def diversify(items: list[dict], top: int = TOP, per_company: int = MAX_PER_COMPANY) -> list[dict]:
    """At most `per_company` cards per company in the first `top`; the rest keep their order after them."""
    head, tail, seen = [], [], Counter()
    for it in items:
        c = it["_company"]
        if len(head) < top and seen[c] < per_company:
            seen[c] += 1
            head.append(it)
        else:
            tail.append(it)
    return head + tail


# ---------------------------------------------------------------- build


SOURCE_NAMES = {"greenhouse": "Greenhouse job board", "lever": "Lever job board", "manual": "Hunt catalog"}


def card(job: CatalogJob, scored: dict, saved: bool) -> dict:
    """src/lib/mock.ts `FeedItem`, plus internal keys starting with "_"."""
    return {
        "id": str(job.id), "title": job.title or "Untitled role", "company": job.company or "",
        "location": job.location, "remote": job.remote, "employmentType": job.employment_type,
        "applyUrl": job.apply_url, "source": SOURCE_NAMES.get(job.source.split(":", 1)[0], "Job board"),
        "posted": (job.posted_at or job.first_seen_at).date().isoformat(), "lastSeen": job.last_seen_at.date().isoformat(),
        "saved": saved, "check": None, **scored, "_company": job.company_key, "_first_seen": job.first_seen_at,
    }


def build(db: Session, uid: uuid.UUID, *, q: str | None = None, remote: bool | None = None,
          days: int | None = None, since: datetime | None = None, saved_only: bool = False,
          now: datetime | None = None) -> list[dict]:
    """Feed for the current user (RLS context set). Retrieval: active, not duplicate, not scam-flagged, recent;
    ordered by full-text rank of the user's skill and goal words, top RETRIEVE_K; then hard filters and rank."""
    s, now = get_settings(), now or datetime.now(UTC)
    side = user_side(db, uid, now)
    state = {j: fb.action for j, fb in feedback_state(db).items()}
    max_age = min(days or s.feed_max_age_days, s.feed_max_age_days)
    posted = func.coalesce(CatalogJob.posted_at, CatalogJob.first_seen_at)
    stmt = select(CatalogJob).where(
        CatalogJob.lifecycle == "active", CatalogJob.duplicate_of.is_(None),
        CatalogJob.scam_state.in_(["none", "cleared"]), posted >= now - timedelta(days=max_age),
    )
    if since is not None:
        stmt = stmt.where(CatalogJob.first_seen_at > since)
    if remote:
        stmt = stmt.where(CatalogJob.remote.is_(True))
    if saved_only:
        stmt = stmt.where(CatalogJob.id.in_([j for j, a in state.items() if a == "save"] or [uuid.uuid4()]))
    if q and q.strip():
        like = f"%{q.strip()[:100].replace('%', '').replace('_', ' ')}%"
        stmt = stmt.where(CatalogJob.title.ilike(like) | CatalogJob.company.ilike(like)
                          | CatalogJob.location.ilike(like) | CatalogJob.description.ilike(like))
    if side.terms:
        # shortcut: to_tsvector per row (no index); add a GIN expression index + @@ filter past ~50k active jobs.
        doc = func.to_tsvector(text("'simple'"), func.coalesce(CatalogJob.title, "") + " " + CatalogJob.description)
        stmt = stmt.order_by(func.ts_rank(doc, func.to_tsquery(text("'simple'"), " | ".join(side.terms))).desc())
    stmt = stmt.order_by(CatalogJob.first_seen_at.desc(), CatalogJob.id).limit(s.retrieve_k)

    items = [card(j, score(j, side, now), state.get(j.id) == "save")
             for j in db.scalars(stmt) if state.get(j.id) != "dismiss" and passes(j, side.prefs)]
    items.sort(key=lambda it: (-it["_rank"], it["id"]))
    return diversify(items)[: s.feed_size]


def public(item: dict) -> dict:
    return {k: v for k, v in item.items() if not k.startswith("_")}
