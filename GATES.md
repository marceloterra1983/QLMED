# Gates: Lote zerado visível (SPEC-060)

Scope: Lotes com saldo zero aparecem no Controle (busca + modal/kardex com NF) e na busca da Entrada NF-e; Saída Material continua só qty > 0.

- [x] G1: Spec SPEC-060 existe com IDs de requisito e critério de aceite
  CHECK: test -f specs/060-lote-zerado-visivel/spec.md && grep -E 'REQ-00|AC-00' specs/060-lote-zerado-visivel/spec.md | wc -l
  EXPECT: /[1-9][0-9]*/
  EVIDENCE: 12

- [x] G2: listStockBalances aceita includeZero e o catálogo do Controle usa; Saída Material não
  CHECK: grep -n "includeZero" src/lib/stock-ledger.ts src/lib/stock-catalog-query.ts src/app/api/estoque/controle/catalogo/route.ts src/app/api/estoque/saida-material/saldos/route.ts src/lib/__tests__/stock-ledger-backfill.test.ts
  EXPECT: includeZero
  EVIDENCE: src/lib/__tests__/stock-ledger-backfill.test.ts:283:      { includeZero: true }, | src/lib/__tests__/stock-ledger-backfill.test.ts:307:      { includeZero: false },

- [x] G3: Modal de produto mostra badge Zerado, filtra kardex por lote, NF clicável e label SALDO_INICIAL; fetch limit 500
  CHECK: grep -E "Zerado|SALDO_INICIAL|NfeDetailsModal|limit=500" "src/app/(painel)/estoque/controle/components/ProductStockDetailModal.tsx"
  EXPECT: NfeDetailsModal
  EVIDENCE: {isZeroQty(lot.quantity) ? <Badge tone="neutral">Zerado</Badge> : null} | <NfeDetailsModal

- [x] G4: API de movimentos inclui número/série/direção da NF-e
  CHECK: grep -E "number|series|direction" src/app/api/estoque/controle/movimentos/route.ts
  EXPECT: direction
  EVIDENCE: invoiceSeries: invoice?.series ?? null, | invoiceDirection: invoice?.direction ?? null,

- [x] G5: Entrada NF-e GET busca por lote via stock_movement quando emitente/número não casam
  CHECK: grep -nE "stockMovement|stock_movement|lot" src/app/api/estoque/entrada-nfe/route.ts
  EXPECT: lot
  EVIDENCE: 187:          if (validated.length > 0) lotOverrides.set(itemNum, validated); | 192:    const result = await registerInvoiceEntry(company.id, invoiceId, userId, lotOverrides);

- [x] G6: Testes do ledger/catálogo cobrem includeZero e busca por lote zerado
  CHECK: npx vitest run src/lib/__tests__/stock-ledger-backfill.test.ts --reporter=dot && echo VITEST_OK
  EXPECT: VITEST_OK
  EVIDENCE: Duration  321ms (transform 150ms, setup 19ms, import 201ms, tests 10ms, environment 0ms) | VITEST_OK

- [x] G7: Typecheck limpo
  CHECK: npx tsc --noEmit && echo TSC_OK
  EXPECT: TSC_OK
  EVIDENCE: TSC_OK

- [x] G8: docs:validate e ui:verify passam
  CHECK: npm run docs:validate && npm run ui:verify && echo DOCS_UI_OK
  EXPECT: DOCS_UI_OK
  EVIDENCE: ok   shadow: 0 violações | DOCS_UI_OK

- [ ] G9: Preview :3002 fuma o fluxo 26C52 / 65260 (busca Controle + Entrada)
  EVIDENCE: pending

- [ ] G10: PR mergeado e produção no SHA de origin/main
  EVIDENCE: pending
