-- SPEC-042: fabricante da carta (PDF ou nome), nullable. Expand-only.

ALTER TABLE "CompanyDocument" ADD COLUMN "manufacturer" TEXT;
