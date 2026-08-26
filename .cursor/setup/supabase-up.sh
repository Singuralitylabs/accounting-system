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

# --- Bring the stack to a fully healthy state ---
# `supabase start` is not reliable to gate on: when booting from a snapshot the
# containers are restored in a "running but still initializing" state, so the
# CLI reports "already running" and exits non-zero while services are unhealthy.
# We therefore treat a successful `supabase status -o env` (only returns 0 once
# the stack is healthy) as the readiness signal, and force a clean stop/start
# when the restored state is stuck.
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
    # Restored-from-snapshot containers are stuck; recreate them cleanly.
    echo "[supabase-up] Recreating the stack for a clean, healthy start..."
    supabase stop --no-backup >/dev/null 2>&1 || true
    supabase start >/dev/null 2>&1 || true
  fi
  wait_for_status || echo "[supabase-up] WARN: supabase status not healthy; using default local keys."
fi

# Wait until Postgres actually accepts connections before touching the DB.
for _ in $(seq 1 60); do
  pg_isready -h 127.0.0.1 -p 54322 -U postgres >/dev/null 2>&1 && break
  sleep 2
done
pg_isready -h 127.0.0.1 -p 54322 -U postgres >/dev/null 2>&1 || {
  echo "[supabase-up] Postgres never became ready."; exit 1;
}
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
# These are Supabase's deterministic local-development demo values (JWTs signed
# with the fixed local JWT secret); they are identical on every machine and are
# used as a fallback if `supabase status` is momentarily unavailable.
API_URL="http://127.0.0.1:54321"
ANON_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0"
SERVICE_ROLE_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU"
STATUS_ENV="$(status_env || true)"
if echo "$STATUS_ENV" | grep -q '^API_URL='; then
  eval "$STATUS_ENV"
fi
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
