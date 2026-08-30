# Gates: emissão manual NF-e com envio SEFAZ

Scope: Página de emissão com todas as operações de saída, destinatário só cliente PJ cadastrado, e envio à SEFAZ na primeira entrega.

- [x] G1: SPEC-025 descreve todas as saídas, PJ cadastrado e envio SEFAZ
  CHECK: rg -q "FR-001" specs/025-emissao-nota-fiscal/spec.md && rg -q "cliente PJ" specs/025-emissao-nota-fiscal/spec.md && rg -q "SEFAZ" specs/025-emissao-nota-fiscal/spec.md && echo SPEC-025
  EXPECT: SPEC-025
  EVIDENCE: SPEC-025

- [x] G2: Testes de chave, XML, destinatário PJ e CFOP de saída passam
  CHECK: npx vitest run src/lib/__tests__/nfe-emission-access-key.test.ts src/lib/__tests__/nfe-emission-xml.test.ts src/lib/__tests__/nfe-emission-authorize.test.ts src/lib/__tests__/nfe-emission-operations.test.ts
  EXPECT: Test Files  4 passed
  EVIDENCE: Start at  17:48:29 | Duration  208ms (transform 141ms, setup 0ms, import 253ms, tests 41ms, environment 1ms)

- [x] G3: Typecheck
  CHECK: npx tsc --noEmit
  EXPECT: /.*/
  EVIDENCE: (no output)

- [x] G4: Lint
  CHECK: npm run lint
  EXPECT: /.*/
  EVIDENCE: > qlmed@0.1.0 lint | > eslint .

- [x] G5: Página /fiscal/issued/nova e rota de autorização existem
  CHECK: test -f src/app/\(painel\)/fiscal/issued/nova/page-client.tsx && test -f src/app/api/nfe-emissions/\[id\]/authorize/route.ts && echo routes-ok
  EXPECT: routes-ok
  EVIDENCE: routes-ok

- [x] G6: docs:validate
  CHECK: npm run docs:validate
  EXPECT: /valid|ok|passed|0 error/i
  EVIDENCE: > node ./scripts/validate-docs.mjs | Documentation validation passed (130 Markdown files, 34 IDs).
