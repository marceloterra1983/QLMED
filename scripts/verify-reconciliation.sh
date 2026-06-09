#!/usr/bin/env bash
set -euo pipefail

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL is required for reconciliation verification." >&2
  exit 1
fi

echo 'ALTER TABLE "ApiKey" DROP COLUMN "scopes";' | npx prisma db execute --stdin
npx prisma db execute \
  --file prisma/migrations/20260609190000_reconcile_current_schema_and_outbox/migration.sql
npx prisma migrate diff \
  --from-config-datasource \
  --to-schema prisma/schema.prisma \
  --exit-code
