-- SPEC-042 L10: famílias sanitária e carta (expand-only).
-- ADD VALUE é permitido em transação no PostgreSQL 12+.

ALTER TYPE "CompanyDocumentKind" ADD VALUE 'alvara_funcionamento';
ALTER TYPE "CompanyDocumentKind" ADD VALUE 'licenca_sanitaria';
ALTER TYPE "CompanyDocumentKind" ADD VALUE 'licenca_sanitaria_veiculo';
ALTER TYPE "CompanyDocumentKind" ADD VALUE 'crf_conselho';
ALTER TYPE "CompanyDocumentKind" ADD VALUE 'controle_pragas';
ALTER TYPE "CompanyDocumentKind" ADD VALUE 'afe_anvisa';
ALTER TYPE "CompanyDocumentKind" ADD VALUE 'carta_comercializacao';

CREATE INDEX "CompanyDocument_companyId_category_removedAt_idx" ON "CompanyDocument"("companyId", "category", "removedAt");
