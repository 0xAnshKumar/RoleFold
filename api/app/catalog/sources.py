"""Source adapters (TRD §8.1): each turns one listing into Records. Ingest (app/catalog/ingest.py) does the rest.

No source is enabled by default. CATALOG_SOURCES lists the enabled ones (comma-separated), which is also the
kill switch: remove an entry and its next run never happens.

  greenhouse:<board token>[=Display name]   Greenhouse Job Board API (JSON)
  lever:<site>[=Display name]               Lever Postings API (JSON)
  ashby:<job board name>[=Display name]     Ashby Posting API (JSON)
  workable:<account subdomain>[=Display name]   Workable widget API (JSON)
  manual:<path to .json or .csv>            an admin-supplied file (see ManualSource)

Terms: we only call the JSON APIs that these applicant-tracking systems publish so companies can show their
open jobs on other sites. We never fetch or scrape HTML pages, never follow links inside postings, and send
users to the company's own apply URL (attribution). One GET per board per run, every CATALOG_INGEST_HOURS.
Each board still needs a T-OQ-2 decision record (terms, permitted use, geography, text completeness) before it
goes into CATALOG_SOURCES.
"""

import csv
import hashlib
import json
import re
import urllib.request
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path

USER_AGENT = "HuntJobCatalog/0.1 (job-board API client; no scraping)"
MAX_BYTES = 20 * 1024 * 1024
_TOKEN = re.compile(r"[A-Za-z0-9_.-]{1,100}")


@dataclass
class Record:
    external_id: str
    title: str | None
    company: str | None
    description: str  # may contain HTML; ingest cleans it
    apply_url: str | None
    location: str | None = None
    employment_type: str | None = None
    remote: bool | None = None
    posted_at: datetime | None = None


def get_json(url: str):
    """The only network call in the catalog. Tests replace it."""
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, "Accept": "application/json"})
    # 60 s per socket read: some boards (lever:zeta, ~1 MB) stream slowly and stalled past 20 s
    with urllib.request.urlopen(req, timeout=60) as r:
        body = r.read(MAX_BYTES + 1)
    if len(body) > MAX_BYTES:
        raise ValueError("listing larger than 20 MB")
    return json.loads(body)


def _ts(value) -> datetime | None:
    if isinstance(value, int | float):  # Lever: epoch milliseconds
        return datetime.fromtimestamp(value / 1000, UTC)
    try:
        t = datetime.fromisoformat(str(value)) if value else None  # 3.11+ reads a trailing Z
    except ValueError:
        return None
    return t.replace(tzinfo=UTC) if t and t.tzinfo is None else t  # Workable sends bare dates


class Source:
    key: str
    # True when every fetch lists all open jobs, so a job missing from complete runs has closed (TRD §8.3).
    full_listing = True

    def fetch(self) -> list[Record]:
        raise NotImplementedError


class GreenhouseSource(Source):
    """GET boards-api.greenhouse.io/v1/boards/{board}/jobs?content=true (public, no key)."""

    def __init__(self, board: str, name: str | None = None):
        self.key, self.board, self.name = f"greenhouse:{board}", board, name

    def fetch(self) -> list[Record]:
        data = get_json(f"https://boards-api.greenhouse.io/v1/boards/{self.board}/jobs?content=true")
        return [
            Record(
                external_id=str(j["id"]), title=j.get("title"),
                company=self.name or j.get("company_name") or self.board,
                description=j.get("content") or "",  # entity-escaped HTML; ingest unescapes
                apply_url=j.get("absolute_url"), location=(j.get("location") or {}).get("name"),
                posted_at=_ts(j.get("first_published") or j.get("updated_at")),
            )
            for j in data.get("jobs", [])
        ]


class LeverSource(Source):
    """GET api.lever.co/v0/postings/{site}?mode=json (public, no key)."""

    def __init__(self, site: str, name: str | None = None):
        self.key, self.site, self.name = f"lever:{site}", site, name

    def fetch(self) -> list[Record]:
        out = []
        for p in get_json(f"https://api.lever.co/v0/postings/{self.site}?mode=json"):
            cats = p.get("categories") or {}
            lists = "".join(f"<h3>{x.get('text', '')}</h3>{x.get('content', '')}" for x in p.get("lists") or [])
            mode = p.get("workplaceType")
            out.append(Record(
                external_id=str(p["id"]), title=p.get("text"), company=self.name or self.site,
                description=(p.get("description") or p.get("descriptionPlain") or "") + lists + (p.get("additional") or ""),
                apply_url=p.get("hostedUrl") or p.get("applyUrl"), location=cats.get("location"),
                employment_type=cats.get("commitment"),
                remote=True if mode == "remote" else False if mode in ("on-site", "hybrid") else None,
                posted_at=_ts(p.get("createdAt")),
            ))
        return out


