#!/bin/sh
set -e

echo "[tandem-backend] Running Alembic migrations..."
uv run alembic upgrade head

echo "[tandem-backend] Starting uvicorn..."
exec uv run uvicorn app.main:app --host 0.0.0.0 --port 8000
