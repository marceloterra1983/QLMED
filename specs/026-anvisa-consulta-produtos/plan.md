# Implementation Plan: Consulta ANVISA a partir de Produtos

**Branch**: `feat/anvisa-consulta-produtos` | **Date**: 2026-08-30 | **Spec**: [spec.md](./spec.md)

## Summary

Remover `/cadastro/anvisa` de `PAGE_GROUPS` e da barra. No cabeçalho de
Produtos, link externo para a consulta oficial de Produtos para Saúde.
Remapear `/api/anvisa` para `/cadastro/produtos`.

## Technical Context

**Language/Version**: TypeScript / Next.js 15
**Primary dependencies**: Vitest, navegação existente
**Storage**: nenhum
**Testing**: `src/lib/__tests__/navigation.test.ts` e
`src/lib/__tests__/anvisa-consulta.test.ts`
**Target platform**: painel web
**Project type**: web app
**Constraints**: sem schema; sem dependência nova; UI em pt-BR

## Constitution Check

- Evidência executável: testes de ACL e da URL oficial.
- Autorização no servidor: remap de `/api/anvisa` em `navigation.ts`.
- Sem Prisma/DDL.
- Rotas de API inalteradas; só o mapa de páginas muda.
- Sem segredo novo.

## Project Structure

### Documentation (this feature)

```text
specs/026-anvisa-consulta-produtos/
├── spec.md
├── plan.md
├── tasks.md
└── checklists/requirements.md
```

### Source

```text
src/lib/navigation.ts
src/components/SidebarNav.tsx
src/lib/anvisa-consulta.ts
src/app/(painel)/cadastro/produtos/page-client.tsx
src/lib/__tests__/navigation.test.ts
src/lib/__tests__/anvisa-consulta.test.ts
```

## Complexity Tracking

Sem violação. Mudança local de navegação e um link externo.
