-- Align the database with Prisma models that are already used by runtime code.
-- The checks are intentionally idempotent because some deployments may have
-- received these objects through manual SQL before this migration existed.

ALTER TYPE "SyncStatus" ADD VALUE IF NOT EXISTS 'partial';

ALTER TABLE "SyncLog"
  ADD COLUMN IF NOT EXISTS "skippedDocs" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "failedAttempts" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "lockedUntil" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "tokenVersion" INTEGER NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'AccessLogAction') THEN
    CREATE TYPE "AccessLogAction" AS ENUM (
      'login',
      'login_failed',
      'logout',
      'navigation',
      'api_key_used',
      'user_created',
      'user_updated',
      'user_deleted',
      'role_changed',
      'status_changed',
      'pages_changed',
      'permission_denied',
      'account_locked'
    );
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "AccessLog" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "action" "AccessLogAction" NOT NULL,
  "path" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AccessLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "AccessLog_userId_createdAt_idx" ON "AccessLog"("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "AccessLog_createdAt_idx" ON "AccessLog"("createdAt");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'AccessLog_userId_fkey'
  ) THEN
    ALTER TABLE "AccessLog"
      ADD CONSTRAINT "AccessLog_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

ALTER TABLE "Invoice"
  ADD COLUMN IF NOT EXISTS "cfop" TEXT;

DO $$
DECLARE
  value_type TEXT;
BEGIN
  SELECT data_type
    INTO value_type
  FROM information_schema.columns
  WHERE table_schema = current_schema()
    AND table_name = 'Invoice'
    AND column_name = 'totalValue';

  IF value_type IN ('double precision', 'real') THEN
    ALTER TABLE "Invoice"
      ALTER COLUMN "totalValue" TYPE DECIMAL(65,30)
      USING "totalValue"::DECIMAL(65,30);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "Invoice_companyId_cfop_idx" ON "Invoice"("companyId", "cfop");
CREATE INDEX IF NOT EXISTS "Invoice_recipientCnpj_idx" ON "Invoice"("recipientCnpj");
CREATE INDEX IF NOT EXISTS "Invoice_companyId_recipientCnpj_idx" ON "Invoice"("companyId", "recipientCnpj");

CREATE TABLE IF NOT EXISTS "FinanceiroDuplicataOverride" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "invoiceId" TEXT NOT NULL,
  "dupNumeroOriginal" TEXT NOT NULL,
  "dupVencimentoOriginal" TEXT NOT NULL,
  "emitenteNome" TEXT,
  "emitenteCnpj" TEXT,
  "faturaNumero" TEXT,
  "dupNumero" TEXT,
  "dupVencimento" TEXT,
  "dupValor" DECIMAL(65,30),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FinanceiroDuplicataOverride_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "company_invoice_dup_original"
  ON "FinanceiroDuplicataOverride"("companyId", "invoiceId", "dupNumeroOriginal", "dupVencimentoOriginal");
CREATE INDEX IF NOT EXISTS "FinanceiroDuplicataOverride_companyId_idx"
  ON "FinanceiroDuplicataOverride"("companyId");
CREATE INDEX IF NOT EXISTS "FinanceiroDuplicataOverride_invoiceId_idx"
  ON "FinanceiroDuplicataOverride"("invoiceId");
CREATE INDEX IF NOT EXISTS "FinanceiroDuplicataOverride_companyId_invoiceId_idx"
  ON "FinanceiroDuplicataOverride"("companyId", "invoiceId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'FinanceiroDuplicataOverride_companyId_fkey'
  ) THEN
    ALTER TABLE "FinanceiroDuplicataOverride"
      ADD CONSTRAINT "FinanceiroDuplicataOverride_companyId_fkey"
      FOREIGN KEY ("companyId") REFERENCES "Company"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'FinanceiroDuplicataOverride_invoiceId_fkey'
  ) THEN
    ALTER TABLE "FinanceiroDuplicataOverride"
      ADD CONSTRAINT "FinanceiroDuplicataOverride_invoiceId_fkey"
      FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "FinanceiroDuplicataManualInstallment" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "invoiceId" TEXT NOT NULL,
  "dupNumero" TEXT NOT NULL,
  "dupVencimento" TEXT NOT NULL,
  "dupValor" DECIMAL(65,30) NOT NULL,
  "dupDesconto" DECIMAL(65,30) NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FinanceiroDuplicataManualInstallment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "company_invoice_manual_dup_num"
  ON "FinanceiroDuplicataManualInstallment"("companyId", "invoiceId", "dupNumero");
CREATE INDEX IF NOT EXISTS "FinanceiroDuplicataManualInstallment_companyId_idx"
  ON "FinanceiroDuplicataManualInstallment"("companyId");
CREATE INDEX IF NOT EXISTS "FinanceiroDuplicataManualInstallment_invoiceId_idx"
  ON "FinanceiroDuplicataManualInstallment"("invoiceId");
CREATE INDEX IF NOT EXISTS "FinanceiroDuplicataManualInstallment_companyId_invoiceId_idx"
  ON "FinanceiroDuplicataManualInstallment"("companyId", "invoiceId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'FinanceiroDuplicataManualInstallment_companyId_fkey'
  ) THEN
    ALTER TABLE "FinanceiroDuplicataManualInstallment"
      ADD CONSTRAINT "FinanceiroDuplicataManualInstallment_companyId_fkey"
      FOREIGN KEY ("companyId") REFERENCES "Company"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'FinanceiroDuplicataManualInstallment_invoiceId_fkey'
  ) THEN
    ALTER TABLE "FinanceiroDuplicataManualInstallment"
      ADD CONSTRAINT "FinanceiroDuplicataManualInstallment_invoiceId_fkey"
      FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
