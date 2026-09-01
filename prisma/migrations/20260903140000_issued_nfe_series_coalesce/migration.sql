-- Re-auditoria da remediação b177b07, REAUD-FISCAL-016.
--
-- `Invoice.series` é nullable e o índice parcial de 20260901180000 indexava a
-- coluna crua. Num unique o Postgres trata NULL como distinto de NULL: duas
-- NF-e emitidas com série NULL e o mesmo número passavam pelo índice. E a
-- pré-checagem daquele cabeçalho (GROUP BY em "series") agrupa NULL com NULL,
-- devolve COUNT=2 e faz o operador crer que a migração vai falhar quando o
-- índice aceitaria — a checagem era mais estrita do que a garantia.
--
-- Medido num postgres:18 descartável com o índice antigo: dois INSERTs de NF-e
-- issued, mesma empresa, número 77, série NULL → os dois passam, e a
-- pré-checagem antiga devolve a linha com COUNT=2.
--
-- Esta migração troca o índice por COALESCE("series", ''): NULL e '' viram a
-- mesma série, no índice e na pré-checagem abaixo — as duas dizem agora a mesma
-- coisa. A migração de 20260901180000 fica intacta (já está em main).
-- `InvoiceEmission.series` é NOT NULL; o unique dela não tem este furo.
--
-- Antes de aplicar em produção, confirme que não há duplicata herdada. Esta
-- pré-checagem casa exactamente com o índice novo:
--
--   SELECT "companyId", COALESCE("series", '') AS series, "number", COUNT(*)
--   FROM "Invoice" WHERE "type" = 'NFE' AND "direction" = 'issued'
--   GROUP BY 1,2,3 HAVING COUNT(*) > 1;
--
-- Se devolver linhas, a migração falha de propósito: são exactamente as notas
-- duplicadas que o índice existe para impedir. Decida o destino delas antes;
-- não relaxe o índice.
--
-- O Prisma não expressa índice parcial nem de expressão no schema, então este
-- índice vive só aqui — `migrate diff` ignora-o (verificado: o parcial antigo
-- já passava no `db:migrate:verify`). Se um `prisma migrate dev` futuro
-- propuser removê-lo, a remoção é que está errada.

-- DropIndex
DROP INDEX "Invoice_issued_nfe_companyId_series_number_key";

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_issued_nfe_companyId_series_number_key"
  ON "Invoice"("companyId", (COALESCE("series", '')), "number")
  WHERE "type" = 'NFE' AND "direction" = 'issued';
