CREATE INDEX IF NOT EXISTS "Invoice_company_type_dir_updated_idx"
  ON "Invoice" ("companyId", "type", "direction", "updatedAt" DESC);
