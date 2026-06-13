#!/usr/bin/env bash
# Asegura que el Postgres de desarrollo (tandem-dev-db) esté corriendo.
set -euo pipefail

# Si el daemon de Docker no responde pero existe el socket unix, úsalo.
if ! docker info >/dev/null 2>&1; then
  if [ -S /var/run/docker.sock ]; then
    export DOCKER_HOST="unix:///var/run/docker.sock"
  fi
fi

CONTAINER="tandem-dev-db"

if docker start "$CONTAINER" >/dev/null 2>&1; then
  echo "[dev-db] '$CONTAINER' ya existía: arrancado."
else
  docker run -d --name "$CONTAINER" \
    -e POSTGRES_USER=tandem \
    -e POSTGRES_PASSWORD=tandem \
    -e POSTGRES_DB=tandem \
    -p 5544:5432 \
    postgres:17-alpine >/dev/null
  echo "[dev-db] '$CONTAINER' creado."
fi

# Espera a que acepte conexiones (máx ~15s).
for _ in $(seq 1 15); do
  if docker exec "$CONTAINER" pg_isready -U tandem >/dev/null 2>&1; then
    echo "[dev-db] listo en localhost:5544 (db=tandem)."
    exit 0
  fi
  sleep 1
done

echo "[dev-db] aviso: el contenedor no respondió a pg_isready a tiempo." >&2
exit 0
