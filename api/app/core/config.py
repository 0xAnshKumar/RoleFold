"""Settings from api/.env (TRD §15.1: startup fails on missing or invalid keys)."""

from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    env: Literal["development", "test", "staging", "production"] = "development"
    # API connects as hunt_app; worker as hunt_worker; migrations as hunt_owner (alembic/bootstrap.sql).
    database_url: str
    worker_database_url: str | None = None
    migration_database_url: str | None = None
    # Salt for pseudonymizing user_id in audit_log / llm_calls on deletion (CEO D14).
    pseudonym_salt: str = Field(min_length=16)
    # OIDC login (app/core/auth.py). Bearer JWTs are accepted only when issuer and audience are set.
    oidc_issuer: str | None = None
    oidc_audience: str | None = None
    oidc_jwks_url: str | None = None  # default: jwks_uri from {issuer}/.well-known/openid-configuration

    # Proposed values (TRD §15.1, PRD §7 free plan).
    free_tailored_per_month: int = 10
    free_deep_matches_per_month: int = 30
    upload_max_mb: int = 10
    upload_max_pages: int = 10  # PDFs (TRD §5.1)
    upload_max_chars: int = 50_000  # DOCX/TXT/MD stand-in for the page limit (~10 dense pages)
    # Local object storage (TRD §3 keys, prefixed by user_id). Gitignored.
    storage_dir: Path = Path(__file__).parents[2] / "var" / "storage"
    # Deletion tombstones (one write-once file per salted user hash), kept OUTSIDE the DB and its backups so a
    # restore can re-apply deletions (README "Restore runbook"). Production: an object-locked (WORM) bucket mount.
    tombstone_dir: Path = Path(__file__).parents[2] / "var" / "tombstones"
    # Only for `python -m app.tasks.reapply_tombstones`: a superuser/BYPASSRLS role (it must see every user).
    restore_database_url: str | None = None
    job_paste_max_chars: int = 50_000
    task_max_attempts: int = 5
    task_lease_seconds: int = 300
    reservation_ttl_seconds: int = 3600
    idempotency_ttl_hours: int = 24
    worker_poll_seconds: float = 1.0
    evidence_pack_tokens: int = 4000  # TRD §9.4

    # LLM spend (TRD §10.1 budgets, I-12). Global cap per UTC day, summed from llm_calls.cost.
    llm_daily_spend_cap_usd: float = 5.0
    # USD per 1M tokens, per tier. Defaults: flash-lite class (fast) and writer class; verifier priced as writer.
    llm_price_fast_in: float = 0.30
    llm_price_fast_out: float = 2.50
    llm_price_writer_in: float = 0.75
    llm_price_writer_out: float = 3.75
    llm_price_verifier_in: float = 0.75
    llm_price_verifier_out: float = 3.75


@lru_cache
def get_settings() -> Settings:
    return Settings()
