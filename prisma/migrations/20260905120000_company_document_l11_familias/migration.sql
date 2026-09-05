-- SPEC-042 L11: contrato social, documentos básicos, balanços; webUrl.
-- ADD VALUE é permitido em transação no PostgreSQL 12+.

ALTER TYPE "CompanyDocumentKind" ADD VALUE 'contrato_social_constituicao';
ALTER TYPE "CompanyDocumentKind" ADD VALUE 'contrato_social_alteracao';
ALTER TYPE "CompanyDocumentKind" ADD VALUE 'contrato_social_consolidado';
ALTER TYPE "CompanyDocumentKind" ADD VALUE 'cartao_cnpj';
ALTER TYPE "CompanyDocumentKind" ADD VALUE 'inscricao_municipal';
ALTER TYPE "CompanyDocumentKind" ADD VALUE 'inscricao_estadual';
ALTER TYPE "CompanyDocumentKind" ADD VALUE 'siscomex_radar';
ALTER TYPE "CompanyDocumentKind" ADD VALUE 'cadastro_ecjur';
ALTER TYPE "CompanyDocumentKind" ADD VALUE 'dados_cadastrais';
ALTER TYPE "CompanyDocumentKind" ADD VALUE 'balanco_anual';

ALTER TABLE "CompanyDocument" ADD COLUMN "webUrl" TEXT;
