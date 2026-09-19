# Quickstart: SPEC-078

1. Worktree `feat/078-ocr-http-cpu`.
2. Conferir `OCR_RASTER_DPI` e `ocrChildEnv()` em `src/lib/pdf/ocr-limits.ts`.
3. `npx vitest run src/lib/__tests__/pdf-ocr-limits.test.ts`.
4. Deploy da imagem: OCR no `qlmed-app` deixa de aparecer a ~250 % CPU.
