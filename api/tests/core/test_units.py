import importlib.util
import uuid
from datetime import date
from pathlib import Path

import pytest
from pydantic import ValidationError

from app.db.models import CATALOG_TABLES, RLS_TABLES, SYSTEM_TABLES, Base, Task
from app.routes.jobs import description_hash
from app.routes.profile import ExperienceIn, content_hash
from app.tasks.deletion import pseudonym
from app.tasks.queue import DEAD_MESSAGE, backoff_seconds, operation

VERSIONS = Path(__file__).parents[2] / "alembic" / "versions"


def load_migration(name: str = "0001_initial"):
    spec = importlib.util.spec_from_file_location(f"m{name[:4]}", VERSIONS / f"{name}.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def test_every_user_owned_table_is_under_rls():
    for name, table in Base.metadata.tables.items():
        if name in SYSTEM_TABLES + CATALOG_TABLES:
            continue
        assert name in RLS_TABLES, name
        assert RLS_TABLES[name] in table.c


def test_migration_rls_list_matches_models():
    later = load_migration("0005_achievements_languages")
    share = load_migration("0006_share_links")
    every = {k: v for f in sorted(VERSIONS.glob("0*.py")) for k, v in getattr(load_migration(f.stem), "RLS_TABLES", {}).items()}
    assert every == RLS_TABLES
    assert later.rls_sql("languages", "user_id").count("app_current_user_id()") == 5
    # The public read is SELECT-only and never sees a revoked link.
    sql = share.rls_sql("share_links", "user_id")
    assert sql.count("app_current_user_id()") == 5 and sql.count("app_current_share_token()") == 1
    assert "FOR SELECT USING ((user_id = app_current_user_id() OR (revoked_at IS NULL AND token_hash" in sql


def test_policies_fail_closed_and_split():
    m = load_migration()
    sql = m.rls_sql("facts", "user_id")
    assert "FORCE ROW LEVEL SECURITY" in sql
    assert "FOR INSERT WITH CHECK (user_id = app_current_user_id())" in sql
    assert "FOR UPDATE USING (user_id = app_current_user_id()) WITH CHECK" in sql
    assert "current_setting('app.user_id', true)" in m.FUNCTIONS


def test_backoff_grows_with_jitter_and_caps():
    for attempts in range(1, 15):
        d = backoff_seconds(attempts)
        assert min(30 * 2.0 ** (attempts - 1), 600) * 0.5 <= d <= min(30 * 2.0 ** (attempts - 1), 600)
    # Regression: 5 attempts used to span ~30 s, so one busy minute at the AI provider killed a resume import.
    assert sum(min(30 * 2.0 ** (a - 1), 600) * 0.5 for a in range(1, 5)) >= 220


def test_dead_letter_shows_as_failed_operation():
    t = Task(id=uuid.uuid4(), type="match", status="dead", payload={}, error_code="INTERNAL_ERROR", error_message="x")
    op = operation(t)
    assert op["state"] == "failed" and op["error"] == {"code": "INTERNAL_ERROR", "message": DEAD_MESSAGE}
    assert "retry automatically" not in DEAD_MESSAGE


def test_pseudonym_is_stable_and_hides_id():
    uid = uuid.uuid4()
    assert pseudonym(uid) == pseudonym(uid) != pseudonym(uuid.uuid4())
    assert str(uid) not in pseudonym(uid)


def test_content_hash_ignores_key_order_and_unknown_keys():
    a = {"description": "Built X", "responsibility_level": 2}
    assert content_hash(a) == content_hash({"responsibility_level": 2, "description": "Built X", "noise": 1})
    assert content_hash(a) != content_hash({**a, "responsibility_level": 3})


def test_description_hash_ignores_whitespace_and_case():
    assert description_hash("Senior  Engineer\n\nPython") == description_hash("senior engineer python")


def test_months_normalized_and_ordered():
    e = ExperienceIn(start_month=date(2020, 3, 15), end_month=date(2021, 1, 31))
    assert (e.start_month, e.end_month) == (date(2020, 3, 1), date(2021, 1, 1))
    with pytest.raises(ValidationError):
        ExperienceIn(start_month=date(2021, 1, 1), end_month=date(2020, 1, 1))
