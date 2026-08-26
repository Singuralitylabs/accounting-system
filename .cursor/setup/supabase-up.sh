#!/usr/bin/env bash
# Bring up the local Supabase stack and write .env.local for the Next.js app.
# Idempotent: safe to run on every boot. Requires Docker to be running.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT"

# Pin the CLI version validated with this environment (do not follow
# releases/latest — that would pull different embedded service images).
SUPABASE_CLI_VERSION="2.115.0"
SUPABASE_CLI_DEB_SHA256="7f69e3d1ee45efd3ea0524c1628768217667b498162d647713a10fd5ecbd0275"

# --- Install the Supabase CLI if missing (defensive; normally baked in) ---
if ! command -v supabase >/dev/null 2>&1; then
  echo "[supabase-up] Installing Supabase CLI ${SUPABASE_CLI_VERSION}..."
  curl -fsSL "https://github.com/supabase/cli/releases/download/v${SUPABASE_CLI_VERSION}/supabase_${SUPABASE_CLI_VERSION}_linux_amd64.deb" \
    -o /tmp/supabase.deb
  echo "${SUPABASE_CLI_DEB_SHA256}  /tmp/supabase.deb" | sha256sum -c -
  sudo dpkg -i /tmp/supabase.deb
fi

# Supabase substitutes env(GOOGLE_CLIENT_ID/SECRET) for the Google auth provider
# in supabase/config.toml. Real Google OAuth login needs real values (add them
# as Cloud Agent secrets); placeholders are enough for the stack to boot.
export GOOGLE_CLIENT_ID="${GOOGLE_CLIENT_ID:-local-dev-placeholder.apps.googleusercontent.com}"
export GOOGLE_CLIENT_SECRET="${GOOGLE_CLIENT_SECRET:-local-dev-placeholder-secret}"

# --- Bring the stack to a fully healthy state ---
# `supabase start` is not reliable to gate on: when booting from a snapshot the
# containers are restored in a "running but still initializing" state, so the
# CLI reports "already running" and exits non-zero while services are unhealthy.
# Treat a successful `supabase status -o env` as the readiness signal. If start
# fails, restart without `--no-backup` so developer data volumes are preserved.
status_env() { supabase status -o env 2>/dev/null; }

wait_for_status() {
  for _ in $(seq 1 60); do
    if status_env | grep -q '^API_URL='; then return 0; fi
    sleep 3
  done
  return 1
}

if ! status_env | grep -q '^API_URL='; then
  echo "[supabase-up] Starting Supabase (first run pulls images)..."
  if ! supabase start >/dev/null 2>&1; then
    echo "[supabase-up] Restarting the stack (preserving data volumes)..."
    supabase stop >/dev/null 2>&1 || true
    supabase start >/dev/null 2>&1 || true
  fi
fi

wait_for_status || {
  echo "[supabase-up] Supabase stack never became healthy."
  supabase status || true
  exit 1
}

# Wait until Postgres actually accepts connections before touching the DB.
for _ in $(seq 1 60); do
  pg_isready -h 127.0.0.1 -p 54322 -U postgres >/dev/null 2>&1 && break
  sleep 2
done
pg_isready -h 127.0.0.1 -p 54322 -U postgres >/dev/null 2>&1 || {
  echo "[supabase-up] Postgres never became ready."; exit 1;
}
echo "[supabase-up] Supabase database is accepting connections."

# Apply any migrations that were added after this volume was first created
# (`supabase start` alone does not apply later files). Idempotent.
supabase migration up --local

# --- Generate .env.local from the live, healthy Supabase status ---
eval "$(status_env)"
cat > .env.local <<EOF
NEXT_PUBLIC_ENV=development
NEXT_PUBLIC_SUPABASE_URL=${API_URL}
NEXT_PUBLIC_SUPABASE_ANON_KEY=${ANON_KEY}
SUPABASE_URL=${API_URL}
SUPABASE_SERVICE_ROLE_KEY=${SERVICE_ROLE_KEY}
PROJECT_ID=accounting-system
LOCAL_DB_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres
GOOGLE_CLIENT_ID=${GOOGLE_CLIENT_ID}
GOOGLE_CLIENT_SECRET=${GOOGLE_CLIENT_SECRET}
SLACK_WEBHOOK_URL=${SLACK_WEBHOOK_URL:-}
EOF
echo "[supabase-up] Wrote .env.local (API ${API_URL})."
