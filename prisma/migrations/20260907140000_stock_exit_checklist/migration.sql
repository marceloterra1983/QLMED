-- SPEC-057: checklist / saída avulsa append-only
CREATE TABLE "stock_exit_checklist" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "tab" TEXT NOT NULL,
    "customer_cnpj" TEXT,
    "customer_name" TEXT,
    "items" JSONB NOT NULL,
    "kind" TEXT NOT NULL,
    "created_by" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_exit_checklist_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "stock_exit_checklist_company_id_created_at_idx" ON "stock_exit_checklist"("company_id", "created_at");

ALTER TABLE "stock_exit_checklist" ADD CONSTRAINT "stock_exit_checklist_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
