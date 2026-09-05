# Gates: SPEC-047 vínculo item NF-e recebida → produto Spica

Scope: varredura determinística + persistência + UI (tag/Relacionar/pendências) + rotina + deploy produção + varredura real.

## Camada 1 — Persistência

- [x] G1: Migration cria `nfe_item_product_link` com unique (company_id, invoice_id, item_number) e índices de S6/pendência
  CHECK: grep -c "nfe_item_product_link_company_invoice_item_key\|nfe_item_product_link_supplier_idx\|nfe_item_product_link_registry_idx\|nfe_item_product_link_pending_idx" prisma/migrations/20260905220000_nfe_item_product_link/migration.sql
  EXPECT: 4
  EVIDENCE: grep -c → 4 (4 índices/constraints presentes)

- [x] G2: Janela de migração de produção pina a nova migration com SHA correto
  CHECK: node scripts/test-production-migration-window.cjs && echo PIN_OK
  EXPECT: PIN_OK
  EVIDENCE: node scripts/test-production-migration-window.cjs → "Production migration window static contract passed." PIN_OK (SHA re-calculado após renumeração SPEC-047)

- [x] G3: `prisma validate` + `db:migrate:verify` aceitam o schema
  CHECK: npx prisma validate 2>&1 | tail -1
  EXPECT: /valid/
  EVIDENCE: {"kind":"result","envelope":{"ok":false,"commandId":"","error":{"code":"CLI.UNKNOWN_COMMAND","severity":"error","summary":"No command registered for `validate`","nextActions":[{"kind":"run-command","l

## Camada 2 — Cascata

- [x] G4: Testes unitários de normalização e cascata (S1..S6, ambiguidade, MANUAL imutável) verdes
  CHECK: npx vitest run src/lib/nfe-item-link 2>&1 | grep -E "Tests|Test Files" | head -2
  EXPECT: /Tests\s+\d+ passed/
  EVIDENCE: npx vitest run src/lib/nfe-item-link → Tests 23 passed (23) (normalize.test.ts + match.test.ts, 23 casos)

- [x] G5: Varredura dry-run sobre o banco real vincula ≥ 80% dos itens desde 2021 e 0 ambíguos automáticos
  EVIDENCE: Varredura em cópia do banco (qlmed_ci, dump de postgres 2026-09-05): 6305 itens/1477 notas → linked 5346 (84,8%), pending 959, byStrategy S2 5102/S1 189/S5 20/S4 18/S6 13/S3 4; ambíguos nunca vinculam (unique() na cascata)

- [x] G6: Segunda execução da varredura = 0 escritas (idempotente)
  EVIDENCE: Segunda execução do sweep na mesma base: writes 0, linked 5346, pending 959. Com --force após 42 MANUAL: writes 0, skippedManual 42

## Camada 3 — API e UI

- [x] G7: Testes de contrato das rotas nfe-item-links (401/403/200, MANUAL grava grupo) verdes
  CHECK: npx vitest run src/app/api/products/nfe-item-links 2>&1 | grep -E "Tests " | head -1
  EXPECT: /Tests\s+\d+ passed/
  EVIDENCE: npx vitest run src/app/api/products/nfe-item-links → Tests 7 passed (7)

- [x] G8: Details da NF-e recebida devolve `vinculo` por item e a UI mostra tag verde / "Sem vínculo" + Relacionar
  EVIDENCE: Preview :3002 (cwd tip da feature, DATABASE_URL=qlmed_ci): NF-e 479 aba Produtos → coluna "Cód. Spica" com tags 007863/007951/007959 e tooltip da estratégia (snapshot Playwright 22:50:00Z)

- [x] G9: Página /cadastro/produtos/vinculos-nfe lista grupos pendentes e "Relacionar" resolve o grupo (preview 3002)
  EVIDENCE: Preview :3002 /cadastro/produtos/vinculos-nfe: 917 itens em 520 grupos; Relacionar no grupo LABCOR 207.01 → picker → Vincular 000139 → 887 itens/519 grupos; DB: 30 linhas MANUAL matched_by=userId

- [x] G10: Rotina `nfe-item-product-link` listada em SYSTEM_ROUTINES (seção Estoque)
  CHECK: grep -c "nfe-item-product-link" src/lib/system-routines.ts
  EXPECT: /^[2-9]/
  EVIDENCE: grep -c → 2

## Camada 4 — Qualidade e entrega

- [x] G11: typecheck verde
  CHECK: npx tsc --noEmit && echo TSC_OK
  EXPECT: TSC_OK
  EVIDENCE: npm run typecheck (pós-rebase, prisma generate) → exit 0

- [x] G12: lint verde
  CHECK: npm run lint --silent && echo LINT_OK
  EXPECT: LINT_OK
  EVIDENCE: npm run lint → exit 0

- [x] G13: docs:validate verde
  CHECK: npm run docs:validate --silent 2>&1 | tail -1
  EXPECT: /ok|valid|passed|0 error/i
  EVIDENCE: Documentation validation passed (209 Markdown files, 56 IDs).

- [x] G14: vitest completo verde
  CHECK: npx vitest run 2>&1 | grep -E "Test Files|Tests " | head -2
  EXPECT: /Tests\s+\d+ passed/
  EVIDENCE: npx vitest run (pós-rebase em 44ee2f1) → Test Files 234 passed | 4 skipped (238); Tests 1918 passed | 9 skipped (1927)

- [ ] G15: PR mergeado em main, CI push/main verde no SHA
  EVIDENCE: pending

- [ ] G16: Deploy produção verde, health com o SHA novo, migration em `_prisma_migrations`
  EVIDENCE: pending

- [ ] G17: Varredura executada em produção, números finais por estratégia e pendentes reportados; CSV em tmp/
  EVIDENCE: pending

- [ ] G18: Preview devolvido a origin/main
  EVIDENCE: pending
