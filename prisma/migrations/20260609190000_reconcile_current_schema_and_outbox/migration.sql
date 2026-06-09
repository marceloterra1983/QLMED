SET lock_timeout = '10s';
SET statement_timeout = '15min';

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "AccessLogAction" AS ENUM ('login', 'login_failed', 'logout', 'navigation', 'api_key_used', 'user_created', 'user_updated', 'user_deleted', 'role_changed', 'status_changed', 'pages_changed', 'permission_denied', 'account_locked', 'notification_resolved');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
ALTER TYPE "AccessLogAction" ADD VALUE IF NOT EXISTS 'notification_resolved';

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "NotificationEventType" AS ENUM ('invoice_received');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "NotificationChannel" AS ENUM ('email', 'whatsapp');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "NotificationDeliveryStatus" AS ENUM ('pending', 'processing', 'sent', 'retry', 'uncertain', 'dead');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AlterEnum
ALTER TYPE "SyncStatus" ADD VALUE IF NOT EXISTS 'partial';

-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "cfop" TEXT;
DO $$ BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'Invoice'
      AND column_name = 'totalValue'
      AND data_type <> 'numeric'
  ) THEN
    ALTER TABLE "Invoice" ALTER COLUMN "totalValue" SET DATA TYPE DECIMAL(65,30);
  END IF;
END $$;

-- AlterTable
ALTER TABLE "SyncLog" ADD COLUMN IF NOT EXISTS "skippedDocs" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "failedAttempts" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "lockedUntil" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "tokenVersion" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE IF NOT EXISTS "ApiKey" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "scopes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),
    "lastUsedAt" TIMESTAMP(3),

    CONSTRAINT "ApiKey_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "ApiKey" ADD COLUMN IF NOT EXISTS "scopes" TEXT[] DEFAULT ARRAY[]::TEXT[];
UPDATE "ApiKey" SET "scopes" = ARRAY[]::TEXT[] WHERE "scopes" IS NULL;
ALTER TABLE "ApiKey" ALTER COLUMN "scopes" SET DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "ApiKey" ALTER COLUMN "scopes" SET NOT NULL;

