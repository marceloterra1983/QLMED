-- CreateIndex
CREATE INDEX IF NOT EXISTS "Invoice_number_idx" ON "Invoice"("number");
CREATE INDEX IF NOT EXISTS "Invoice_companyId_number_idx" ON "Invoice"("companyId", "number");
CREATE INDEX IF NOT EXISTS "Invoice_recipientName_idx" ON "Invoice"("recipientName");
CREATE INDEX IF NOT EXISTS "Invoice_companyId_recipientName_idx" ON "Invoice"("companyId", "recipientName");
CREATE INDEX IF NOT EXISTS "Invoice_companyId_type_direction_cfop_issueDate_idx" ON "Invoice"("companyId", "type", "direction", "cfop", "issueDate");
