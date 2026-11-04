"""Curator-approved skill aliases (TRD §6 step 1): map a raw skill term to a skill id. Code only."""

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import SkillAlias


def norm(term: str) -> str:
    """Alias key: case-folded, whitespace collapsed."""
    return " ".join(term.casefold().split())


def approved_aliases(db: Session, terms) -> dict[str, str]:
    """norm(term) -> skill_id for every approved alias among `terms` (one query)."""
    keys = {norm(t) for t in terms if t}
    if not keys:
        return {}
    return {k: v for k, v in db.execute(select(SkillAlias.alias_norm, SkillAlias.skill_id)
                                        .where(SkillAlias.alias_norm.in_(keys), SkillAlias.status == "approved"))}
