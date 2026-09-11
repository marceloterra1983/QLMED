# Gates: filtrar lixo em cartas + lápis de datas

- [x] G1: filtro rejeita alvará/credenciamento com assunto de carta
  CHECK: npx vitest run src/lib/__tests__/documentos-carta-mail.test.ts src/lib/__tests__/documentos-classify.test.ts -t "carta|CARTA|alvara|credenciamento|assunto" 2>&1 | tail -30
  EXPECT: /passed/
  EVIDENCE: Start at  11:38:00 | Duration  2.15s (transform 1.14s, setup 45ms, import 364ms, tests 1.74s, environment 0ms)

- [x] G2: lápis de validade na tabela
  CHECK: npx vitest run src/components/__tests__/documentos-page.test.tsx src/components/__tests__/documentos-family-table.test.tsx -t "Editar validade|lápis|Assinatura" 2>&1 | tail -35
  EXPECT: /passed/
  EVIDENCE: Start at  11:38:03 | Duration  1.90s (transform 484ms, setup 41ms, import 773ms, tests 1.25s, environment 698ms)

- [x] G3: tsc
  CHECK: npx tsc --noEmit --pretty false; echo TSC_OK
  EXPECT: TSC_OK
  EVIDENCE: TSC_OK