class AshbySource(Source):
    """GET api.ashbyhq.com/posting-api/job-board/{board}?includeCompensation=false (public, no key; Ashby's
    documented Job Postings API for showing a company's jobs elsewhere). Unlisted postings are skipped."""

    def __init__(self, board: str, name: str | None = None):
        self.key, self.board, self.name = f"ashby:{board}", board, name

    def fetch(self) -> list[Record]:
        data = get_json(f"https://api.ashbyhq.com/posting-api/job-board/{self.board}?includeCompensation=false")
        out = []
        for j in data.get("jobs", []):
            if j.get("isListed") is False:
                continue
            places = [j.get("location")] + [s.get("location") for s in j.get("secondaryLocations") or []]
            mode = j.get("workplaceType")
            out.append(Record(
                external_id=str(j["id"]), title=j.get("title"), company=self.name or self.board,
                description=j.get("descriptionHtml") or j.get("descriptionPlain") or "",
                apply_url=j.get("jobUrl") or j.get("applyUrl"), location=" / ".join(filter(None, places)) or None,
                employment_type=j.get("employmentType"),  # "FullTime": the feed compares letters only
                remote=True if j.get("isRemote") or mode == "Remote" else False if mode in ("OnSite", "Hybrid") else None,
                posted_at=_ts(j.get("publishedAt")),
            ))
        return out


class WorkableSource(Source):
    """GET apply.workable.com/api/v1/widget/accounts/{account}?details=true (public, no key; the endpoint behind
    Workable's embeddable jobs widget). One call returns every published job with its description."""

    def __init__(self, account: str, name: str | None = None):
        self.key, self.account, self.name = f"workable:{account}", account, name

    def fetch(self) -> list[Record]:
        data = get_json(f"https://apply.workable.com/api/v1/widget/accounts/{self.account}?details=true")
        out = []
        for j in data.get("jobs", []):
            places = [", ".join(filter(None, (p.get("city"), p.get("country")))) for p in j.get("locations") or []
                      if not p.get("hidden")] or [", ".join(filter(None, (j.get("city"), j.get("country"))))]
            out.append(Record(
                external_id=str(j["shortcode"]), title=j.get("title"),
                company=self.name or data.get("name") or self.account, description=j.get("description") or "",
                apply_url=j.get("url") or j.get("shortlink"), location=" / ".join(filter(None, places)) or None,
                employment_type=j.get("employment_type") or None,
                remote=True if j.get("telecommuting") else None,  # False can still mean hybrid
                posted_at=_ts(j.get("published_on") or j.get("created_at")),
            ))
        return out


ADAPTERS = {"greenhouse": GreenhouseSource, "lever": LeverSource, "ashby": AshbySource, "workable": WorkableSource}


class ManualSource(Source):
    """An admin import file. JSON: a list of objects; CSV: a header row. Fields: id (optional), title, company,
    description, apply_url, location, employment_type, remote (true/false), posted_at (ISO date).

    Files add jobs; a job missing from a later file does not close (only JOB_MAX_AGE_DAYS expires it)."""

    full_listing = False

    def __init__(self, path: str):
        self.key, self.path = f"manual:{Path(path).name}", Path(path)

    def fetch(self) -> list[Record]:
        text = self.path.read_text(encoding="utf-8")
        rows = list(csv.DictReader(text.splitlines())) if self.path.suffix.lower() == ".csv" else json.loads(text)
        out = []
        for r in rows:
            r = {k.strip().lower(): (v.strip() if isinstance(v, str) else v) for k, v in r.items() if k}
            if not r.get("title") or not r.get("description"):
                continue
            ident = r.get("id") or hashlib.sha256(
                f"{r.get('company')}|{r['title']}|{r.get('apply_url')}".lower().encode()).hexdigest()[:24]
            remote = r.get("remote")
            out.append(Record(
                external_id=str(ident), title=r["title"], company=r.get("company"), description=r["description"],
                apply_url=r.get("apply_url") or None, location=r.get("location") or None,
                employment_type=r.get("employment_type") or None,
                remote=remote if isinstance(remote, bool) else {"true": True, "false": False}.get(str(remote).lower()),
                posted_at=_ts(r.get("posted_at")),
            ))
        return out


def parse_sources(spec: str) -> list[Source]:
    """CATALOG_SOURCES -> adapters. A malformed entry fails loudly instead of being skipped."""
    out: list[Source] = []
    for entry in filter(None, (e.strip() for e in spec.split(","))):
        kind, _, rest = entry.partition(":")
        if kind == "manual" and rest:
            out.append(ManualSource(rest))
            continue
        token, _, name = rest.partition("=")
        if kind not in ADAPTERS or not _TOKEN.fullmatch(token):
            raise ValueError(f"CATALOG_SOURCES: can't read {entry!r} "
                             "(greenhouse:<board>, lever:<site>, ashby:<board>, workable:<account>, manual:<file>)")
        out.append(ADAPTERS[kind](token, name.strip() or None))
    return out
