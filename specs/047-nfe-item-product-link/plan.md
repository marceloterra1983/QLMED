# Technical Plan: Vínculo de itens de NF-e recebida ao produto Spica

Spec: [spec.md](./spec.md). Constituição 1.0.2 verificada: evidência
executável (I), autorização no servidor (II), migration Prisma (III), rotas
adaptam / `src/lib` implementa (IV), sem XML em log (V), Spec Kit única fonte (VI).

## Decisões de modelagem

1. **Tabela própria `nfe_item_product_link`, não coluna em `nfe_entry_item`.**
   `nfe_entry_item` pertence ao fluxo de entrada de estoque (`stock_entry`),
   vazio em produção e com ciclo de vida próprio (registro manual de entrada).
   O vínculo item→produto é um facto derivado do XML e existe para toda nota
   recebida, com ou sem entrada de estoque. `invoice_item_tax` é recriada a
   cada re-ingestão (ids voláteis), por isso a chave é
   `(company_id, invoice_id, item_number)` e não FK para ela.
2. **Memória S6 na mesma tabela** (FR-003). Uma linha MANUAL para
   `(supplier_cnpj, supplier_code_norm)` ensina o sistema; não há tabela
   `supplier_product_map` a manter em sincronia.
3. **Cascata pura em `src/lib/nfe-item-link/match.ts`** (sem I/O), índice do
   catálogo em memória (7965 linhas), trigram calculado em JS com a semântica
   do `pg_trgm` para a S5 ficar testável em vitest sem banco.
4. **Ponto de entrada incremental** em `updateProductAggregatesForInvoice`
   (direction `received`), o mesmo funil por onde passam SEFAZ, NSDocs, upload
   e XML local. Falha contida em try/catch com log.

## Arquivos

- `prisma/schema.prisma` — model `NfeItemProductLink` + relações.
- `prisma/migrations/20260905220000_nfe_item_product_link/migration.sql`.
- `scripts/verify-production-migration-window.cjs` e
  `scripts/test-production-migration-window.cjs` — pin da migration.
- `src/lib/nfe-item-link/normalize.ts` — normalização de código, EAN, descrição, trigram.
- `src/lib/nfe-item-link/match.ts` — índice do catálogo + cascata.
- `src/lib/nfe-item-link/store.ts` — upsert de vínculos, memória S6, vínculo manual, pendências.
- `src/lib/nfe-item-link/sweep.ts` — varredura idempotente (lock, paginação, stats).
- `src/lib/postgres-advisory-lock.ts` — `nfeItemLinkLockKey`.
- `src/lib/product-aggregate-updater.ts` — chamada incremental.
- `src/lib/system-routines.ts` — rotina `nfe-item-product-link`.
- `src/app/api/products/nfe-item-links/route.ts` — `POST` vínculo manual.
- `src/app/api/products/nfe-item-links/pending/route.ts` — `GET` grupos pendentes.
- `src/app/api/products/nfe-item-links/sweep/route.ts` — `POST` varredura (admin).
- `src/app/api/invoices/[id]/details/route.ts` — `vinculo` por item.
- `src/app/api/products/history/route.ts` — `registryId` usa o vínculo.
- `src/components/NfeDetailsModal.tsx` — tag + "Relacionar".
- `src/components/produtos/ProductLinkPicker.tsx` — seletor de produto.
- `src/app/(painel)/cadastro/produtos/vinculos-nfe/` — página de pendências.
- `src/app/(painel)/cadastro/produtos/page-client.tsx` — atalho com contagem.
- `scripts/nfe-item-link-sweep.ts` — CLI (`npx tsx`) com CSV em `tmp/`.

## Complexity Tracking

Nenhuma exceção à constituição.
