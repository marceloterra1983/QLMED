-- Auditoria b177b07, backlog 1: unique de série+número na emissão de NF-e.
--
-- Antes de aplicar em produção, confirme que não há duplicata herdada:
--
--   SELECT "companyId", "series", "number", COUNT(*)
--   FROM "InvoiceEmission" WHERE "number" IS NOT NULL
--   GROUP BY 1,2,3 HAVING COUNT(*) > 1;
--
--   SELECT "companyId", "series", "number", COUNT(*)
--   FROM "Invoice" WHERE "type" = 'NFE' AND "direction" = 'issued'
--   GROUP BY 1,2,3 HAVING COUNT(*) > 1;
--
-- Se alguma das duas devolver linhas, a migração falha de propósito: são
-- exatamente as notas duplicadas que este índice existe para impedir.

-- CreateIndex
CREATE UNIQUE INDEX "InvoiceEmission_companyId_series_number_key"
  ON "InvoiceEmission"("companyId", "series", "number");

-- CreateIndex
-- Parcial: só NF-e emitida por nós. Um unique cheio quebraria a ingestão de
-- documentos recebidos, onde dois fornecedores diferentes usam a mesma série e
-- o mesmo número. O Prisma não expressa índice parcial no schema, então este
-- índice vive só aqui — se um `prisma migrate dev` futuro propuser removê-lo,
-- a remoção é que está errada.
CREATE UNIQUE INDEX "Invoice_issued_nfe_companyId_series_number_key"
  ON "Invoice"("companyId", "series", "number")
  WHERE "type" = 'NFE' AND "direction" = 'issued';
