"""Detect a job paste that is only a link (CEO D28). Nothing here ever fetches a URL."""

from app.truth.redact import URL_RE


def is_url_only(text: str) -> bool:
    tokens = text.split()
    return bool(tokens) and all(URL_RE.fullmatch(t.rstrip(".,;")) for t in tokens)
