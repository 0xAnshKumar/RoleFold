#!/bin/sh
# API + worker in one container, for hosts whose free plan has a single service (Render free).
# If either process exits, stop the other and exit non-zero so the host restarts the container.
python -m app.tasks.worker &
worker=$!
uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-8000}" --proxy-headers &
api=$!
trap 'kill $worker $api 2>/dev/null' TERM INT
while kill -0 $worker 2>/dev/null && kill -0 $api 2>/dev/null; do sleep 5; done
kill $worker $api 2>/dev/null
exit 1
