-- Add composite indexes for Invoice table performance
CREATE INDEX IF NOT EXISTS "Invoice_companyId_type_direction_idx" ON "Invoice"("companyId", "type", "direction");
CREATE INDEX IF NOT EXISTS "Invoice_companyId_type_direction_issueDate_idx" ON "Invoice"("companyId", "type", "direction", "issueDate");
CREATE INDEX IF NOT EXISTS "Invoice_companyId_type_direction_senderCnpj_idx" ON "Invoice"("companyId", "type", "direction", "senderCnpj");
CREATE INDEX IF NOT EXISTS "Invoice_companyId_status_idx" ON "Invoice"("companyId", "status");
CREATE INDEX IF NOT EXISTS "Invoice_senderName_idx" ON "Invoice"("senderName");
