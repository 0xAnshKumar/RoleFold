"""Catalog ingestion (TRD §8.2-8.3): fetch -> clean -> normalize -> identity/dedupe -> version -> scam check -> active.

Deviation on purpose (cost): no model extraction or embedding at ingestion. A catalog job is extracted only when
a user opens its full check (the same job_extract + requirement_map path as a pasted job, cached by text), so
model spend follows what users look at, not catalog size. The feed ranks with code only (app/catalog/feed.py).
"""

import hashlib
import logging
import re
import uuid
from datetime import UTC, datetime, timedelta
from html import unescape
from html.parser import HTMLParser
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

from sqlalchemy import select, text, update
from sqlalchemy.orm import Session

from app.catalog.sources import Record, Source, parse_sources
from app.core.config import get_settings
from app.db.models import CatalogJob, CatalogSourceRun
from app.tasks.queue import Claimed

log = logging.getLogger("catalog")
MIN_DESCRIPTION_CHARS = 200  # same floor as a pasted job (routes/jobs.py MIN_PASTE_CHARS)
NEAR_DUPLICATE = 0.9  # shingle Jaccard at or above this, same company and title: one job, several source refs

# ---------------------------------------------------------------- clean


_BLOCK = {"p", "br", "div", "li", "ul", "ol", "tr", "h1", "h2", "h3", "h4", "h5", "h6", "section", "article"}
_VOID = {"br", "img", "hr", "input", "meta", "link", "wbr", "source", "area", "col", "embed"}
_DROP = {"script", "style", "template", "noscript", "iframe", "object", "svg"}
_HIDDEN_STYLE = re.compile(r"display\s*:\s*none|visibility\s*:\s*hidden|font-size\s*:\s*0(?![.\d])", re.IGNORECASE)
_ZERO_WIDTH = re.compile("[\u00ad\u200b-\u200f\u202a-\u202e\u2060-\u2064\ufeff]")


