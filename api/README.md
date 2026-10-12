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
