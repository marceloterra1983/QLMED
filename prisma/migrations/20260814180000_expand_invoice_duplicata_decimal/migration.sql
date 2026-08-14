SET lock_timeout = '10s';
SET statement_timeout = '15min';

-- SPEC-004 expand: Decimal sidecars beside existing Float columns.
-- Do not DROP or rename Float; contract is a later PR.

ALTER TABLE "invoice_duplicata"
  ADD COLUMN IF NOT EXISTS "dup_valor_decimal" DECIMAL(65,30),
  ADD COLUMN IF NOT EXISTS "fatura_valor_original_decimal" DECIMAL(65,30),
  ADD COLUMN IF NOT EXISTS "fatura_valor_liquido_decimal" DECIMAL(65,30);

UPDATE "invoice_duplicata"
SET
  "dup_valor_decimal" = "dup_valor"::decimal,
  "fatura_valor_original_decimal" = "fatura_valor_original"::decimal,
  "fatura_valor_liquido_decimal" = "fatura_valor_liquido"::decimal
WHERE "dup_valor_decimal" IS NULL;
