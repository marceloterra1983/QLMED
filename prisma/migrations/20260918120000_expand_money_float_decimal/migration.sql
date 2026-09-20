SET lock_timeout = '10s';
SET statement_timeout = '15min';

-- SPEC-004 T009 expand: Decimal sidecars beside remaining money Float columns
-- (ADR-0013 fase 1: stock_entry 15 + nfe_entry_item 8, plus invoice_item_tax
-- unit_price/total_value). Do not DROP or rename Float; contract is a later PR.

ALTER TABLE "stock_entry"
  ADD COLUMN IF NOT EXISTS "total_value_decimal" DECIMAL(65,30),
  ADD COLUMN IF NOT EXISTS "tot_vprod_decimal" DECIMAL(65,30),
  ADD COLUMN IF NOT EXISTS "tot_vdesc_decimal" DECIMAL(65,30),
  ADD COLUMN IF NOT EXISTS "tot_vbc_decimal" DECIMAL(65,30),
  ADD COLUMN IF NOT EXISTS "tot_vicms_decimal" DECIMAL(65,30),
  ADD COLUMN IF NOT EXISTS "tot_vbc_st_decimal" DECIMAL(65,30),
  ADD COLUMN IF NOT EXISTS "tot_vicms_st_decimal" DECIMAL(65,30),
  ADD COLUMN IF NOT EXISTS "tot_vfrete_decimal" DECIMAL(65,30),
  ADD COLUMN IF NOT EXISTS "tot_vseg_decimal" DECIMAL(65,30),
  ADD COLUMN IF NOT EXISTS "tot_voutro_decimal" DECIMAL(65,30),
  ADD COLUMN IF NOT EXISTS "tot_vipi_decimal" DECIMAL(65,30),
  ADD COLUMN IF NOT EXISTS "tot_vpis_decimal" DECIMAL(65,30),
  ADD COLUMN IF NOT EXISTS "tot_vcofins_decimal" DECIMAL(65,30),
  ADD COLUMN IF NOT EXISTS "tot_vfcp_decimal" DECIMAL(65,30),
  ADD COLUMN IF NOT EXISTS "tot_vnf_decimal" DECIMAL(65,30);

ALTER TABLE "nfe_entry_item"
  ADD COLUMN IF NOT EXISTS "unit_price_decimal" DECIMAL(65,30),
  ADD COLUMN IF NOT EXISTS "total_value_gross_decimal" DECIMAL(65,30),
  ADD COLUMN IF NOT EXISTS "item_discount_decimal" DECIMAL(65,30),
  ADD COLUMN IF NOT EXISTS "total_value_net_decimal" DECIMAL(65,30),
  ADD COLUMN IF NOT EXISTS "rateio_frete_decimal" DECIMAL(65,30),
  ADD COLUMN IF NOT EXISTS "rateio_seguro_decimal" DECIMAL(65,30),
  ADD COLUMN IF NOT EXISTS "rateio_outras_desp_decimal" DECIMAL(65,30),
  ADD COLUMN IF NOT EXISTS "rateio_desconto_decimal" DECIMAL(65,30);

ALTER TABLE "invoice_item_tax"
  ADD COLUMN IF NOT EXISTS "unit_price_decimal" DECIMAL(65,30),
  ADD COLUMN IF NOT EXISTS "total_value_decimal" DECIMAL(65,30);

UPDATE "stock_entry"
SET
  "total_value_decimal" = COALESCE("total_value_decimal", "total_value"::decimal),
  "tot_vprod_decimal" = COALESCE("tot_vprod_decimal", "tot_vprod"::decimal),
  "tot_vdesc_decimal" = COALESCE("tot_vdesc_decimal", "tot_vdesc"::decimal),
  "tot_vbc_decimal" = COALESCE("tot_vbc_decimal", "tot_vbc"::decimal),
  "tot_vicms_decimal" = COALESCE("tot_vicms_decimal", "tot_vicms"::decimal),
  "tot_vbc_st_decimal" = COALESCE("tot_vbc_st_decimal", "tot_vbc_st"::decimal),
  "tot_vicms_st_decimal" = COALESCE("tot_vicms_st_decimal", "tot_vicms_st"::decimal),
  "tot_vfrete_decimal" = COALESCE("tot_vfrete_decimal", "tot_vfrete"::decimal),
  "tot_vseg_decimal" = COALESCE("tot_vseg_decimal", "tot_vseg"::decimal),
  "tot_voutro_decimal" = COALESCE("tot_voutro_decimal", "tot_voutro"::decimal),
  "tot_vipi_decimal" = COALESCE("tot_vipi_decimal", "tot_vipi"::decimal),
  "tot_vpis_decimal" = COALESCE("tot_vpis_decimal", "tot_vpis"::decimal),
  "tot_vcofins_decimal" = COALESCE("tot_vcofins_decimal", "tot_vcofins"::decimal),
  "tot_vfcp_decimal" = COALESCE("tot_vfcp_decimal", "tot_vfcp"::decimal),
  "tot_vnf_decimal" = COALESCE("tot_vnf_decimal", "tot_vnf"::decimal);

UPDATE "nfe_entry_item"
SET
  "unit_price_decimal" = COALESCE("unit_price_decimal", "unit_price"::decimal),
  "total_value_gross_decimal" = COALESCE("total_value_gross_decimal", "total_value_gross"::decimal),
  "item_discount_decimal" = COALESCE("item_discount_decimal", "item_discount"::decimal),
  "total_value_net_decimal" = COALESCE("total_value_net_decimal", "total_value_net"::decimal),
  "rateio_frete_decimal" = COALESCE("rateio_frete_decimal", "rateio_frete"::decimal),
  "rateio_seguro_decimal" = COALESCE("rateio_seguro_decimal", "rateio_seguro"::decimal),
  "rateio_outras_desp_decimal" = COALESCE("rateio_outras_desp_decimal", "rateio_outras_desp"::decimal),
  "rateio_desconto_decimal" = COALESCE("rateio_desconto_decimal", "rateio_desconto"::decimal);

UPDATE "invoice_item_tax"
SET
  "unit_price_decimal" = COALESCE("unit_price_decimal", "unit_price"::decimal),
  "total_value_decimal" = COALESCE("total_value_decimal", "total_value"::decimal);
