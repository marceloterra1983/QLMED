# Tasks: SPEC-047

| ID | Tarefa | Requisitos | Caminho |
|----|--------|------------|---------|
| T01 | Migration + model Prisma + pin da janela de migração | FR-001 | `prisma/`, `scripts/verify-production-migration-window.cjs` |
| T02 | Normalização e cascata puras + testes | FR-004, FR-005, AC-008 | `src/lib/nfe-item-link/{normalize,match}.ts`, `__tests__` |
| T03 | Store + sweep idempotente + lock + hook incremental | FR-002, FR-003, AC-009, AC-010 | `src/lib/nfe-item-link/{store,sweep}.ts`, `product-aggregate-updater.ts` |
| T04 | APIs (manual, pending, sweep) + testes de contrato | FR-006, AC-004, AC-006, AC-011 | `src/app/api/products/nfe-item-links/**` |
| T05 | Details com `vinculo` + history por `registryId` | AC-001, AC-012 | `src/app/api/invoices/[id]/details`, `src/app/api/products/history` |
| T06 | UI: tag, Relacionar, picker, página de pendências, atalho | AC-001..AC-007 | `NfeDetailsModal.tsx`, `ProductLinkPicker.tsx`, `cadastro/produtos/**` |
| T07 | Rotina em `/sistema/rotinas` | AC-011 | `src/lib/system-routines.ts` |
| T08 | CLI de varredura com CSV em `tmp/` | FR-008 | `scripts/nfe-item-link-sweep.ts` |
| T09 | Gates: vitest, tsc, lint, docs:validate, preview 3002, deploy, varredura em produção | SC-003 | `GATES.md` |
