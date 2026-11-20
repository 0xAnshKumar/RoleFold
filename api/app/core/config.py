"""Settings from api/.env (TRD §15.1: startup fails on missing or invalid keys)."""

from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import Field, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    env: Literal["development", "test", "staging", "production"] = "development"
    # X-Dev-User sign-in (app/core/auth.py): needs DEV_AUTH=1 AND env development/test. Never set it on a public host.
    dev_auth: bool = False
    # Job-targeted resume tailoring (POST /v1/jobs/{id}/tailored-resume). Off at launch (owner, 2026-11-06).
    tailoring_enabled: bool = False
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
    # Admin console (app/routes/admin.py). Admin = a listed auth subject ("{iss}|{sub}"; "dev|<name>" in dev),
    # or an ID token whose top-level ADMIN_ROLE_CLAIM (e.g. "groups") contains ADMIN_ROLE.
    admin_subjects: str = ""  # comma-separated
    admin_role_claim: str | None = None
    admin_role: str = "hunt-admin"
    # hunt_admin role (BYPASSRLS, alembic/bootstrap.sql) for the console's cross-user reads. Unset = console off.
    admin_database_url: str | None = None
    admin_support_minutes: int = 30  # how long an audited support session can read a user's data

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
    # Bring-your-own Gemini key (Settings → AI key). Base64 of 32 random bytes; unset = the feature is off.
    # Losing or changing it makes stored keys unreadable (users re-enter them). Generate:
    # python -c "import os,base64;print(base64.b64encode(os.urandom(32)).decode())"
    ai_key_encryption_key: SecretStr | None = None
    # USD per 1M tokens, per tier. Defaults: flash-lite class (fast) and writer class; verifier priced as writer.
    llm_price_fast_in: float = 0.30
    llm_price_fast_out: float = 2.50
    llm_price_writer_in: float = 0.75
    llm_price_writer_out: float = 3.75
    llm_price_verifier_in: float = 0.75
    llm_price_verifier_out: float = 3.75

    # Job catalog, feed and alerts (app/catalog). Empty = no source runs (PRD OQ-3 / TRD T-OQ-2 legal gate).
    catalog_sources: str = ""  # greenhouse:<board>[=Name], lever:<site>[=Name], manual:<file.json|csv>
    catalog_ingest_hours: int = 12
    job_expire_grace_days: int = 3  # TRD §8.3
    job_max_age_days: int = 60
    # Jobs are re-checked on every ingest, so an old posting date alone does not mean closed; big boards keep
    # roles open for months. Freshness still ranks newer jobs higher (TRD §9.1 said 30; widened 2026-11-06).
    feed_max_age_days: int = 90
    feed_size: int = 50
    retrieve_k: int = 300
    # Email alerts: log-only until SMTP_HOST is set. APP_URL builds the links inside emails.
    app_url: str = "http://localhost:3100"
    smtp_host: str | None = None
    smtp_port: int = 587
    smtp_user: str | None = None
    smtp_password: str | None = None
    smtp_from: str = "RoleFold <alerts@localhost>"


@lru_cache
def get_settings() -> Settings:
    return Settings()
