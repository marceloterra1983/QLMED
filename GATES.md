# Gates: 068 DANFE layout SPICA

Scope: O app gera DANFE (HTML/PDF) no leiaute do SPICA (gabarito NF-e 65248), com Code 128C e persistência após autorização.

- [x] G1: Spec 068 com IDs de requisito
  CHECK: test -f specs/068-danfe-layout-spica/spec.md && rg -n "FR-068" specs/068-danfe-layout-spica/spec.md
  EXPECT: FR-068
  EVIDENCE: 54:- **FR-068-04**: Grade de produtos MUST ter as colunas do SPICA, inclusive | 56:- **FR-068-05**: `finalizeAuthorized` MUST tentar gravar o PDF via

- [x] G2: Code 128C da chave 44 dígitos tem 277 módulos
  CHECK: npm test -- --run src/lib/__tests__/code128.test.ts
  EXPECT: Test Files  1 passed
  EVIDENCE: Start at  16:36:38 | Duration  127ms (transform 27ms, setup 17ms, import 20ms, tests 3ms, environment 0ms)

- [x] G3: HTML do DNA 65248 contém canhoto, protocolo cru, datas ISO, colunas V.AP.TRB e barcode
  CHECK: npm test -- --run src/lib/__tests__/danfe-spica-layout.test.ts
  EXPECT: Test Files  1 passed
  EVIDENCE: Start at  16:36:38 | Duration  201ms (transform 64ms, setup 18ms, import 71ms, tests 17ms, environment 0ms)

- [x] G4: tsc --noEmit sem erro
  CHECK: npx tsc --noEmit && echo TSC_OK
  EXPECT: TSC_OK
  EVIDENCE: TSC_OK

- [x] G5: Persistência do DANFE após autorização (sem falhar a NF-e)
  CHECK: rg -n "persistAuthorizedDanfePdf" src/lib/nfe-emission/authorize.ts src/lib/nfe-emission/persist-danfe.ts src/lib/__tests__/nfe-emission-authorize-atomic.test.ts
  EXPECT: persistAuthorizedDanfePdf
  EVIDENCE: src/lib/nfe-emission/authorize.ts:7:import { persistAuthorizedDanfePdf } from './persist-danfe'; | src/lib/nfe-emission/authorize.ts:489:  await persistAuthorizedDanfePdf({

- [x] G6: Autorização atômica continua verde com o mock do DANFE
  CHECK: npm test -- --run src/lib/__tests__/nfe-emission-authorize-atomic.test.ts
  EXPECT: Test Files  1 passed
  EVIDENCE: Start at  16:36:51 | Duration  931ms (transform 182ms, setup 18ms, import 54ms, tests 774ms, environment 0ms)

- [x] G7: docs:validate aceita SPEC-068
  CHECK: npm run docs:validate
  EXPECT: Documentation validation passed
  EVIDENCE: > node ./scripts/validate-docs.mjs | Documentation validation passed (255 Markdown files, 82 IDs).

- [x] G8: PDF gerado do XML 65248 contém os mesmos textos âncora do SPICA
  CHECK: test -f /tmp/danfe-qlmed-65248.txt && rg -n "TRANSPORTE PROPRIO|VALOR DA NOTA|150260040795876|002626|Ped. Vda" /tmp/danfe-qlmed-65248.txt
  EXPECT: TRANSPORTE PROPRIO
  EVIDENCE: 45:002626      TP00971 - TRANSDUTOR DE PRESSAO C/ TORNEIRA VALVULADA                                          90183999           040    5910       UN      4,0000       120,0000          480,00        
