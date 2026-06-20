# =============================================================================
# Tándem Backend — FastAPI + uv (Python 3.12)
# =============================================================================
FROM ghcr.io/astral-sh/uv:python3.12-bookworm-slim

WORKDIR /app

# Install dependencies first (layer caching)
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project

# Copy source code
COPY . .

# Ensure Python can find the app package
ENV PYTHONPATH=/app

# Entrypoint: run Alembic migrations then start uvicorn
RUN chmod +x docker-entrypoint.sh

EXPOSE 8000

ENTRYPOINT ["./docker-entrypoint.sh"]
