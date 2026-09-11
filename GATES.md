# Gates: Cartas — OCR + e-mail antigo + vencidas

Scope: PDFs escaneados (GABMED/MACON/OSTEOMED) ganham datas via OCR;
MACON «um ano»; varredura de e-mail mais ampla para cartas antigas.

- [x] G1: OCR fallback preenche GABMED/OSTEOMED vencidas
  CHECK: npx vitest run src/lib/__tests__/documentos-pdf-validity.test.ts -t "OCR|Um ano|GABMED|MACOM|LIVA" 2>&1 | tail -25
  EXPECT: /passed/
  EVIDENCE: Start at  10:18:11 | Duration  178ms (transform 65ms, setup 21ms, import 60ms, tests 6ms, environment 0ms)

- [x] G2: extractPdfPlainText com ocrFallback
  CHECK: npx vitest run src/lib/__tests__/documentos-pdf-ocr-fallback.test.ts 2>&1 | tail -25
  EXPECT: /passed/
  EVIDENCE: Start at  10:18:12 | Duration  170ms (transform 60ms, setup 25ms, import 51ms, tests 2ms, environment 0ms)

- [x] G3: busca e-mail ampliada (credenciamento + maxPages)
  CHECK: npx vitest run src/lib/__tests__/documentos-carta-mail.test.ts -t "CARTA_MAIL|credenciamento|maxPages" 2>&1 | tail -20
  EXPECT: /passed/
  EVIDENCE: Start at  10:18:13 | Duration  383ms (transform 212ms, setup 19ms, import 271ms, tests 2ms, environment 0ms)

- [x] G4: tsc limpo
  CHECK: npx tsc --noEmit --pretty false; echo TSC_OK
  EXPECT: TSC_OK
  EVIDENCE: TSC_OK
