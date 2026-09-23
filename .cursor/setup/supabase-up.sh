#!/usr/bin/env bash
# Bring up the local Supabase stack and write .env.local for the Next.js app.
# Idempotent: safe to run on every boot. Requires Docker to be running.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT"

# Pin the CLI version validated with this environment (do not follow
# releases/latest — that would pull different embedded service images).
# Keep in sync with the "supabase" devDependency version in package.json.
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

# Values written to .env.local, and GOOGLE_* exported for config.toml env():
# non-empty shell environment > existing .env.local > default.
# Shell wins so a Cloud Agent secret added later replaces a value this script
# wrote on an earlier boot. An empty shell keeps a hand-edited .env.local.
# CRON_SECRET has no committed default. A missing value is random. The old
# well-known local-dev-cron-secret is treated as unset.
read_dotenv_value() {
  local key="$1"
  [[ -f .env.local ]] || return 0
  grep -E "^${key}=" .env.local | head -n1 | cut -d= -f2- || true
}

pick_env() {
  local key="$1"
  local default="$2"
  local from_shell=""
  if [[ -n "${!key+x}" ]]; then
    from_shell="${!key}"
  fi
  if [[ -n "${from_shell}" ]]; then
    printf '%s' "${from_shell}"
    return
  fi
  local from_file
  from_file="$(read_dotenv_value "$key")"
  if [[ -n "${from_file}" ]]; then
    printf '%s' "${from_file}"
    return
  fi
  printf '%s' "${default}"
}

PROJECT_ID_VALUE="$(pick_env PROJECT_ID "")"
case "${PROJECT_ID_VALUE}" in
  matter-controller | accounting-system) PROJECT_ID_VALUE="" ;;
esac

# Placeholders are enough for the stack to boot. Real Google login needs real
# values (Cloud Agent secrets, or a hand-edited .env.local kept above).
GOOGLE_CLIENT_ID="$(pick_env GOOGLE_CLIENT_ID "local-dev-placeholder.apps.googleusercontent.com")"
GOOGLE_CLIENT_SECRET="$(pick_env GOOGLE_CLIENT_SECRET "local-dev-placeholder-secret")"
export GOOGLE_CLIENT_ID GOOGLE_CLIENT_SECRET

SLACK_WEBHOOK_URL="$(pick_env SLACK_WEBHOOK_URL "")"

if [[ -z "${CRON_SECRET-}" ]]; then
  existing_cron="$(read_dotenv_value CRON_SECRET)"
  if [[ "${existing_cron}" == "local-dev-cron-secret" || -z "${existing_cron}" ]]; then
    CRON_SECRET_VALUE="$(openssl rand -hex 16)"
  else
    CRON_SECRET_VALUE="${existing_cron}"
  fi
else
  CRON_SECRET_VALUE="${CRON_SECRET}"
fi

# --- Bring the stack to a fully healthy state ---
# `supabase start` is not reliable to gate on: when booting from a snapshot the
# containers are restored in a "running but still initializing" state, so the
# CLI reports "already running" and exits non-zero while services are unhealthy.
# Treat a successful `supabase status -o env` as the readiness signal. If start
# fails, restart without `--no-backup` so developer data volumes are preserved.
#
# `config.toml` project_id was renamed from matter-controller. A snapshot or
# developer machine may still have that stack holding 54321–54324. `supabase
# status` / `stop` without --project-id only see the current id, so start
# would fail with "port is already allocated".
LEGACY_LOCAL_PROJECT_IDS=(matter-controller)

status_env() { supabase status -o env 2>/dev/null; }

stop_legacy_local_stacks() {
  local id
  for id in "${LEGACY_LOCAL_PROJECT_IDS[@]}"; do
    echo "[supabase-up] Stopping leftover stack (project_id=${id})..."
    supabase stop --project-id "$id" >/dev/null 2>&1 || true
  done
}

wait_for_status() {
  for _ in $(seq 1 60); do
    if status_env | grep -q '^API_URL='; then return 0; fi
    sleep 3
  done
  return 1
}

if ! status_env | grep -q '^API_URL='; then
  stop_legacy_local_stacks
  echo "[supabase-up] Starting Supabase (first run pulls images)..."
  if ! supabase start >/dev/null 2>&1; then
    echo "[supabase-up] Restarting the stack (preserving data volumes)..."
    supabase stop >/dev/null 2>&1 || true
    stop_legacy_local_stacks
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
# PROJECT_ID and the non-status values were resolved before start.
# docs/setup.md の .env.local サンプルと同じ 8 変数だけを書く。
# NEXT_PUBLIC_ENV / SUPABASE_URL / LOCAL_DB_URL はアプリが参照しない。
eval "$(status_env)"
cat > .env.local <<EOF
NEXT_PUBLIC_SUPABASE_URL=${API_URL}
NEXT_PUBLIC_SUPABASE_ANON_KEY=${ANON_KEY}
SUPABASE_SERVICE_ROLE_KEY=${SERVICE_ROLE_KEY}
PROJECT_ID=${PROJECT_ID_VALUE}
GOOGLE_CLIENT_ID=${GOOGLE_CLIENT_ID}
GOOGLE_CLIENT_SECRET=${GOOGLE_CLIENT_SECRET}
SLACK_WEBHOOK_URL=${SLACK_WEBHOOK_URL}
CRON_SECRET=${CRON_SECRET_VALUE}
EOF
echo "[supabase-up] Wrote .env.local (API ${API_URL})."
