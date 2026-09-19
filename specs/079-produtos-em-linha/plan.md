---
id: PLAN-079
status: approved
owner: QLMED
---

# Plan: SPEC-079 — produtos abrem Em Linha

**Branch**: `feat/079-produtos-em-linha` | **Date**: 2026-09-19 | **Spec**: [spec.md](./spec.md)

## Constitution check

- Sem schema, sem secretos. Auth inalterada (II).
- Default na UI; API permanece `default('all')` (consumidores existentes).
- Evidência: Vitest de contrato + `docs:validate` + tsc + lint.

## Approach

1. `DEFAULT_PRODUCT_LINE_STATUS = 'active'` em `product-utils.ts`.
2. `page-client.tsx`: `useState(DEFAULT_PRODUCT_LINE_STATUS)`;
   `serverLineStatus = lineStatusFilter`; `treeFilterActive` sem o default
   de status.
3. Atualizar contrato que exigia `'all'`.

## Files

- `src/app/(painel)/cadastro/produtos/components/product-utils.ts`
- `src/app/(painel)/cadastro/produtos/page-client.tsx`
- `src/lib/__tests__/produtos-groups-expanded-contract.test.ts`
- `src/app/(painel)/cadastro/produtos/components/__tests__/product-filters.test.ts`
