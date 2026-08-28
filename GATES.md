# Gates: leftover cStat e applyNfeCancellation

Scope: Exigir cStat 135/155 no procEventoNFe, aplicar cancelamento na nota existente sem sobrescrever xmlContent, e cobrir com testes.

- [x] G1: procEventoNFe sem cStat 135/155 nao marca cancelada
  CHECK: npx vitest run src/lib/__tests__/nfe-cancellation.test.ts
  EXPECT: Test Files  1 passed
  EVIDENCE: Start at  18:45:35 | Duration  175ms (transform 50ms, setup 0ms, import 73ms, tests 10ms, environment 0ms)

- [x] G2: applyNfeCancellation so atualiza cancelledAt da nota existente
  CHECK: rg -n "xmlContent" src/lib/nfe-cancellation.ts src/lib/__tests__/nfe-cancellation.test.ts
  EXPECT: not.toHaveProperty('xmlContent')
  EVIDENCE: src/lib/__tests__/nfe-cancellation.test.ts:152:  it('marca cancelledAt na nota existente sem sobrescrever xmlContent', async () => { | src/lib/__tests__/nfe-cancellation.test.ts:162:    expect(arg.dat

- [x] G3: import-period e nsdocs usam applyNfeCancellation sem cancelledAt no upsert
  CHECK: rg -n "applyNfeCancellation|cancelledAtWrite" src/lib/sync-strategies/nsdocs.ts src/app/api/nsdocs/import-period/route.ts
  EXPECT: applyNfeCancellation
  EVIDENCE: src/lib/sync-strategies/nsdocs.ts:6:import { applyNfeCancellation } from '../nfe-cancellation'; | src/lib/sync-strategies/nsdocs.ts:122:        await applyNfeCancellation({

- [x] G4: SEFAZ aplica evento mesmo sem doc.chave
  CHECK: rg -n "applyNfeCancellation|!doc.xml|doc.tipo === .evento." src/lib/sync-strategies/sefaz.ts
  EXPECT: applyNfeCancellation
  EVIDENCE: 97:            await applyNfeCancellation({ xml: doc.xml, accessKey: doc.chave, documentType: 'NFE' }); | 105:            await applyNfeCancellation({ xml: doc.xml, accessKey: doc.chave, documentType:

- [x] G5: pagina emitidas usa cancelTag
  CHECK: rg -n "cancelTag" src/app/\(painel\)/fiscal/issued/page-client.tsx
  EXPECT: cancelTag
  EVIDENCE: 304:    const cancelTag = issuedCancelTagLabel(invoice.cancelledAt); | 311:            {cancelTag && <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-bold uppercase 

- [x] G6: suite do detector com 16 testes
  CHECK: npx vitest run src/lib/__tests__/nfe-cancellation.test.ts
  EXPECT: 16 passed
  EVIDENCE: Start at  18:45:35 | Duration  216ms (transform 65ms, setup 0ms, import 87ms, tests 24ms, environment 0ms)

- [x] G7: qualidade do worktree
  CHECK: npm test
  EXPECT: Test Files
  EVIDENCE: Start at  18:45:36 | Duration  3.18s (transform 3.67s, setup 0ms, import 7.15s, tests 4.95s, environment 4ms)

- [x] G8: tsc lint docs
  CHECK: npx tsc --noEmit && npm run lint && npm run docs:validate
  EXPECT: validation passed
  EVIDENCE: > node ./scripts/validate-docs.mjs | Documentation validation passed (96 Markdown files, 29 IDs).
