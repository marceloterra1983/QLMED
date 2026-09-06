-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "convenioName" TEXT;
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "doctorName" TEXT;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Invoice_convenioName_idx" ON "Invoice"("convenioName");
CREATE INDEX IF NOT EXISTS "Invoice_companyId_convenioName_idx" ON "Invoice"("companyId", "convenioName");
CREATE INDEX IF NOT EXISTS "Invoice_doctorName_idx" ON "Invoice"("doctorName");
CREATE INDEX IF NOT EXISTS "Invoice_companyId_doctorName_idx" ON "Invoice"("companyId", "doctorName");