class _Text(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.out: list[str] = []
        self.stack: list[tuple[str, bool]] = []
        self.notes: set[str] = set()

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        hidden = (tag in _DROP or "hidden" in a or a.get("aria-hidden") == "true"
                  or bool(_HIDDEN_STYLE.search(a.get("style") or "")))
        if hidden:
            self.notes.add("hidden_html")
        if tag in _BLOCK:
            self.out.append("\n- " if tag == "li" else "\n")
        if tag not in _VOID:
            self.stack.append((tag, hidden))

    def handle_endtag(self, tag):
        for i in range(len(self.stack) - 1, -1, -1):  # tolerate mis-nested markup
            if self.stack[i][0] == tag:
                del self.stack[i:]
                break
        if tag in _BLOCK:
            self.out.append("\n")

    def handle_data(self, data):
        if not any(h for _, h in self.stack):
            self.out.append(data)


def clean(raw: str) -> tuple[str, list[str]]:
    """Plain text from posting HTML, minus hidden elements and invisible characters; notes say what was stripped."""
    parser = _Text()
    parser.feed(unescape(raw) if "&lt;" in raw else raw)  # Greenhouse sends entity-escaped HTML
    parser.close()
    body = "".join(parser.out)
    if _ZERO_WIDTH.search(body):
        parser.notes.add("invisible_characters")
        body = _ZERO_WIDTH.sub("", body)
    lines = (re.sub(r"[ \t\r\f\v\xa0]+", " ", ln).strip() for ln in body.split("\n"))
    return re.sub(r"\n{3,}", "\n\n", "\n".join(lines)).strip(), sorted(parser.notes)


# ---------------------------------------------------------------- normalize


_LEGAL = re.compile(r"\b(pvt|private|ltd|limited|inc|llc|llp|corp|corporation|gmbh|co)\b\.?", re.IGNORECASE)
_TRACKING = re.compile(r"^(utm_.*|gh_src|source|src|ref|referrer|lever-source.*|lever-origin|trk.*|fbclid|gclid)$", re.IGNORECASE)
_RELATIVE = re.compile(r"\b(posted|updated|reposted)?\s*(\d+\+?\s+(minute|hour|day|week|month)s?\s+ago|today|yesterday|just now)\b", re.IGNORECASE)


def key(text: str | None, legal: bool = False) -> str:
    t = (text or "").lower()
    if legal:
        t = _LEGAL.sub(" ", t)
    return " ".join(re.findall(r"[a-z0-9+#]+", t))


def url_key(url: str | None) -> str | None:
    """Canonical apply URL: lowercase host, no fragment, no trailing slash, tracking parameters removed."""
    if not url:
        return None
    p = urlsplit(url.strip())
    if p.scheme not in ("http", "https") or not p.netloc:
        return None
    query = urlencode(sorted((k, v) for k, v in parse_qsl(p.query) if not _TRACKING.match(k)))
    return urlunsplit(("https", p.netloc.lower().removeprefix("www."), p.path.rstrip("/"), query, ""))


def description_hash(text: str) -> str:
    """A new version only when this changes: relative dates and URL query strings don't count (TRD §8.2 step 4)."""
    t = re.sub(r"(https?://[^\s?#]+)[?#]\S*", r"\1", _RELATIVE.sub(" ", text.lower()))
    return hashlib.sha256(" ".join(t.split()).encode()).hexdigest()


def detect_remote(r: Record) -> bool | None:
    if r.remote is not None:
        return r.remote
    return True if re.search(r"\bremote\b", f"{r.location or ''} {r.title or ''}", re.IGNORECASE) else None


def shingles(text: str, n: int = 5) -> set[str]:
    w = re.findall(r"[a-z0-9]+", text.lower())
    return {" ".join(w[i:i + n]) for i in range(max(1, len(w) - n + 1))}


def similarity(a: str, b: str) -> float:
    x, y = shingles(a), shingles(b)
    return len(x & y) / len(x | y) if x | y else 0.0


# ---------------------------------------------------------------- scam rules (TRD §8.2 step 5)


SCAM_RULES = {
    "asks_for_fee": re.compile(
        r"\b(registration|processing|training|security|joining|application|kit)\s+(fee|fees|charges?|deposit)\b"
        r"|\bpay\s+(a|the|an)?\s*(refundable\s+)?(fee|deposit)\b", re.IGNORECASE),
    "asks_for_id_or_bank": re.compile(
        r"\b(send|share|submit|provide|whatsapp)\b[^.\n]{0,40}\b(aadha?ar|pan card|bank (account|details)|otp|ifsc|"
        r"debit card|credit card)\b", re.IGNORECASE),
}
_MESSAGING = re.compile(r"\b(whatsapp|telegram)\b|wa\.me/|t\.me/", re.IGNORECASE)


def scam_reasons(description: str, apply_url: str | None) -> list[str]:
    """Rules only. Not done: "salary far outside the occupation's range" (needs salary data per occupation)."""
    found = [name for name, rx in SCAM_RULES.items() if rx.search(description)]
    if _MESSAGING.search(description) and not apply_url:
        found.append("messaging_app_only_contact")
    return found


# ---------------------------------------------------------------- run


def _fields(r: Record, description: str, notes: list[str]) -> dict:
    return {
        "company": r.company, "title": r.title, "company_key": key(r.company, legal=True), "title_key": key(r.title),
        "location": r.location, "remote": detect_remote(r), "employment_type": r.employment_type,
        "apply_url": r.apply_url, "apply_url_key": url_key(r.apply_url), "posted_at": r.posted_at,
        "cleaning_notes": notes,
    }


def _canonical(db: Session, f: dict, description: str) -> uuid.UUID | None:
    """Identity after (source, external id): the same apply URL, else a near-identical posting (same company+title)."""
    live = (CatalogJob.duplicate_of.is_(None), CatalogJob.lifecycle == "active")
    if f["apply_url_key"]:
        hit = db.scalar(select(CatalogJob.id).where(CatalogJob.apply_url_key == f["apply_url_key"], *live).limit(1))
        if hit:
            return hit
    if f["company_key"] and f["title_key"]:
        for cid, other in db.execute(select(CatalogJob.id, CatalogJob.description).where(
                CatalogJob.company_key == f["company_key"], CatalogJob.title_key == f["title_key"], *live)):
            if similarity(description, other) >= NEAR_DUPLICATE:
                return cid
    return None


def ingest(db: Session, source: Source, records: list[Record], now: datetime | None = None) -> dict:
    """Upsert one fetch's records. Returns counts. The caller decides the run status before calling expire()."""
    now = now or datetime.now(UTC)
    existing = {j.external_id: j for j in db.scalars(select(CatalogJob).where(CatalogJob.source == source.key))}
    counts = {"new": 0, "updated": 0, "unchanged": 0, "rejected": 0, "duplicates": 0, "flagged": 0}
    seen: set[str] = set()
    for r in records:
        description, notes = clean(r.description)
        if not r.external_id or r.external_id in seen or not (r.title or "").strip() \
                or len(description) < MIN_DESCRIPTION_CHARS:
            counts["rejected"] += 1  # too thin to judge, or a repeat inside one listing
            continue
        seen.add(r.external_id)
        f, h = _fields(r, description, notes), description_hash(description)
        job = existing.get(r.external_id)
        if job is None:
            reasons = scam_reasons(description, r.apply_url)
            dup = _canonical(db, f, description)
            db.add(CatalogJob(
                id=uuid.uuid4(), source=source.key, external_id=r.external_id, description=description,
                description_hash=h, first_seen_at=now, last_seen_at=now, duplicate_of=dup,
                scam_state="suspected" if reasons else "none", scam_reasons=reasons, **f,
            ))
            db.flush()  # later records in this listing can dedupe against it
            counts["new"] += 1
            counts["duplicates"] += dup is not None
            counts["flagged"] += bool(reasons)
            continue
        for k, v in f.items():
            setattr(job, k, v)
        job.last_seen_at, job.absent_since, job.lifecycle = now, None, "active"
        if job.description_hash == h:
            counts["unchanged"] += 1
            continue
        job.description, job.description_hash, job.version = description, h, job.version + 1
        reasons = scam_reasons(description, r.apply_url)
        if job.scam_state in ("none", "suspected"):  # a reviewer's confirmed/cleared decision stands
            job.scam_state, job.scam_reasons = ("suspected" if reasons else "none"), reasons
        counts["updated"] += 1
        counts["flagged"] += bool(reasons)
    db.flush()
    return counts


def expire(db: Session, source: Source, run_started: datetime) -> int:
    """After a COMPLETE run: start the absence clock for jobs it didn't list, close those absent for the grace
    period (never on one failed fetch), and close anything unseen for JOB_MAX_AGE_DAYS."""
    s = get_settings()
    if source.full_listing:
        db.execute(update(CatalogJob).where(
            CatalogJob.source == source.key, CatalogJob.lifecycle == "active",
            CatalogJob.last_seen_at < run_started, CatalogJob.absent_since.is_(None),
        ).values(absent_since=run_started))
    expired = db.scalars(text("""
        UPDATE catalog_jobs SET lifecycle = 'expired'
        WHERE source = :src AND lifecycle = 'active'
          AND (absent_since < :grace OR last_seen_at < :max_age)
        RETURNING id
    """), {"src": source.key, "grace": run_started - timedelta(days=s.job_expire_grace_days),
           "max_age": run_started - timedelta(days=s.job_max_age_days)}).all()
    if expired:
        # shortcut: duplicates of a closed job become visible again as-is; re-dedupe them if several surface.
        db.execute(update(CatalogJob).where(CatalogJob.duplicate_of.in_(expired), CatalogJob.lifecycle == "active")
                   .values(duplicate_of=None))
    return len(expired)


def run_source(db: Session, source: Source) -> dict:
    """One fetch with its source_runs row. A failed fetch changes no job; a run listing fewer than half the jobs
    of the last complete run is `partial` and expires nothing (TRD §8.3)."""
    started = datetime.now(UTC)
    try:
        records = source.fetch()
    except Exception as e:  # noqa: BLE001 - network, JSON, file: the run is recorded, nothing else changes
        log.warning("catalog source %s failed: %s", source.key, e)
        db.add(CatalogSourceRun(source=source.key, status="failed", error=f"{type(e).__name__}: {e}"[:500],
                                started_at=started, finished_at=datetime.now(UTC)))
        return {"source": source.key, "status": "failed"}
    previous = db.scalar(select(CatalogSourceRun.job_count).where(
        CatalogSourceRun.source == source.key, CatalogSourceRun.status == "complete",
    ).order_by(CatalogSourceRun.started_at.desc()).limit(1))
    partial = source.full_listing and previous is not None and len(records) < previous / 2
    if partial:
        log.warning("catalog source %s listed %d jobs, last complete run %d: partial, no expiry",
                    source.key, len(records), previous)
    counts = ingest(db, source, records, started)
    expired = 0 if partial else expire(db, source, started)
    db.add(CatalogSourceRun(source=source.key, status="partial" if partial else "complete", job_count=len(records),
                            started_at=started, finished_at=datetime.now(UTC)))
    return {"source": source.key, "status": "partial" if partial else "complete", "expired": expired, **counts}


def enabled_sources() -> dict[str, Source]:
    return {s.key: s for s in parse_sources(get_settings().catalog_sources)}


def catalog_ingest(db: Session, task: Claimed) -> dict:
    """Worker task. A source removed from CATALOG_SOURCES since the task was queued is skipped (kill switch)."""
    source = enabled_sources().get(task.payload["source"])
    if source is None:
        return {"source": task.payload["source"], "status": "skipped", "reason": "not in CATALOG_SOURCES"}
    return run_source(db, source)
