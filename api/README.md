# Hunt API

FastAPI service and task worker. Config comes from `api/.env` (copy `api/.env.example`).

## Tests

```bash
cd api
uv run pytest            # unit tests; DB tests run when Docker is up (testcontainers Postgres 16)
uv run ruff check .
```

Default tests never call a model: an autouse fixture swaps in an empty `FakeLLM`.

## Live Gemini smoke test (opt-in, costs money)

One real call each for `job_extract`, `requirement_map`, `resume_write` and `statement_verify`, through
`build_gateway()`, with fictional input only. Needs `GEMINI_API_KEY` and `LLM_MODEL_FAST/WRITER/VERIFIER`
in `api/.env`; prices come from `LLM_PRICE_*` (defaults in `app/core/config.py`).

```bash
cd api
RUN_LIVE_LLM=1 uv run pytest tests/live -s
```

It checks each output is schema-valid, `tokens_out > 0`, and that thinking tokens are counted in
`tokens_out`, then prints the total estimated cost.

## Restore runbook

Deleting an account writes a tombstone file (named by the salted user hash, never the id) to `TOMBSTONE_DIR`
before the DB rows go. That directory is outside the DB and its backups, so restoring an older backup cannot
bring a deleted user back for good. In production `TOMBSTONE_DIR` must be an object-locked (WORM) bucket mount,
separate from `STORAGE_DIR`, and must not be restored or pruned with the DB.

After any DB restore, before the API or worker take traffic:

```bash
cd api
export RESTORE_DATABASE_URL=postgresql+psycopg://<superuser>@<host>/hunt   # must see every user (bypasses RLS)
uv run python -m app.tasks.reapply_tombstones --dry-run   # prints how many restored users match a tombstone
uv run python -m app.tasks.reapply_tombstones             # deletes them (rows, files); safe to re-run
```

Use the same `PSEUDONYM_SALT` that wrote the tombstones, or nothing will match.
