# Gates: tag Cancelado em NF-e Emitidas

Scope: Detectar cancelamento fiscal da NF-e, persistir e mostrar tag na lista de emitidas.

- [ ] G1: Detector reconhece evento 110111 aceito e situacao NSDocs Cancelada
  CHECK: npx vitest run src/lib/__tests__/nfe-cancellation.test.ts
  EXPECT: Test Files  1 passed
  EVIDENCE: pending

- [ ] G2: Detector ignora carta de correcao, manifestacao e XML autorizado sem evento
  CHECK: npx vitest run src/lib/__tests__/nfe-cancellation.test.ts
  EXPECT: nao cancela
  EVIDENCE: pending

- [ ] G3: Lista de emitidas devolve cancelledAt e a pagina tem a tag Cancelado
  CHECK: rg -n "Cancelado|cancelledAt" src/app/\(painel\)/fiscal/issued/page-client.tsx src/app/api/invoices/route.ts src/types/index.ts
  EXPECT: cancelledAt
  EVIDENCE: pending

- [ ] G4: Migration expand-only + janela de producao apontam para a migration nova
  CHECK: node -e "const g=require('./scripts/verify-production-migration-window.cjs'); const assert=require('node:assert/strict'); assert.match(g.EXPECTED_MIGRATION,/20260828\\d+_add_invoice_cancelled_at/); g.verifyExpectedSql(); console.log('window-ok', g.EXPECTED_MIGRATION);"
  EXPECT: window-ok
  EVIDENCE: pending

- [ ] G5: Qualidade do repo no worktree
  CHECK: npm run docs:validate && npx tsc --noEmit && npm run lint && npm test
  EXPECT: 0 errors
  EVIDENCE: pending
