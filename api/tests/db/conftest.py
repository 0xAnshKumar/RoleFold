"""Real Postgres 16 via testcontainers. Every test here skips cleanly when Docker isn't running."""

import os
import tempfile
import uuid
from contextlib import contextmanager
from pathlib import Path
from types import SimpleNamespace

import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session
from sqlalchemy.pool import NullPool

os.environ.setdefault("PSEUDONYM_SALT", "db-test-salt-0123456789")
os.environ["STORAGE_DIR"] = tempfile.mkdtemp(prefix="hunt-storage-")  # never api/var/storage
ROOT = Path(__file__).parents[2]
# A paste long enough to pass the 200-character floor (PASTE_TOO_SHORT).
JD = "Backend engineer, Python required. " + "We build payment tools for small shops across India. " * 4
ROLES = """
CREATE ROLE hunt_owner LOGIN PASSWORD 'pw' NOBYPASSRLS;
CREATE ROLE hunt_app LOGIN PASSWORD 'pw' NOBYPASSRLS;
CREATE ROLE hunt_worker LOGIN PASSWORD 'pw' NOBYPASSRLS;
ALTER SCHEMA public OWNER TO hunt_owner;
GRANT USAGE ON SCHEMA public TO hunt_app, hunt_worker;
"""


def docker_available() -> bool:
    try:
        import docker
        from docker.errors import DockerException

        docker.from_env().ping()
        return True
    except ImportError:
        return False
    except (DockerException, OSError):  # requests' ConnectionError is an OSError
        return False


@pytest.fixture(scope="session")
def pg():
    if not docker_available():
        pytest.skip("Docker is not running; DB tests need testcontainers Postgres 16")
    from alembic import command
    from alembic.config import Config
    from testcontainers.postgres import PostgresContainer

    from app.core.config import get_settings
    from app.db.session import engine_for

    with PostgresContainer("postgres:16-alpine", driver="psycopg") as c:
        host, port, db = c.get_container_host_ip(), c.get_exposed_port(5432), c.dbname
        superuser = create_engine(c.get_connection_url(), poolclass=NullPool)
        with superuser.begin() as conn:
            conn.execute(text(ROLES))

        def url(role: str) -> str:
            return f"postgresql+psycopg://{role}:pw@{host}:{port}/{db}"

        cfg = Config(str(ROOT / "alembic.ini"))
        cfg.set_main_option("script_location", str(ROOT / "alembic"))
        cfg.attributes["url"] = url("hunt_owner")
        command.upgrade(cfg, "head")

        os.environ.update(DATABASE_URL=url("hunt_app"), WORKER_DATABASE_URL=url("hunt_worker"))
        get_settings.cache_clear()
        yield SimpleNamespace(superuser=superuser, app=engine_for(url("hunt_app")), worker=engine_for(url("hunt_worker")))
        get_settings.cache_clear()


@pytest.fixture(autouse=True)
def clean(pg):
    with pg.superuser.begin() as conn:
        tables = conn.scalars(text("SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> 'alembic_version'"))
        conn.execute(text(f"TRUNCATE {', '.join(tables)} CASCADE"))


@pytest.fixture
def client(pg):
    from fastapi.testclient import TestClient

    from app.main import app

    return TestClient(app)


class Api:
    """Calls the API as one dev user; every write gets a fresh Idempotency-Key."""

    def __init__(self, client, name: str):
        self.client, self.headers = client, {"X-Dev-User": name}
        self.id = uuid.UUID(self.get("/v1/me").json()["id"])

    def get(self, path, **kw):
        return self.client.get(path, headers=self.headers, **kw)

    def write(self, method, path, json=None, key=None, files=None):
        headers = {**self.headers, "Idempotency-Key": key or uuid.uuid4().hex}
        return self.client.request(method, path, headers=headers, json=json, files=files)


@pytest.fixture
def alice(client):
    return Api(client, "alice")


@pytest.fixture
def bob(client):
    return Api(client, "bob")


@contextmanager
def as_user(engine, user_id):
    """A hunt_app/hunt_worker transaction with app.user_id set (or unset when user_id is None)."""
    from app.db.session import set_user

    with Session(engine) as db, db.begin():
        if user_id:
            set_user(db, user_id)
        yield db
