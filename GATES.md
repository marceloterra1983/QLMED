# Gates: OCR seletivo no e-mail de cartas

- [x] G1: carta-mail testes
  CHECK: npx vitest run src/lib/__tests__/documentos-carta-mail.test.ts 2>&1 | tail -20
  EXPECT: /passed/
  EVIDENCE: Start at  10:32:57 | Duration  1.96s (transform 1.02s, setup 21ms, import 242ms, tests 1.59s, environment 0ms)

- [x] G2: tsc
  CHECK: npx tsc --noEmit --pretty false; echo TSC_OK
  EXPECT: TSC_OK
  EVIDENCE: TSC_OK
