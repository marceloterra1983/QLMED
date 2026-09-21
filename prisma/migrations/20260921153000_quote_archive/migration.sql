-- SPEC-086: arquivo histórico de orçamentos SPICA (expand-only)
CREATE TABLE "quote_archive" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "sha256" TEXT NOT NULL,
    "number" INTEGER,
    "number_label" TEXT,
    "issued_at" DATE,
    "layout" TEXT NOT NULL,
    "source_kind" TEXT NOT NULL,
    "source_mailbox" TEXT,
    "source_path" TEXT NOT NULL,
    "source_subject" TEXT,
    "customer_cnpj" TEXT NOT NULL DEFAULT '',
    "customer_name" TEXT NOT NULL DEFAULT '',
    "salesperson" TEXT,
    "patient_name" TEXT,
    "doctor_name" TEXT,
    "convenio" TEXT,
    "local" TEXT,
    "notes" TEXT,
    "freight" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "subtotal" DECIMAL(14,2) NOT NULL,
    "total" DECIMAL(14,2) NOT NULL,
    "parse_warnings" JSONB NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "quote_archive_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "quote_archive_company_id_sha256_key" ON "quote_archive"("company_id", "sha256");
CREATE INDEX "quote_archive_company_id_issued_at_idx" ON "quote_archive"("company_id", "issued_at" DESC);
CREATE INDEX "quote_archive_company_id_customer_cnpj_idx" ON "quote_archive"("company_id", "customer_cnpj");

ALTER TABLE "quote_archive" ADD CONSTRAINT "quote_archive_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "quote_archive_item" (
    "id" TEXT NOT NULL,
    "archive_id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "line_number" INTEGER NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "rvs" TEXT,
    "ncm" TEXT,
    "unit" TEXT,
    "quantity" DECIMAL(12,4) NOT NULL,
    "unit_price" DECIMAL(14,2) NOT NULL,
    "discount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "line_total" DECIMAL(14,2) NOT NULL,

    CONSTRAINT "quote_archive_item_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "quote_archive_item_archive_id_line_number_key" ON "quote_archive_item"("archive_id", "line_number");
CREATE INDEX "quote_archive_item_company_id_idx" ON "quote_archive_item"("company_id");

ALTER TABLE "quote_archive_item" ADD CONSTRAINT "quote_archive_item_archive_id_fkey" FOREIGN KEY ("archive_id") REFERENCES "quote_archive"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "quote_archive_item" ADD CONSTRAINT "quote_archive_item_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
