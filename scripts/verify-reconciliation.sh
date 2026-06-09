#!/usr/bin/env bash
set -euo pipefail

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL is required for reconciliation verification." >&2
  exit 1
fi

echo 'ALTER TABLE "ApiKey" DROP COLUMN "scopes";' | npx prisma db execute --stdin
npx prisma db execute \
  --file prisma/migrations/20260609190000_reconcile_current_schema_and_outbox/migration.sql
cat <<'SQL' | npx prisma db execute --stdin
DROP INDEX IF EXISTS "ReceitaNfseConfig_companyId_idx";
ALTER TABLE "ApiKey" DROP CONSTRAINT IF EXISTS "ApiKey_createdById_fkey";
ALTER TABLE "ApiKey"
  ADD CONSTRAINT "ApiKey_createdById_fkey"
  FOREIGN KEY ("createdById")
  REFERENCES "User"("id");
SQL
npx prisma db execute \
  --file prisma/migrations/20260609230000_reconcile_production_constraints/migration.sql
npx prisma migrate diff \
  --from-config-datasource \
  --to-schema prisma/schema.prisma \
  --exit-code
