#!/usr/bin/env bash
# Cloud Agent start phase: per-boot runtime initialization.
# Brings Docker and Supabase back up (containers do not survive a reboot) and
# reconciles the local grants and .env.local. Must return after readiness.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT"

bash .cursor/setup/docker-up.sh
bash .cursor/setup/supabase-up.sh

echo "[start] Local Supabase is up. Studio: http://127.0.0.1:54323"
