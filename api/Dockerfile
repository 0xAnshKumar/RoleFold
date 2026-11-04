# Hunt API + worker image. Build from the REPO ROOT (render.py reads shared/resume-templates.json):
#   docker build -f api/Dockerfile -t hunt-api .
# API:     docker run --env-file api/.env -p 8000:8000 hunt-api
# Worker:  docker run --env-file api/.env hunt-api python -m app.tasks.worker [--types import,match]
# Migrate: docker run --env-file api/.env hunt-api alembic upgrade head
# Upload parsing runs with no network under Docker's default seccomp profile (app/core/parsing.py installs its
# own filter in the parser child), so no extra flags. Build for the host's native arch: under emulation the
# filter can't be installed and parsing fails closed.
FROM python:3.13-slim
COPY --from=ghcr.io/astral-sh/uv:0.10 /uv /usr/local/bin/uv
ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy UV_PROJECT_ENVIRONMENT=/srv/venv PATH=/srv/venv/bin:$PATH \
    PYTHONUNBUFFERED=1 ENV=production
WORKDIR /srv/api
COPY api/pyproject.toml api/uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project
COPY shared /srv/shared
COPY api/app ./app
COPY api/fonts ./fonts
COPY api/alembic ./alembic
COPY api/alembic.ini ./
# STORAGE_DIR / TOMBSTONE_DIR default under /srv/api/var: mount volumes there (tombstones on a WORM bucket).
RUN useradd --system --uid 10001 hunt && mkdir -p var && chown hunt var
USER hunt
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers"]
