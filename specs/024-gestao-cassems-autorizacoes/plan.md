# Implementation Plan: Autorizações CASSEMS em Gestão

**Branch**: `feat/gestao-cassems-autorizacoes` | **Date**: 2026-08-30 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/024-gestao-cassems-autorizacoes/spec.md`

## Summary

Grupo **Gestão** com página **CASSEMS**. Espelho operacional da
SPEC-023: worker in-process lê a caixa `joseroberto@qlmed.com.br`
via Graph app-only (RBAC recortado), grava o PDF na pasta CASSEMS
já existente no OneDrive (`1 - DOCUMENTOS/0 - AUTORIZACOES/CASSEMS`),
extrai o ofício OPME (texto ou OCR) e faz upsert por número de
autorização. A primeira linha vem da varredura da pasta (PDF
modelo já está lá). A lista lê o banco; o popup reusa `Modal` +
`useModalBackButton`. Sem pacote npm novo. Sem editar
`src/lib/impcg/*`.

## Technical Context

**Language/Version**: TypeScript / Next.js 15 / Node 22

**Primary Dependencies**: Prisma 7, Zod, Vitest, Graph REST (fetch),
`@prisma/client-runtime-utils` Decimal (`src/lib/money.ts`). OCR via
binários da imagem (já na SPEC-023).

**Storage**: PostgreSQL canônico. Modelos `CassemsAuthorization`,
`CassemsAuthorizationItem`, `CassemsSourceMessage`,
`CassemsIngestState`. Arquivo canônico no OneDrive. Migration
expand-only + janela de produção.

**Testing**: Vitest — parser da fixture 2479325231, dedup
(Message-ID e nº), ACL 403, upload falhou ⇒ sem upsert, folder
scan do modelo ⇒ 1 linha.

**Target Platform**: painel web + worker no processo `qlmed-app`.
Dev com `QLMED_DISABLE_BACKGROUND_SERVICES=true` usa
“Atualizar agora”.

**Project Type**: aplicação web Next.js (rotas + `src/lib`)

**Performance Goals**: lista < 30s para o operador (SC-001). Coleta
com timeout por caixa (`AbortSignal`, 30s).

**Constraints**: isolamento por `getOrCreateSingleCompany`; sem
`companyId` no pedido; dinheiro via Decimal (nunca float); sem
token, e-mail completo ou payload clínico em log; sem `Mail.Read`
org-wide; sem confirmar linha se o upload OneDrive falhar; não
editar `src/lib/impcg/*`.

**Scale/Scope**: uma empresa, uma caixa, um cliente (CASSEMS), uma
página. Volume: dezenas a poucas centenas de ofícios.

**ADRs**: [ADR-0001](../../docs/decisions/0001-single-company-isolation.md),
[ADR-0007](../../docs/decisions/0007-single-canonical-database.md),
[ADR-0008](../../docs/decisions/0008-sync-advisory-lock.md).
Sem ADR novo.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- Evidência: testes do parser, dedup, ACL, upload gate e folder
  scan (I).
- Papéis e `allowedPages` no servidor; menu não autoriza (II).
- Migration Prisma versionada + `verify-production-migration-window`
  e o assert em `test-production-migration-window.cjs` (III).
- Graph, upload, parse e upsert em `src/lib/cassems`; rotas
  autenticam e delegam (IV).
- Logs sem secret, Message-ID completo ou itens/valores (V).
- SPEC-024, GSD off (VI).

**Pós-design**: sem violação. Helper mail parametrizado em
`graph-mail-client.ts` (mecânico). Advisory lock reusa ADR-0008.

## Project Structure

### Documentation (this feature)

```text
specs/024-gestao-cassems-autorizacoes/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── api-gestao-cassems.md
└── tasks.md
```

### Source Code

```text
src/lib/navigation.ts
src/components/SidebarNav.tsx
src/lib/graph-mail-client.ts          # + listMailboxMessagesBySender
src/lib/cassems/constants.ts
src/lib/cassems/parse-oficio.ts
src/lib/cassems/extract-pdf-text.ts
src/lib/cassems/folder-ingest.ts
src/lib/cassems/ingest.ts
src/lib/cassems/store.ts
src/lib/__tests__/cassems-*.test.ts
src/lib/bootstrap.ts
src/lib/background-service-health.ts
src/lib/postgres-advisory-lock.ts
src/app/(painel)/gestao/cassems/page.tsx
src/app/(painel)/gestao/cassems/page-client.tsx
src/app/api/gestao/cassems/route.ts
src/app/api/gestao/cassems/sync/route.ts
src/app/api/gestao/cassems/[id]/route.ts
src/app/api/gestao/cassems/[id]/arquivo/route.ts
prisma/schema.prisma
prisma/migrations/20260830140000_add_cassems_authorization/
scripts/verify-production-migration-window.cjs
scripts/test-production-migration-window.cjs
```

**Structure Decision**: espelho `src/lib/cassems`, não framework
genérico. Sem tocar `src/lib/impcg/*`.

## Nota (2026-08-30) — motivo do parse parcial

`describeCassemsParseGap` deriva o texto pt-BR (espelho IMPCG) dos
nulos e da soma das linhas versus `totalAmount`. Sem coluna nova.

## Complexity Tracking

Nenhuma violação constitucional. RBAC Exchange pode falhar
(dehydrated); pasta ainda importa. Sem upgrade do pin Spec Kit.
