#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

# Requires Node 20+ and Docker Desktop running (Postgres runs in docker compose).
INSTALL_CMD=(npm install)
VERIFY_CMD=(npm run verify)
START_CMD=(npm run dev)

echo "==> Working directory: $PWD"
echo "==> Syncing dependencies"
"${INSTALL_CMD[@]}"

echo "==> Running baseline verification"
"${VERIFY_CMD[@]}"

echo "==> Startup command"
printf '    %q' "${START_CMD[@]}"
printf '\n'

if [ "${RUN_START_COMMAND:-0}" = "1" ]; then
  echo "==> Starting the app"
  exec "${START_CMD[@]}"
fi

echo "Set RUN_START_COMMAND=1 if you want init.sh to launch the app directly."
