#!/usr/bin/env bash
# Cloud Agent — Next.js dev server terminal for QLMED.
# Loads the gitignored local .env and runs the app on 0.0.0.0:3000.
set -euo pipefail

cd "$(dirname "$0")/.."

if [ -f .env ]; then
  set -a; . ./.env; set +a
fi

exec npm run dev
