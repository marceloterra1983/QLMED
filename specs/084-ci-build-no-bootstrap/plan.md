---
id: PLAN-084
status: approved
owner: QLMED
---

# Plan: SPEC-084 — sem bootstrap no next build

## Constitution check

- Sem schema (I). CI e bootstrap já existentes (IV).
- Evidência: teste de contrato + supervisor existente (I).
- Isolamento inalterado (II).

## Approach

1. **Guard no prisma.ts.** Next 15 seta `NEXT_PHASE=phase-production-build`
   durante todo o `next build` (incluindo Collecting page data).
2. **Env no job app.** `QLMED_DISABLE_BACKGROUND_SERVICES=true` no
   workflow, alinhado ao preview e ao compose de CI local.

## Files

- `src/lib/prisma.ts`
- `.github/workflows/ci.yml`
- `src/lib/__tests__/prisma-no-bootstrap-on-build.test.ts`
