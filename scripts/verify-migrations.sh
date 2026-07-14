#!/usr/bin/env bash
set -euo pipefail

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL is required for migration verification." >&2
  exit 1
fi

echo "Verifying the production migration-window image contract..."
node scripts/test-production-migration-window.cjs

echo "Replaying migration history..."
npx prisma migrate deploy

echo "Comparing migrated database with prisma/schema.prisma..."
npx prisma migrate diff \
  --from-config-datasource \
  --to-schema prisma/schema.prisma \
  --exit-code
