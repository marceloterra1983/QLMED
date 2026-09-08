# Gates: OC Unimed CG — GTPlan

Scope: ingerir confirmações `no-reply@gtplan.net` no card ORDEM DE COMPRA junto com o SOULMV.

- [x] G1: parser GTPlan 186184 extrai OC, CNPJ faturar, prazo, item, qtd, unitário e total
  CHECK: npx vitest run src/lib/__tests__/unimed-cg-ordem-compra-parse.test.ts -t "186184" --reporter=dot
  EXPECT: Test Files  1 passed
  EVIDENCE: Start at  17:46:33 | Duration  138ms (transform 39ms, setup 17ms, import 35ms, tests 4ms, environment 0ms)

- [x] G2: ingestão persiste confirmação GTPlan e ignora assunto sem OC
  CHECK: npx vitest run src/lib/__tests__/unimed-cg-ordem-compra-ingest.test.ts --reporter=dot
  EXPECT: Test Files  1 passed
  EVIDENCE: Start at  17:46:34 | Duration  506ms (transform 253ms, setup 17ms, import 23ms, tests 388ms, environment 0ms)

- [x] G3: listing usa SOULMV + `no-reply@gtplan.net`
  CHECK: rg -n "UNIMED_CG_ORDEM_COMPRA_SENDERS|no-reply@gtplan.net" src/lib/unimed-cg/ingest.ts src/lib/unimed-cg/constants.ts
  EXPECT: no-reply@gtplan.net
  EVIDENCE: src/lib/unimed-cg/ingest.ts:32:  UNIMED_CG_ORDEM_COMPRA_SENDERS, | src/lib/unimed-cg/ingest.ts:389:  for (const sender of UNIMED_CG_ORDEM_COMPRA_SENDERS) {

- [x] G4: `npx tsc --noEmit`
  CHECK: npx tsc --noEmit && echo TSC_OK
  EXPECT: TSC_OK
  EVIDENCE: TSC_OK

- [x] G5: fixture SOULMV 188246 continua verde
  CHECK: npx vitest run src/lib/__tests__/unimed-cg-ordem-compra-parse.test.ts -t "188246" --reporter=dot
  EXPECT: Test Files  1 passed
  EVIDENCE: Start at  17:46:37 | Duration  159ms (transform 53ms, setup 20ms, import 47ms, tests 4ms, environment 0ms)
