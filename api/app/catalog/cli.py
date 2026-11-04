"""Catalog admin commands (run from api/, connect as hunt_worker via WORKER_DATABASE_URL):

  python -m app.catalog.cli tick              enqueue due source fetches and alert digests (cron: hourly)
  python -m app.catalog.cli ingest <source>   fetch one enabled source now, e.g. manual:jobs.csv or greenhouse:acme
  python -m app.catalog.cli sources           list the sources CATALOG_SOURCES enables
"""

import json
import sys

from sqlalchemy.orm import Session

from app.catalog.alerts import tick
from app.catalog.ingest import enabled_sources, run_source
from app.core.config import get_settings
from app.db.session import engine_for


def main(argv: list[str]) -> int:
    cmd, *args = argv or ["help"]
    if cmd == "sources":
        print("\n".join(enabled_sources()) or "No sources enabled (set CATALOG_SOURCES).")
        return 0
    if cmd not in ("tick", "ingest") or (cmd == "ingest" and len(args) != 1):
        print(__doc__)
        return 2
    url = get_settings().worker_database_url
    if not url:
        raise SystemExit("WORKER_DATABASE_URL is not set (connect as hunt_worker).")
    with Session(engine_for(url)) as db, db.begin():
        if cmd == "tick":
            out = tick(db)
        else:
            source = enabled_sources().get(args[0])
            if source is None:
                raise SystemExit(f"{args[0]} is not enabled in CATALOG_SOURCES ({', '.join(enabled_sources()) or 'none'}).")
            out = run_source(db, source)
    print(json.dumps(out, default=str))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
