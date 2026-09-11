# Gates: Cartas — filtrar NF-e e ler emissão/validade no PDF

Scope: não importar/mostrar notas fiscais como carta; extrair emissão e
validade dos PDFs reais (prazo em meses + data por extenso sem «de»).

- [x] G1: NF DOC / DANFE rejeitados por nome ou texto do PDF
  CHECK: npx vitest run src/lib/__tests__/documentos-carta-mail.test.ts -t "NF|DANFE|nota" 2>&1 | tail -15
  EXPECT: /passed/
  EVIDENCE: {"level":30,"time":1789127794746,"pid":529397,"hostname":"server","module":"background-supervisor","service":"daily-issued-summary","msg":"Timer de background cancelado"} | {"level":30,"time":17891277

- [x] G2: TECHIMPORT real — emissão 2022-04-01 e validade +12 meses
  CHECK: npx vitest run src/lib/__tests__/documentos-pdf-validity.test.ts -t "TECHIMPORT|periodo de 12|abril 2022" 2>&1 | tail -20
  EXPECT: /passed/
  EVIDENCE: Start at  08:56:35 | Duration  186ms (transform 75ms, setup 17ms, import 73ms, tests 3ms, environment 0ms)

- [x] G3: ingestão OneDrive salta NF e não a mantém como carta
  CHECK: npx vitest run src/lib/__tests__/documentos-ingest.test.ts -t "carta.*NF|salta nota fiscal" 2>&1 | tail -20
  EXPECT: /passed/
  EVIDENCE: Start at  08:56:36 | Duration  275ms (transform 140ms, setup 15ms, import 80ms, tests 88ms, environment 0ms)

- [x] G4: tsc limpo
  CHECK: npx tsc --noEmit --pretty false; echo TSC_OK
  EXPECT: TSC_OK
  EVIDENCE: TSC_OK
