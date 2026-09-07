-- SPEC-056: ledger de estoque
CREATE TABLE "stock_movement" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "product_codigo" TEXT NOT NULL,
    "product_name" TEXT,
    "product_registry_id" TEXT,
    "lot" TEXT NOT NULL DEFAULT '',
    "lot_expiry" TEXT,
    "lot_serial" TEXT,
    "quantity" DOUBLE PRECISION NOT NULL,
    "direction" TEXT NOT NULL,
    "location_type" TEXT NOT NULL,
    "location_cnpj" TEXT,
    "location_name" TEXT,
    "kind" TEXT NOT NULL,
    "invoice_id" TEXT,
    "nfe_entry_item_id" INTEGER,
    "reason" TEXT,
    "created_by" TEXT,
    "occurred_at" TIMESTAMPTZ NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "transfer_group_id" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_movement_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "stock_movement_idempotency_key_key" ON "stock_movement"("idempotency_key");
CREATE INDEX "stock_movement_company_id_product_codigo_idx" ON "stock_movement"("company_id", "product_codigo");
CREATE INDEX "stock_movement_company_id_location_type_location_cnpj_idx" ON "stock_movement"("company_id", "location_type", "location_cnpj");
CREATE INDEX "stock_movement_company_id_occurred_at_idx" ON "stock_movement"("company_id", "occurred_at");
CREATE INDEX "stock_movement_invoice_id_idx" ON "stock_movement"("invoice_id");

ALTER TABLE "stock_movement" ADD CONSTRAINT "stock_movement_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "stock_movement" ADD CONSTRAINT "stock_movement_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;
