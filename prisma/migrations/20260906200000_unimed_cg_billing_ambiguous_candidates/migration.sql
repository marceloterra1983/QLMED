-- Expand-only: candidatos de NF-e quando match ambíguo (SPEC-051 PO feedback)
ALTER TABLE "UnimedCgAuthorization" ADD COLUMN IF NOT EXISTS "billedCandidateInvoices" JSONB;
