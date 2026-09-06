-- Expand-only: vínculo de faturamento Unimed CG ↔ NF-e emitida (SPEC-051)
ALTER TABLE "UnimedCgAuthorization" ADD COLUMN IF NOT EXISTS "billedInvoiceId" TEXT;
ALTER TABLE "UnimedCgAuthorization" ADD COLUMN IF NOT EXISTS "billedInvoiceNumber" TEXT;
ALTER TABLE "UnimedCgAuthorization" ADD COLUMN IF NOT EXISTS "billedMatchedAt" TIMESTAMP(3);
ALTER TABLE "UnimedCgAuthorization" ADD COLUMN IF NOT EXISTS "billedMatchStatus" TEXT;

CREATE INDEX IF NOT EXISTS "UnimedCgAuthorization_companyId_billedMatchStatus_idx"
  ON "UnimedCgAuthorization"("companyId", "billedMatchStatus");

CREATE INDEX IF NOT EXISTS "UnimedCgAuthorization_companyId_billedInvoiceId_idx"
  ON "UnimedCgAuthorization"("companyId", "billedInvoiceId");
