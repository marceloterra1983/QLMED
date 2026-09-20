---
id: PLAN-078
status: approved
owner: QLMED
---

# Plan: SPEC-078 — OCR não monopoliza CPU do Next

**Branch**: `feat/078-ocr-http-cpu` | **Date**: 2026-09-19 | **Spec**: [spec.md](./spec.md)

## Constitution check

- Sem schema, sem secretos, sem DDL. Auth e isolamento inalterados (II).
- Um motor em `src/lib/pdf/extract-text.ts`; adaptadores IMPCG/CASSEMS só
  delegam (IV).
- Evidência: Vitest FILE-003 + `docs:validate` + `tsc` + lint.
- Pin Spec Kit intocado. Sem pacote fora do lockfile.

## Summary

O FILE-003 já capou páginas/bytes/orçamento, mas `pdftoppm -r 300` e Tesseract
OpenMP ainda saturam o `qlmed-app`. Constantes `OCR_RASTER_DPI=200` e
`ocrChildEnv()` com `OMP_THREAD_LIMIT=1` em todo `execFile` do motor.

## Technical Context

**Language/Version**: TypeScript / Node 22

**Primary Dependencies**: `node:child_process` execFile (já no motor)

**Storage**: N/A (temp em `/tmp`, já limpo)

**Testing**: Vitest com mock de `execFile` promisify (padrão FILE-003)

**Target Platform**: container `qlmed-app` (Alpine) na vps2

**Constraints**: 1 thread OpenMP; DPI 200; tetos FILE-003 intactos

## Approach

1. `ocr-limits.ts`: `OCR_RASTER_DPI`, `OCR_OMP_THREAD_LIMIT`, `ocrChildEnv()`.
2. `extract-text.ts` `run()`: passar `env: ocrChildEnv()`; `pdftoppm` usa a constante.
3. Testes: DPI e `OMP_THREAD_LIMIT` no terceiro argumento do mock.

## Files

- `src/lib/pdf/ocr-limits.ts`
- `src/lib/pdf/extract-text.ts`
- `src/lib/__tests__/pdf-ocr-limits.test.ts`

## Complexity

Rejeitado worker separado (maior que este recorte). Rejeitado bcrypt nativo
(dependência nova). Rejeitado `nice` (follow-up). Rejeitado DPI 150 (mais
agressivo na qualidade).
