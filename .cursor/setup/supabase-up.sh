#!/usr/bin/env bash
# Bring up the local Supabase stack and write .env.local for the Next.js app.
# Idempotent: safe to run on every boot. Requires Docker to be running.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT"

# --- Install the Supabase CLI if missing (defensive; normally baked in) ---
if ! command -v supabase >/dev/null 2>&1; then
  echo "[supabase-up] Installing Supabase CLI..."
  SUPA_VER="$(curl -fsSL https://api.github.com/repos/supabase/cli/releases/latest | grep -oP '"tag_name": "\K[^"]+')"
  curl -fsSL "https://github.com/supabase/cli/releases/download/${SUPA_VER}/supabase_${SUPA_VER#v}_linux_amd64.deb" -o /tmp/supabase.deb
  sudo dpkg -i /tmp/supabase.deb
fi

# Supabase substitutes env(GOOGLE_CLIENT_ID/SECRET) for the Google auth provider
# in supabase/config.toml. Real Google OAuth login needs real values (add them
# as Cloud Agent secrets); placeholders are enough for the stack to boot.
export GOOGLE_CLIENT_ID="${GOOGLE_CLIENT_ID:-local-dev-placeholder.apps.googleusercontent.com}"
export GOOGLE_CLIENT_SECRET="${GOOGLE_CLIENT_SECRET:-local-dev-placeholder-secret}"

# --- Start the stack and wait for the database to become ready ---
# `supabase start` is not reliable to gate on: when booting from a snapshot the
# containers are restored in a "running but still initializing" state, so the
# CLI reports "already running" and exits non-zero while Postgres is not yet
# accepting connections. Instead we kick a start (tolerating that error) and
# then poll the database until it is actually ready.
db_ready() { pg_isready -h 127.0.0.1 -p 54322 -U postgres >/dev/null 2>&1; }

wait_for_db() {
  for _ in $(seq 1 90); do
    db_ready && return 0
    sleep 2
  done
  return 1
}

if ! db_ready; then
  echo "[supabase-up] Starting Supabase (first run pulls images)..."
  supabase start || true
  if ! wait_for_db; then
    echo "[supabase-up] Database still not ready; restarting the stack..."
    supabase stop --no-backup >/dev/null 2>&1 || true
    supabase start || true
    wait_for_db || {
      echo "[supabase-up] Supabase database failed to become ready."
      supabase status || true
      exit 1
    }
  fi
fi
echo "[supabase-up] Supabase database is accepting connections."

# --- Restore standard public-schema CRUD grants ---
# Newer Supabase Postgres images ship restrictive DEFAULT PRIVILEGES, so tables
# created by migrations lack SELECT/INSERT/UPDATE/DELETE for anon/authenticated
# and every PostgREST query returns 403. This migration-independent grant script
# re-enables them (RLS remains the row-level gate). Idempotent.
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
  -v ON_ERROR_STOP=1 -f .cursor/setup/grant-public-crud.sql >/dev/null
echo "[supabase-up] Public-schema CRUD grants applied."

# --- Generate .env.local from the live Supabase status ---
eval "$(supabase status -o env)"
cat > .env.local <<EOF
NEXT_PUBLIC_ENV=development
NEXT_PUBLIC_SUPABASE_URL=${API_URL}
NEXT_PUBLIC_SUPABASE_ANON_KEY=${ANON_KEY}
SUPABASE_URL=${API_URL}
SUPABASE_SERVICE_ROLE_KEY=${SERVICE_ROLE_KEY}
PROJECT_ID=matter-controller
LOCAL_DB_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres
GOOGLE_CLIENT_ID=${GOOGLE_CLIENT_ID}
GOOGLE_CLIENT_SECRET=${GOOGLE_CLIENT_SECRET}
SLACK_WEBHOOK_URL=${SLACK_WEBHOOK_URL:-}
EOF
echo "[supabase-up] Wrote .env.local (API ${API_URL})."
