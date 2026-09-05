-- SPEC-047: vínculo item de NF-e recebida → produto Spica.
-- Expand puro: tabela nova, sem tocar em linhas de negócio existentes.

CREATE TABLE "nfe_item_product_link" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "invoice_id" TEXT NOT NULL,
    "item_number" INTEGER NOT NULL,
    "supplier_cnpj" TEXT NOT NULL,
    "supplier_code" TEXT NOT NULL,
    "supplier_code_norm" TEXT NOT NULL,
    "supplier_description" TEXT,
    "ean" TEXT,
    "anvisa" TEXT,
    "ncm" TEXT,
    "unit" TEXT,
    "product_registry_id" TEXT,
    "matched_codigo" TEXT,
    "match_strategy" TEXT,
    "match_confidence" DOUBLE PRECISION,
    "matched_at" TIMESTAMPTZ,
    "matched_by" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "nfe_item_product_link_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "nfe_item_product_link_company_invoice_item_key"
    ON "nfe_item_product_link"("company_id", "invoice_id", "item_number");

CREATE INDEX "nfe_item_product_link_registry_idx"
    ON "nfe_item_product_link"("company_id", "product_registry_id");

-- Memória S6 e agrupamento de pendências (fornecedor + cProd normalizado).
CREATE INDEX "nfe_item_product_link_supplier_idx"
    ON "nfe_item_product_link"("company_id", "supplier_cnpj", "supplier_code_norm");

CREATE INDEX "nfe_item_product_link_invoice_idx"
    ON "nfe_item_product_link"("invoice_id");

-- Fila de pendências: só as linhas sem produto. Índice parcial fora do schema
-- Prisma (Prisma não expressa WHERE); a reconciliação tolera índice extra.
CREATE INDEX "nfe_item_product_link_pending_idx"
    ON "nfe_item_product_link"("company_id", "supplier_cnpj", "supplier_code_norm")
    WHERE "product_registry_id" IS NULL;

ALTER TABLE "nfe_item_product_link"
    ADD CONSTRAINT "nfe_item_product_link_company_id_fkey"
    FOREIGN KEY ("company_id") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "nfe_item_product_link"
    ADD CONSTRAINT "nfe_item_product_link_invoice_id_fkey"
    FOREIGN KEY ("invoice_id") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "nfe_item_product_link"
    ADD CONSTRAINT "nfe_item_product_link_product_registry_id_fkey"
    FOREIGN KEY ("product_registry_id") REFERENCES "product_registry"("id") ON DELETE SET NULL ON UPDATE CASCADE;
