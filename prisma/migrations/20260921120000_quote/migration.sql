-- SPEC-085: orçamentos comerciais (expand-only)
CREATE TYPE "QuoteStatus" AS ENUM ('draft', 'issued', 'cancelled');

CREATE TABLE "quote" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "issued_at" DATE NOT NULL,
    "status" "QuoteStatus" NOT NULL DEFAULT 'draft',
    "customer_cnpj" TEXT NOT NULL,
    "customer_name" TEXT NOT NULL,
    "customer_ie" TEXT,
    "customer_code" TEXT,
    "customer_street" TEXT,
    "customer_number" TEXT,
    "customer_district" TEXT,
    "customer_city" TEXT,
    "customer_state" TEXT,
    "customer_zip" TEXT,
    "salesperson" TEXT,
    "patient_name" TEXT,
    "doctor_name" TEXT,
    "convenio" TEXT,
    "local" TEXT,
    "notes" TEXT,
    "freight" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "subtotal" DECIMAL(14,2) NOT NULL,
    "total" DECIMAL(14,2) NOT NULL,
    "created_by_user_id" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "quote_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "quote_company_id_number_key" ON "quote"("company_id", "number");
CREATE INDEX "quote_company_id_issued_at_idx" ON "quote"("company_id", "issued_at" DESC);
CREATE INDEX "quote_company_id_status_idx" ON "quote"("company_id", "status");
CREATE INDEX "quote_company_id_customer_cnpj_idx" ON "quote"("company_id", "customer_cnpj");

ALTER TABLE "quote" ADD CONSTRAINT "quote_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "quote_item" (
    "id" TEXT NOT NULL,
    "quote_id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "line_number" INTEGER NOT NULL,
    "product_registry_id" TEXT,
    "code" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "rvs" TEXT,
    "ncm" TEXT,
    "unit" TEXT,
    "quantity" DECIMAL(12,4) NOT NULL,
    "unit_price" DECIMAL(14,2) NOT NULL,
    "discount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "line_total" DECIMAL(14,2) NOT NULL,

    CONSTRAINT "quote_item_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "quote_item_quote_id_line_number_key" ON "quote_item"("quote_id", "line_number");
CREATE INDEX "quote_item_company_id_idx" ON "quote_item"("company_id");

ALTER TABLE "quote_item" ADD CONSTRAINT "quote_item_quote_id_fkey" FOREIGN KEY ("quote_id") REFERENCES "quote"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "quote_item" ADD CONSTRAINT "quote_item_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "quote_item" ADD CONSTRAINT "quote_item_product_registry_id_fkey" FOREIGN KEY ("product_registry_id") REFERENCES "product_registry"("id") ON DELETE SET NULL ON UPDATE CASCADE;