-- CreateTable
CREATE TABLE IF NOT EXISTS "AccessLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "action" "AccessLogAction" NOT NULL,
    "path" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccessLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "NotificationOutboxEvent" (
    "id" TEXT NOT NULL,
    "eventKey" TEXT NOT NULL,
    "eventType" "NotificationEventType" NOT NULL DEFAULT 'invoice_received',
    "companyId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotificationOutboxEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "NotificationDelivery" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "recipient" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "status" "NotificationDeliveryStatus" NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockedAt" TIMESTAMP(3),
    "lockToken" TEXT,
    "submittingAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "providerMessageId" TEXT,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotificationDelivery_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "NotificationDelivery" ADD COLUMN IF NOT EXISTS "submittingAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE IF NOT EXISTS "ProductAggregateRebuildState" (
    "companyId" TEXT NOT NULL,
    "cutoffCreatedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductAggregateRebuildState_pkey" PRIMARY KEY ("companyId")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "FinanceiroDuplicataOverride" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "dupNumeroOriginal" TEXT NOT NULL,
    "dupVencimentoOriginal" TEXT NOT NULL,
    "emitenteNome" TEXT,
    "emitenteCnpj" TEXT,
    "faturaNumero" TEXT,
    "dupNumero" TEXT,
    "dupVencimento" TEXT,
    "dupValor" DECIMAL(65,30),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinanceiroDuplicataOverride_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "FinanceiroDuplicataManualInstallment" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "dupNumero" TEXT NOT NULL,
    "dupVencimento" TEXT NOT NULL,
    "dupValor" DECIMAL(65,30) NOT NULL,
    "dupDesconto" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinanceiroDuplicataManualInstallment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "invoice_tax_totals" (
    "invoice_id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "vbc" DOUBLE PRECISION,
    "vicms" DOUBLE PRECISION,
    "vpis" DOUBLE PRECISION,
    "vcofins" DOUBLE PRECISION,
    "vipi" DOUBLE PRECISION,
    "vfrete" DOUBLE PRECISION,
    "vseg" DOUBLE PRECISION,
    "vdesc" DOUBLE PRECISION,
    "voutro" DOUBLE PRECISION,
    "vtottrib" DOUBLE PRECISION,
    "vfcp" DOUBLE PRECISION,
    "vicms_st" DOUBLE PRECISION,
    "computed_at" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invoice_tax_totals_pkey" PRIMARY KEY ("invoice_id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "invoice_item_tax" (
    "id" TEXT NOT NULL,
    "invoice_id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "item_number" INTEGER,
    "product_code" TEXT,
    "product_description" TEXT,
    "ncm" TEXT,
    "cfop" TEXT,
    "cest" TEXT,
    "origem" TEXT,
    "quantity" DOUBLE PRECISION,
    "unit_price" DOUBLE PRECISION,
    "total_value" DOUBLE PRECISION,
    "cst_icms" TEXT,
    "base_icms" DOUBLE PRECISION,
    "aliq_icms" DOUBLE PRECISION,
    "valor_icms" DOUBLE PRECISION,
    "cst_pis" TEXT,
    "aliq_pis" DOUBLE PRECISION,
    "valor_pis" DOUBLE PRECISION,
    "cst_cofins" TEXT,
    "aliq_cofins" DOUBLE PRECISION,
    "valor_cofins" DOUBLE PRECISION,
    "aliq_ipi" DOUBLE PRECISION,
    "valor_ipi" DOUBLE PRECISION,
    "valor_fcp" DOUBLE PRECISION,

    CONSTRAINT "invoice_item_tax_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "contact_fiscal" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "cnpj" TEXT NOT NULL,
    "ie" TEXT,
    "im" TEXT,
    "crt" TEXT,
    "uf" TEXT,
    "city" TEXT,
    "source_invoice_id" TEXT,
    "extracted_at" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contact_fiscal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "invoice_duplicata" (
    "id" TEXT NOT NULL,
    "invoice_id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "dup_numero" TEXT,
    "dup_vencimento" TEXT NOT NULL,
    "dup_valor" DOUBLE PRECISION NOT NULL,
    "fatura_numero" TEXT,
    "fatura_valor_original" DOUBLE PRECISION,
    "fatura_valor_liquido" DOUBLE PRECISION,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invoice_duplicata_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "ncm_cache" (
    "code" TEXT NOT NULL,
    "descricao" TEXT NOT NULL DEFAULT '',
    "parent_code" TEXT,
    "full_description" TEXT NOT NULL DEFAULT '',
    "hierarchy" JSONB NOT NULL DEFAULT '[]',
    "fetched_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ncm_cache_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "product_registry" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "product_key" TEXT NOT NULL,
    "code" TEXT,
    "description" TEXT NOT NULL,
    "ncm" TEXT,
    "unit" TEXT,
    "ean" TEXT,
    "anvisa_code" TEXT,
    "anvisa_source" TEXT,
    "anvisa_confidence" DOUBLE PRECISION,
    "anvisa_matched_product_name" TEXT,
    "anvisa_holder" TEXT,
    "anvisa_process" TEXT,
    "anvisa_status" TEXT,
    "anvisa_expiration" TEXT,
    "anvisa_risk_class" TEXT,
    "anvisa_manufacturer" TEXT,
    "anvisa_manufacturer_country" TEXT,
    "manufacturer_short_name" TEXT,
    "anvisa_synced_at" TIMESTAMPTZ,
    "short_name" TEXT,
    "product_type" TEXT,
    "product_subtype" TEXT,
    "product_subgroup" TEXT,
    "out_of_line" BOOLEAN DEFAULT false,
    "instrumental" BOOLEAN DEFAULT false,
    "codigo" TEXT,
    "fiscal_sit_tributaria" TEXT,
    "fiscal_nome_tributacao" TEXT,
    "fiscal_icms" DOUBLE PRECISION,
    "fiscal_pis" DOUBLE PRECISION,
    "fiscal_cofins" DOUBLE PRECISION,
    "fiscal_obs" TEXT,
    "fiscal_cest" TEXT,
    "fiscal_origem" TEXT,
    "fiscal_cfop_entrada" TEXT,
    "fiscal_cfop_saida" TEXT,
    "fiscal_ipi" DOUBLE PRECISION,
    "fiscal_fcp" DOUBLE PRECISION,
    "fiscal_cst_ipi" TEXT,
    "fiscal_cst_pis" TEXT,
    "fiscal_cst_cofins" TEXT,
    "fiscal_obs_icms" TEXT,
    "fiscal_obs_pis_cofins" TEXT,
    "product_refs" TEXT[],
    "default_supplier" TEXT,
    "agg_total_quantity" DOUBLE PRECISION,
    "agg_total_value" DOUBLE PRECISION,
    "agg_invoice_count" INTEGER,
    "agg_last_price" DOUBLE PRECISION,
    "agg_average_price" DOUBLE PRECISION,
    "agg_last_issue_date" TIMESTAMPTZ,
    "agg_last_supplier_name" TEXT,
    "agg_last_supplier_cnpj" TEXT,
    "agg_last_invoice_number" TEXT,
    "agg_last_sale_date" TIMESTAMPTZ,
    "agg_last_sale_price" DOUBLE PRECISION,
    "agg_resale_quantity" DOUBLE PRECISION,
    "agg_computed_at" TIMESTAMPTZ,
    "agg_search_text" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_registry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "stock_entry" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "invoice_id" TEXT NOT NULL,
    "invoice_number" TEXT,
    "supplier_name" TEXT,
    "supplier_cnpj" TEXT,
    "issue_date" TIMESTAMPTZ,
    "total_value" DOUBLE PRECISION,
    "total_items" INTEGER DEFAULT 0,
    "matched_items" INTEGER DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "registered_at" TIMESTAMPTZ,
    "registered_by" TEXT,
    "emitter_city" TEXT,
    "emitter_state" TEXT,
    "access_key" TEXT,
    "cfop" TEXT,
    "tot_vprod" DOUBLE PRECISION,
    "tot_vdesc" DOUBLE PRECISION,
    "tot_vbc" DOUBLE PRECISION,
    "tot_vicms" DOUBLE PRECISION,
    "tot_vbc_st" DOUBLE PRECISION,
    "tot_vicms_st" DOUBLE PRECISION,
    "tot_vfrete" DOUBLE PRECISION,
    "tot_vseg" DOUBLE PRECISION,
    "tot_voutro" DOUBLE PRECISION,
    "tot_vipi" DOUBLE PRECISION,
    "tot_vpis" DOUBLE PRECISION,
    "tot_vcofins" DOUBLE PRECISION,
    "tot_vfcp" DOUBLE PRECISION,
    "tot_vnf" DOUBLE PRECISION,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_entry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "nfe_entry_item" (
    "id" SERIAL NOT NULL,
    "stock_entry_id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "invoice_id" TEXT NOT NULL,
    "item_number" INTEGER NOT NULL,
    "supplier_code" TEXT,
    "supplier_description" TEXT,
    "ncm" TEXT,
    "cfop" TEXT,
    "cest" TEXT,
    "ean" TEXT,
    "anvisa" TEXT,
    "unit" TEXT,
    "registry_id" TEXT,
    "codigo_interno" TEXT,
    "product_name" TEXT,
    "manufacturer" TEXT,
    "product_type" TEXT,
    "product_subtype" TEXT,
    "quantity" DOUBLE PRECISION DEFAULT 0,
    "unit_price" DOUBLE PRECISION DEFAULT 0,
    "total_value_gross" DOUBLE PRECISION DEFAULT 0,
    "item_discount" DOUBLE PRECISION DEFAULT 0,
    "total_value_net" DOUBLE PRECISION DEFAULT 0,
    "origem" TEXT,
    "cst_icms" TEXT,
    "base_icms" DOUBLE PRECISION,
    "aliq_icms" DOUBLE PRECISION,
    "valor_icms" DOUBLE PRECISION,
    "base_icms_st" DOUBLE PRECISION,
    "valor_icms_st" DOUBLE PRECISION,
    "cst_ipi" TEXT,
    "aliq_ipi" DOUBLE PRECISION,
    "base_ipi" DOUBLE PRECISION,
    "valor_ipi" DOUBLE PRECISION,
    "cst_pis" TEXT,
    "aliq_pis" DOUBLE PRECISION,
    "base_pis" DOUBLE PRECISION,
    "valor_pis" DOUBLE PRECISION,
    "cst_cofins" TEXT,
    "aliq_cofins" DOUBLE PRECISION,
    "base_cofins" DOUBLE PRECISION,
    "valor_cofins" DOUBLE PRECISION,
    "valor_fcp" DOUBLE PRECISION,
    "rateio_frete" DOUBLE PRECISION DEFAULT 0,
    "rateio_seguro" DOUBLE PRECISION DEFAULT 0,
    "rateio_outras_desp" DOUBLE PRECISION DEFAULT 0,
    "rateio_desconto" DOUBLE PRECISION DEFAULT 0,
    "lot" TEXT,
    "lot_serial" TEXT,
    "lot_quantity" DOUBLE PRECISION,
    "lot_fabrication" TEXT,
    "lot_expiry" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ,

    CONSTRAINT "nfe_entry_item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "product_settings_catalog" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "section" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "parent_value" TEXT,
    "parent_secondary_value" TEXT,
    "parent_value_key" TEXT NOT NULL DEFAULT '',
    "parent_secondary_value_key" TEXT NOT NULL DEFAULT '',
    "extra_value" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_settings_catalog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "cnpj_cache" (
    "cnpj" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "fetched_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cnpj_cache_pkey" PRIMARY KEY ("cnpj")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "cnpj_monitoring" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "cnpj" TEXT NOT NULL,
    "contact_name" TEXT,
    "previous_status" TEXT,
    "current_status" TEXT,
    "changed_at" TIMESTAMPTZ,
    "checked_at" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cnpj_monitoring_pkey" PRIMARY KEY ("id")
);

UPDATE "product_registry" SET "product_refs" = ARRAY[]::TEXT[] WHERE "product_refs" IS NULL;
ALTER TABLE "product_registry" ALTER COLUMN "product_refs" SET DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "product_registry" ALTER COLUMN "product_refs" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "ApiKey_keyHash_key" ON "ApiKey"("keyHash");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ApiKey_revokedAt_idx" ON "ApiKey"("revokedAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AccessLog_userId_createdAt_idx" ON "AccessLog"("userId", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AccessLog_createdAt_idx" ON "AccessLog"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "NotificationOutboxEvent_eventKey_key" ON "NotificationOutboxEvent"("eventKey");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "NotificationOutboxEvent_invoiceId_key" ON "NotificationOutboxEvent"("invoiceId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "NotificationOutboxEvent_eventType_createdAt_idx" ON "NotificationOutboxEvent"("eventType", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "NotificationOutboxEvent_companyId_createdAt_idx" ON "NotificationOutboxEvent"("companyId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "NotificationDelivery_idempotencyKey_key" ON "NotificationDelivery"("idempotencyKey");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "NotificationDelivery_status_availableAt_createdAt_idx" ON "NotificationDelivery"("status", "availableAt", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "NotificationDelivery_eventId_status_idx" ON "NotificationDelivery"("eventId", "status");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "NotificationDelivery_eventId_channel_recipient_key" ON "NotificationDelivery"("eventId", "channel", "recipient");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "FinanceiroDuplicataOverride_companyId_idx" ON "FinanceiroDuplicataOverride"("companyId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "FinanceiroDuplicataOverride_invoiceId_idx" ON "FinanceiroDuplicataOverride"("invoiceId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "FinanceiroDuplicataOverride_companyId_invoiceId_idx" ON "FinanceiroDuplicataOverride"("companyId", "invoiceId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "company_invoice_dup_original" ON "FinanceiroDuplicataOverride"("companyId", "invoiceId", "dupNumeroOriginal", "dupVencimentoOriginal");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "FinanceiroDuplicataManualInstallment_companyId_idx" ON "FinanceiroDuplicataManualInstallment"("companyId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "FinanceiroDuplicataManualInstallment_invoiceId_idx" ON "FinanceiroDuplicataManualInstallment"("invoiceId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "FinanceiroDuplicataManualInstallment_companyId_invoiceId_idx" ON "FinanceiroDuplicataManualInstallment"("companyId", "invoiceId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "company_invoice_manual_dup_num" ON "FinanceiroDuplicataManualInstallment"("companyId", "invoiceId", "dupNumero");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "invoice_tax_totals_company_id_idx" ON "invoice_tax_totals"("company_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "invoice_item_tax_invoice_id_idx" ON "invoice_item_tax"("invoice_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "invoice_item_tax_company_id_cfop_idx" ON "invoice_item_tax"("company_id", "cfop");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "contact_fiscal_company_id_idx" ON "contact_fiscal"("company_id");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "contact_fiscal_company_id_cnpj_key" ON "contact_fiscal"("company_id", "cnpj");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "invoice_duplicata_company_id_idx" ON "invoice_duplicata"("company_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "invoice_duplicata_invoice_id_idx" ON "invoice_duplicata"("invoice_id");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "invoice_duplicata_invoice_id_dup_numero_dup_vencimento_key" ON "invoice_duplicata"("invoice_id", "dup_numero", "dup_vencimento");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ncm_cache_parent_code_idx" ON "ncm_cache"("parent_code");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "product_registry_company_id_idx" ON "product_registry"("company_id");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "product_registry_company_id_product_key_key" ON "product_registry"("company_id", "product_key");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "stock_entry_company_id_idx" ON "stock_entry"("company_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "stock_entry_company_id_status_idx" ON "stock_entry"("company_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "stock_entry_company_id_invoice_id_key" ON "stock_entry"("company_id", "invoice_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "nfe_entry_item_stock_entry_id_idx" ON "nfe_entry_item"("stock_entry_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "nfe_entry_item_company_id_invoice_id_idx" ON "nfe_entry_item"("company_id", "invoice_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "nfe_entry_item_company_id_codigo_interno_idx" ON "nfe_entry_item"("company_id", "codigo_interno");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "product_settings_catalog_company_id_idx" ON "product_settings_catalog"("company_id");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "product_settings_catalog_company_id_section_value_parent_va_key" ON "product_settings_catalog"("company_id", "section", "value", "parent_value_key", "parent_secondary_value_key");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "cnpj_monitoring_company_id_idx" ON "cnpj_monitoring"("company_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "cnpj_monitoring_company_id_changed_at_idx" ON "cnpj_monitoring"("company_id", "changed_at");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "cnpj_monitoring_company_id_cnpj_key" ON "cnpj_monitoring"("company_id", "cnpj");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Invoice_companyId_cfop_idx" ON "Invoice"("companyId", "cfop");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Invoice_recipientCnpj_idx" ON "Invoice"("recipientCnpj");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Invoice_companyId_recipientCnpj_idx" ON "Invoice"("companyId", "recipientCnpj");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "SyncLog_companyId_status_idx" ON "SyncLog"("companyId", "status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "SyncLog_companyId_syncMethod_status_idx" ON "SyncLog"("companyId", "syncMethod", "status");

-- Drop legacy duplicate indexes after their canonical equivalents exist.
DROP INDEX IF EXISTS "idx_tax_totals_company";
DROP INDEX IF EXISTS "idx_item_tax_invoice";
DROP INDEX IF EXISTS "idx_item_tax_company_cfop";
DROP INDEX IF EXISTS "idx_contact_fiscal_company";
DROP INDEX IF EXISTS "idx_invoice_duplicata_company";
DROP INDEX IF EXISTS "idx_invoice_duplicata_invoice";
DROP INDEX IF EXISTS "product_registry_company_idx";
DROP INDEX IF EXISTS "stock_entry_company_idx";
DROP INDEX IF EXISTS "stock_entry_company_status_idx";
DROP INDEX IF EXISTS "nfe_entry_item_stock_entry_idx";
DROP INDEX IF EXISTS "nfe_entry_item_company_invoice_idx";
DROP INDEX IF EXISTS "nfe_entry_item_company_codigo_idx";
DROP INDEX IF EXISTS "idx_cnpj_mon_company";
DROP INDEX IF EXISTS "idx_cnpj_mon_changed";

-- Runtime-managed structures that predate migration tracking.
ALTER TABLE "contact_fiscal" ADD COLUMN IF NOT EXISTS "city" TEXT;
DO $$ BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_trgm;
EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE 'pg_trgm extension unavailable; continuing without trigram index';
END $$;
CREATE INDEX IF NOT EXISTS "product_registry_company_id_anvisa_code_idx"
  ON "product_registry" ("company_id", "anvisa_code");
CREATE INDEX IF NOT EXISTS "product_registry_agg_issue_idx"
  ON "product_registry" ("company_id", "agg_last_issue_date" DESC NULLS LAST)
  WHERE "agg_computed_at" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "product_registry_agg_type_idx"
  ON "product_registry" ("company_id", "product_type", "product_subtype")
  WHERE "agg_computed_at" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "product_registry_out_of_line_idx"
  ON "product_registry" ("company_id", "out_of_line")
  WHERE "agg_computed_at" IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "product_registry_company_codigo_idx"
  ON "product_registry" ("company_id", "codigo")
  WHERE "codigo" IS NOT NULL;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_trgm') THEN
    CREATE INDEX IF NOT EXISTS "product_registry_search_trgm_idx"
      ON "product_registry" USING gin ("agg_search_text" gin_trgm_ops)
      WHERE "agg_computed_at" IS NOT NULL;
  END IF;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "ApiKey" ADD CONSTRAINT "ApiKey_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "AccessLog" ADD CONSTRAINT "AccessLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "NotificationOutboxEvent" ADD CONSTRAINT "NotificationOutboxEvent_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "NotificationOutboxEvent" ADD CONSTRAINT "NotificationOutboxEvent_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "NotificationDelivery" ADD CONSTRAINT "NotificationDelivery_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "NotificationOutboxEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "ProductAggregateRebuildState" ADD CONSTRAINT "ProductAggregateRebuildState_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "FinanceiroDuplicataOverride" ADD CONSTRAINT "FinanceiroDuplicataOverride_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "FinanceiroDuplicataOverride" ADD CONSTRAINT "FinanceiroDuplicataOverride_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "FinanceiroDuplicataManualInstallment" ADD CONSTRAINT "FinanceiroDuplicataManualInstallment_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "FinanceiroDuplicataManualInstallment" ADD CONSTRAINT "FinanceiroDuplicataManualInstallment_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
