# Tasks: OCR não monopoliza CPU do Next

**Input**: [spec.md](./spec.md), [plan.md](./plan.md)

## Phase 1: Setup

- [x] T001 Worktree `feat/078-ocr-http-cpu` em `/home/marce/qlmed/.worktrees/078-ocr-http-cpu`
- [x] T002 Spec Kit 078: spec, plan, tasks, checklist

## Phase 2: Foundational

- [x] T003 Constantes `OCR_RASTER_DPI` / `ocrChildEnv` em `src/lib/pdf/ocr-limits.ts`
- [x] T004 `run()` em `src/lib/pdf/extract-text.ts` herda env e DPI

## Phase 3: US1/US2 testes

- [x] T005 [US1][US2] `pdf-ocr-limits.test.ts` cobre OMP e `-r` 200 (AC-078-001..003)

## Phase 4: Verify

- [x] T006 `npx vitest run` dos testes PDF; `docs:validate` 288 files / 96 IDs; `tsc`; lint 0 errors; `npm test` 2452 passed / 9 skipped
- [x] T007 `graphify update .` neste worktree
