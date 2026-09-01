-- Auditoria b177b07, QLMED-DATA-001: as 9 tabelas satélite com tenant/nota
-- viviam sem FK. Apagar uma Invoice deixava tax_totals, item_tax, duplicata,
-- stock_entry e nfe_entry_item órfãos, porque a rota DELETE só apagava a linha
-- de "Invoice" e as satélites não tinham cascade nenhum — nem no banco, nem na
-- aplicação. Escolha: FK no banco, não delete transacional na rota. A rota é um
-- caminho entre vários (delete por cascade de Company, scripts, testes de
-- integração); a constraint cobre todos de uma vez e não pode ser esquecida no
-- próximo caller. ncm_cache e cnpj_cache ficam de fora: são caches globais, sem
-- coluna de tenant.
--
-- ANTES DE APLICAR EM PRODUÇÃO, confirme que não há órfão herdado. A migração
-- falha de propósito se houver — são exatamente as linhas que estas FKs existem
-- para impedir. Rode:
--
--   SELECT 'invoice_tax_totals.invoice_id' AS fk, COUNT(*) AS orfaos
--     FROM invoice_tax_totals t LEFT JOIN "Invoice" i ON i.id = t.invoice_id
--    WHERE i.id IS NULL
--   UNION ALL SELECT 'invoice_tax_totals.company_id', COUNT(*)
--     FROM invoice_tax_totals t LEFT JOIN "Company" c ON c.id = t.company_id
--    WHERE c.id IS NULL
--   UNION ALL SELECT 'invoice_item_tax.invoice_id', COUNT(*)
--     FROM invoice_item_tax t LEFT JOIN "Invoice" i ON i.id = t.invoice_id
--    WHERE i.id IS NULL
--   UNION ALL SELECT 'invoice_item_tax.company_id', COUNT(*)
--     FROM invoice_item_tax t LEFT JOIN "Company" c ON c.id = t.company_id
--    WHERE c.id IS NULL
--   UNION ALL SELECT 'contact_fiscal.company_id', COUNT(*)
--     FROM contact_fiscal t LEFT JOIN "Company" c ON c.id = t.company_id
--    WHERE c.id IS NULL
--   UNION ALL SELECT 'contact_fiscal.source_invoice_id', COUNT(*)
--     FROM contact_fiscal t LEFT JOIN "Invoice" i ON i.id = t.source_invoice_id
--    WHERE t.source_invoice_id IS NOT NULL AND i.id IS NULL
--   UNION ALL SELECT 'invoice_duplicata.invoice_id', COUNT(*)
--     FROM invoice_duplicata t LEFT JOIN "Invoice" i ON i.id = t.invoice_id
--    WHERE i.id IS NULL
--   UNION ALL SELECT 'invoice_duplicata.company_id', COUNT(*)
--     FROM invoice_duplicata t LEFT JOIN "Company" c ON c.id = t.company_id
--    WHERE c.id IS NULL
--   UNION ALL SELECT 'product_registry.company_id', COUNT(*)
--     FROM product_registry t LEFT JOIN "Company" c ON c.id = t.company_id
--    WHERE c.id IS NULL
--   UNION ALL SELECT 'stock_entry.company_id', COUNT(*)
--     FROM stock_entry t LEFT JOIN "Company" c ON c.id = t.company_id
--    WHERE c.id IS NULL
--   UNION ALL SELECT 'stock_entry.invoice_id', COUNT(*)
--     FROM stock_entry t LEFT JOIN "Invoice" i ON i.id = t.invoice_id
--    WHERE i.id IS NULL
--   UNION ALL SELECT 'nfe_entry_item.stock_entry_id', COUNT(*)
--     FROM nfe_entry_item t LEFT JOIN stock_entry s ON s.id = t.stock_entry_id
--    WHERE s.id IS NULL
--   UNION ALL SELECT 'nfe_entry_item.company_id', COUNT(*)
--     FROM nfe_entry_item t LEFT JOIN "Company" c ON c.id = t.company_id
--    WHERE c.id IS NULL
--   UNION ALL SELECT 'nfe_entry_item.invoice_id', COUNT(*)
--     FROM nfe_entry_item t LEFT JOIN "Invoice" i ON i.id = t.invoice_id
--    WHERE i.id IS NULL
--   UNION ALL SELECT 'product_settings_catalog.company_id', COUNT(*)
--     FROM product_settings_catalog t LEFT JOIN "Company" c ON c.id = t.company_id
--    WHERE c.id IS NULL
--   UNION ALL SELECT 'cnpj_monitoring.company_id', COUNT(*)
--     FROM cnpj_monitoring t LEFT JOIN "Company" c ON c.id = t.company_id
--    WHERE c.id IS NULL;
--
-- Toda linha tem de vir com orfaos = 0. Se alguma vier > 0, decida o destino
-- daquelas linhas (apagar ou reapontar) ANTES de aplicar; não relaxe a FK.
-- NEEDS AUTHORIZED LIVE EVIDENCE: esta contagem não foi corrida contra o banco
-- canônico — nenhuma sessão de auditoria abriu produção.

-- CreateIndex
-- Postgres não indexa coluna de FK sozinho. Sem estes três, cada DELETE de
-- Invoice faz seq scan nas filhas: os índices existentes têm company_id à
-- frente, não invoice_id.
CREATE INDEX "contact_fiscal_source_invoice_id_idx" ON "contact_fiscal"("source_invoice_id");

-- CreateIndex
CREATE INDEX "nfe_entry_item_invoice_id_idx" ON "nfe_entry_item"("invoice_id");

-- CreateIndex
CREATE INDEX "stock_entry_invoice_id_idx" ON "stock_entry"("invoice_id");

-- AddForeignKey
ALTER TABLE "invoice_tax_totals" ADD CONSTRAINT "invoice_tax_totals_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_tax_totals" ADD CONSTRAINT "invoice_tax_totals_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_item_tax" ADD CONSTRAINT "invoice_item_tax_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_item_tax" ADD CONSTRAINT "invoice_item_tax_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contact_fiscal" ADD CONSTRAINT "contact_fiscal_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
-- SET NULL, não CASCADE: source_invoice_id é procedência, não dono. Apagar a
-- nota que originou a ficha fiscal do contato não pode apagar a ficha.
ALTER TABLE "contact_fiscal" ADD CONSTRAINT "contact_fiscal_source_invoice_id_fkey" FOREIGN KEY ("source_invoice_id") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_duplicata" ADD CONSTRAINT "invoice_duplicata_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_duplicata" ADD CONSTRAINT "invoice_duplicata_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_registry" ADD CONSTRAINT "product_registry_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_entry" ADD CONSTRAINT "stock_entry_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_entry" ADD CONSTRAINT "stock_entry_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nfe_entry_item" ADD CONSTRAINT "nfe_entry_item_stock_entry_id_fkey" FOREIGN KEY ("stock_entry_id") REFERENCES "stock_entry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nfe_entry_item" ADD CONSTRAINT "nfe_entry_item_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nfe_entry_item" ADD CONSTRAINT "nfe_entry_item_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_settings_catalog" ADD CONSTRAINT "product_settings_catalog_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cnpj_monitoring" ADD CONSTRAINT "cnpj_monitoring_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
