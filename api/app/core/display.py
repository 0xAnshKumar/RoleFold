"""Display strings shared by the response shapes in src/lib/mock.ts ("Jul 2021 – Present", "3 Oct 2026")."""

from datetime import date, datetime


def month(d: date | None) -> str:
    return d.strftime("%b %Y") if d else ""


def span(start: date | None, end: date | None) -> str:
    if not start and not end:
        return ""
    return f"{month(start) or '?'} – {month(end) or 'Present'}"


def years(start: date | None, end: date | None) -> str:
    """Education dates: year precision ("2015 – 2019"), since resumes often give only the year."""
    return " – ".join(str(d.year) for d in (start, end) if d)


def day(d: date | datetime | None) -> str:
    return f"{d.day} {d.strftime('%b %Y')}" if d else ""


def short_day(d: date | datetime | None) -> str:
    return f"{d.day} {d.strftime('%b')}" if d else ""


def role(title: str | None, employer: str | None, location: str | None = None) -> str:
    org = ", ".join(x for x in (employer, location) if x)
    return " · ".join(x for x in (title, org) if x)
