-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "patientName" TEXT;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Invoice_patientName_idx" ON "Invoice"("patientName");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Invoice_companyId_patientName_idx" ON "Invoice"("companyId", "patientName");
