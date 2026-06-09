SET lock_timeout = '10s';
SET statement_timeout = '15min';

-- Replace the legacy constraint because an object with the expected name may
-- already exist with different referential actions.
ALTER TABLE "ApiKey" DROP CONSTRAINT IF EXISTS "ApiKey_createdById_fkey";
ALTER TABLE "ApiKey"
  ADD CONSTRAINT "ApiKey_createdById_fkey"
  FOREIGN KEY ("createdById")
  REFERENCES "User"("id")
  ON DELETE RESTRICT
  ON UPDATE CASCADE;

-- A unique index exists for this column, but Prisma also expects the explicit
-- non-unique index declared in schema.prisma.
CREATE INDEX IF NOT EXISTS "ReceitaNfseConfig_companyId_idx"
  ON "ReceitaNfseConfig"("companyId");
