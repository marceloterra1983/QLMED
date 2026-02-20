-- CreateEnum
CREATE TYPE "InvoiceType" AS ENUM ('NFE', 'CTE', 'NFSE');

-- CreateEnum
CREATE TYPE "InvoiceDirection" AS ENUM ('received', 'issued');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('received', 'confirmed', 'rejected');

-- CreateEnum
CREATE TYPE "SyncMethod" AS ENUM ('sefaz', 'nsdocs');

-- CreateEnum
CREATE TYPE "SyncStatus" AS ENUM ('running', 'completed', 'error');

-- AlterTable Invoice: drop defaults, convert types, re-add defaults
ALTER TABLE "Invoice"
  ALTER COLUMN "direction" DROP DEFAULT,
  ALTER COLUMN "status" DROP DEFAULT;

ALTER TABLE "Invoice"
  ALTER COLUMN "type" TYPE "InvoiceType" USING "type"::"InvoiceType",
  ALTER COLUMN "direction" TYPE "InvoiceDirection" USING "direction"::"InvoiceDirection",
  ALTER COLUMN "status" TYPE "InvoiceStatus" USING "status"::"InvoiceStatus";

ALTER TABLE "Invoice"
  ALTER COLUMN "direction" SET DEFAULT 'received',
  ALTER COLUMN "status" SET DEFAULT 'received';

-- AlterTable SyncLog: drop defaults, convert types, re-add defaults
ALTER TABLE "SyncLog"
  ALTER COLUMN "syncMethod" DROP DEFAULT,
  ALTER COLUMN "status" DROP DEFAULT;

ALTER TABLE "SyncLog"
  ALTER COLUMN "syncMethod" TYPE "SyncMethod" USING "syncMethod"::"SyncMethod",
  ALTER COLUMN "status" TYPE "SyncStatus" USING "status"::"SyncStatus";

ALTER TABLE "SyncLog"
  ALTER COLUMN "syncMethod" SET DEFAULT 'sefaz',
  ALTER COLUMN "status" SET DEFAULT 'running';

-- CreateIndex
CREATE INDEX "Company_userId_idx" ON "Company"("userId");

-- CreateIndex
CREATE INDEX "Invoice_companyId_idx" ON "Invoice"("companyId");

-- CreateIndex
CREATE INDEX "Invoice_senderCnpj_idx" ON "Invoice"("senderCnpj");

-- CreateIndex
CREATE INDEX "Invoice_issueDate_idx" ON "Invoice"("issueDate");

-- CreateIndex
CREATE INDEX "SyncLog_companyId_idx" ON "SyncLog"("companyId");

-- AddForeignKey
ALTER TABLE "SyncLog" ADD CONSTRAINT "SyncLog_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
