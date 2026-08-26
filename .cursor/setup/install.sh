#!/usr/bin/env bash
# Cloud Agent install phase: durable, idempotent repository setup.
# Runs once to create the environment baseline (and again after code changes).
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT"

echo "[install] Ensuring the postgres client is present..."
if ! command -v psql >/dev/null 2>&1; then
  sudo apt-get update -qq
  sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq postgresql-client
fi

echo "[install] Installing Node dependencies..."
yarn install --frozen-lockfile

echo "[install] Bringing up Docker + Supabase to apply migrations..."
bash .cursor/setup/docker-up.sh
bash .cursor/setup/supabase-up.sh

echo "[install] Regenerating database types from the local schema..."
yarn db:types-local

echo "[install] Done."
