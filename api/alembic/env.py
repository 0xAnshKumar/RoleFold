from alembic import context
from sqlalchemy import create_engine

from app.core.config import get_settings


def run() -> None:
    url = context.config.attributes.get("url") or get_settings().migration_database_url
    if not url:
        raise SystemExit("MIGRATION_DATABASE_URL is not set (connect as hunt_owner, never hunt_app).")
    with create_engine(url).connect() as conn:
        context.configure(connection=conn, transaction_per_migration=True)
        with context.begin_transaction():
            context.run_migrations()


run()
