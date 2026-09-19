---
id: PLAN-077
status: approved
owner: QLMED
---

# Plan: SPEC-077 — paginação real das listas fiscais/financeiras

**Branch**: `feat/077-fiscal-list-pagination` | **Date**: 2026-09-19 | **Spec**: [spec.md](./spec.md)

## Constitution check

- Sem schema, sem secretos, sem DDL. Auth e `companyId` inalterados (Princípio II).
- Lógica reutilizável em `src/lib/list-pagination.ts`; rotas só validam e delegam (Princípio IV).
- Evidência: testes Vitest + `docs:validate` + `tsc` + lint. Sem pacote fora do lockfile.
- Pin Spec Kit 0.14.2 intocado.

## Summary

A API de invoices já pagina (`skip`/`take`) e já evita `COUNT` quando a página 1 vem incompleta. Os clientes fiscais forçam `page=1&limit=5000`. Financeiro tem estado `limit=50` mas envia `2000`. O menu prefetch compete com essas cargas. Este plano liga a UI ao contrato existente, expõe `includeTotal` para pular COUNT nas páginas seguintes, e desliga prefetch.

## Technical Context

**Language/Version**: TypeScript / Node 22 / Next App Router

**Primary Dependencies**: React, Zod, Prisma (já no lockfile)

**Storage**: PostgreSQL canônico (túnel); sem migration

**Testing**: Vitest + Testing Library (jsdom)

**Target Platform**: painel web QLMED (preview `:3002`, produção `app.qlmed.com.br`)

**Constraints**: page size 50–100; UI pt-BR; QLMED-UI-001 via `ListCount`

## Approach

1. `src/lib/list-pagination.ts`: `FISCAL_LIST_PAGE_SIZE = 50`, `FINANCEIRO_LIST_PAGE_SIZE = 50`, `shouldCountListTotal`, parse de `includeTotal`.
2. `GET /api/invoices`: aceitar `includeTotal`; usar o helper nos dois ramos (com/sem search). Default `includeTotal=true` (compat).
3. `ListCount`: modo paginado (intervalo + “página X de Y”) vs truncamento silencioso (cap da API, residual).
4. `ListPagination`: Anterior / Próxima reutilizável.
5. Quatro `page-client` fiscais: estado `page`/`pages`, `limit` da constante, reset à página 1 em filtro/sort/ano, `includeTotal=false` quando `page > 1`.
6. `FinanceiroPageClient`: enviar `String(limit)` (50) em vez de `'2000'`; controles de página no rodapé da tabela.
7. `SidebarNav`: `prefetch={false}` em cada `Link`.
8. Testes: helper, audit-data-display, renders, ListCount, sidebar.

## Files

- `src/lib/list-pagination.ts` (novo) + `src/lib/__tests__/list-pagination.test.ts`
- `src/app/api/invoices/route.ts`
- `src/components/ui/ListCount.tsx` + `src/components/ui/__tests__/ListCount.test.tsx`
- `src/components/ui/ListPagination.tsx` (novo)
- `src/app/(painel)/fiscal/{invoices,issued,cte,nfse-recebidas}/page-client.tsx`
- `src/app/(painel)/financeiro/components/FinanceiroPageClient.tsx`
- `src/app/(painel)/financeiro/components/FinanceiroTable.tsx`
- `src/components/SidebarNav.tsx`
- `src/lib/__tests__/audit-data-display.test.ts`
- testes de render existentes

## Complexity

Nenhuma nova lib. Rejeitado baixar o `max(5000)` da API (export/outros consumidores). Rejeitado keyset: o contrato `page` já existe. Rejeitado virtualizar (SPEC-012 / fora de escopo).

## Research

- SQL Invoice no ano é barato; o custo é serializar/renderizar milhares de linhas + prefetch.
- SPEC-070 padrão B já descreve listas paginadas no servidor para estas telas.
- Produtos (`PAGE_SIZE = 50`) é o precedente visual (Anterior/Proxima).
