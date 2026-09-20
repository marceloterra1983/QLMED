# Gates: SPEC-078 OCR não monopoliza CPU do Next

Scope: Raster/OCR de PDF no qlmed-app usa 1 thread OpenMP e DPI 200, para o HTTP do painel não competir com tesseract/pdftoppm.

- [x] G1: Spec Kit 078 existe (spec + plan + tasks)
  CHECK: test -f specs/078-ocr-http-cpu/spec.md && test -f specs/078-ocr-http-cpu/plan.md && test -f specs/078-ocr-http-cpu/tasks.md && rg -q 'SPEC-078' specs/078-ocr-http-cpu/spec.md && echo SPEC078_OK
  EXPECT: SPEC078_OK
  EVIDENCE: SPEC078_OK

- [x] G2: pdftoppm usa OCR_RASTER_DPI (não 300 hardcoded)
  CHECK: rg -n "OCR_RASTER_DPI" src/lib/pdf/extract-text.ts src/lib/pdf/ocr-limits.ts && ! rg -n "'-r', '300'" src/lib/pdf/extract-text.ts && echo DPI_OK
  EXPECT: DPI_OK
  EVIDENCE: extract-text.ts pdftoppm String(OCR_RASTER_DPI) | DPI_OK

- [x] G3: spawns de OCR passam OMP_THREAD_LIMIT=1
  CHECK: rg -n "OMP_THREAD_LIMIT|ocrChildEnv" src/lib/pdf/extract-text.ts src/lib/pdf/ocr-limits.ts && echo OMP_OK
  EXPECT: OMP_OK
  EVIDENCE: ocrChildEnv() sets OMP_THREAD_LIMIT | OMP_OK

- [x] G4: testes FILE-003 / extract-text passam
  CHECK: npx vitest run src/lib/__tests__/pdf-ocr-limits.test.ts src/lib/__tests__/pdf-extract-text.test.ts --reporter=dot
  EXPECT: Tests  29 passed
  EVIDENCE: Test Files 2 passed; Tests 29 passed (29)

- [x] G5: docs:validate + tsc + lint do recorte
  CHECK: npm run docs:validate && npx tsc --noEmit && npm run lint
  EXPECT: Documentation validation passed
  EVIDENCE: Documentation validation passed (288 Markdown files, 96 IDs); tsc clean; lint 0 errors
