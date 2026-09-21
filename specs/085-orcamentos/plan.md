# Implementation Plan: Orçamentos comerciais

**Branch**: `feat/085-orcamentos` | **Date**: 2026-09-21 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/085-orcamentos/spec.md`

## Summary

Página `/orcamentos` no topo do sidebar (acima de Documentos) para criar, listar, reimprimir e cancelar orçamentos comerciais. Itens e cliente saem do acervo QLMED; o PDF replica o layout SPICA H020 paisagem via `renderHtmlToPdf`. Persistência Prisma `Quote`/`QuoteItem` com Decimal e número sequencial por empresa.

## Technical Context

**Language/Version**: TypeScript 5 / Node 22 / Next.js App Router (já no repo)

**Primary Dependencies**: Prisma, Zod, NextAuth, puppeteer-core (`renderHtmlToPdf`), Vitest — **nenhuma dependência nova**

**Storage**: PostgreSQL canônico; migração expand-only `20260921120000_quote`

**Testing**: Vitest unitário (totais, HTML PDF, ACL, sidebar, página); `tsc`; `docs:validate`; pin de migração

**Target Platform**: painel web QLMED (dev `:3000`, preview `:3002`, prod `:13000`)

**Project Type**: web application (painel)

**Performance Goals**: listagem 50 linhas; busca 20 hits; PDF < 30s (teto já existente)

**Constraints**: isolamento de empresa; Decimal para dinheiro; default-deny ACL; HTML de PDF sem JS/rede

**Scale/Scope**: uma empresa, dezenas de orçamentos/dia, catálogo de produtos já indexado

## Constitution Check

- Evidence: testes de totais, PDF HTML, ACL e sidebar **antes** de declarar pronto.
- Auth/isolation: `requireAuth`/`requireEditor` + `getOrCreateSingleCompany`; 404 cross-company.
- Prisma migration owns schema; pin no portão de produção.
- Rotas finas; domínio em `src/lib/orcamentos/*`.
- Segredos: PDF não loga payload completo além de id/número.
- Uma fonte: spec aqui; ADR existentes só ligados, não copiados.

Nenhuma exceção de complexidade. Alternativa mais simples (PDF só via `window.print` sem persistir) rejeitada: o dono precisa de número, reimpressão e arquivo.

## Project Structure

```text
specs/085-orcamentos/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/api.md
└── tasks.md

src/lib/orcamentos/          # totais, número, store, snapshot, pdf-html, issuer
src/lib/schemas/orcamentos.ts
src/app/api/orcamentos/      # list/create, [id], pdf, duplicar, clientes, produtos
src/app/(painel)/orcamentos/ # lista, novo, [id], editor partilhado
```

## Phase 0 / 1 artifacts

Ver `research.md`, `data-model.md`, `contracts/api.md`, `quickstart.md`.

## Complexity Tracking

Nenhuma. Reusa navegação, money, PDF renderer, Field/Button/PageHeader.
