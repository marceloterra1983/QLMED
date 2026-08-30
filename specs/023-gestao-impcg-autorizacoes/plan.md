# Implementation Plan: Autorizações IMPCG em Gestão

**Branch**: `feat/gestao-impcg-autorizacoes` | **Date**: 2026-08-30 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/023-gestao-impcg-autorizacoes/spec.md`

## Summary

Grupo **Gestão** com página **IMPCG**. Worker in-process lê as duas
caixas via Graph app-only (RBAC recortado), grava o PDF na pasta
IMPCG do OneDrive já conectado (`faturamento@qlmed.com.br`), extrai o
ofício (texto ou OCR) e faz upsert por número da ordem. A lista lê o
banco; o popup reusa `Modal` + `useModalBackButton` e o PDF vem da
API (proxy do OneDrive). Sem pacote npm novo.

## Technical Context

**Language/Version**: TypeScript / Next.js 15 / Node 22

**Primary Dependencies**: Prisma 7, Zod, Vitest, Graph REST (fetch),
`@prisma/client-runtime-utils` Decimal (`src/lib/money.ts`). OCR via
binários da imagem (`poppler-utils`, `tesseract-ocr`,
`tesseract-ocr-data-por`) — sem `tesseract.js` / `pdf-parse`.

**Storage**: PostgreSQL canônico. Modelos `ImpcgAuthorization`,
`ImpcgAuthorizationItem`, `ImpcgSourceMessage`, `ImpcgIngestState`.
Arquivo canônico no OneDrive. Migration expand-only + janela de
produção.

**Testing**: Vitest — parser da fixture 17673, dedup (Message-ID e
nº), ACL 403, upload falhou ⇒ sem upsert. OCR de binário só se
`tesseract` existir no PATH (senão o parser testa texto injetado).

**Target Platform**: painel web + worker no processo `qlmed-app`
(Alpine). Dev com `QLMED_DISABLE_BACKGROUND_SERVICES=true` usa
“Atualizar agora”.

**Project Type**: aplicação web Next.js (rotas + `src/lib`)

**Performance Goals**: lista < 30s para o operador (SC-001). Coleta
com timeout por caixa (`AbortSignal`, padrão 30s como OneDrive).

**Constraints**: isolamento por `getOrCreateSingleCompany`; sem
`companyId` no pedido; dinheiro via Decimal (nunca float); sem token,
e-mail completo ou payload clínico em log; sem `Mail.Read` org-wide
no Entra; sem confirmar linha se o upload OneDrive falhar.

**Scale/Scope**: uma empresa, duas caixas, um cliente (IMPCG), uma
página. Volume esperado: dezenas a poucas centenas de ofícios.

**ADRs**: [ADR-0001](../../docs/decisions/0001-single-company-isolation.md),
[ADR-0007](../../docs/decisions/0007-single-canonical-database.md),
[ADR-0008](../../docs/decisions/0008-sync-advisory-lock.md)
(substitui ADR-0003). Sem ADR novo.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- Evidência: testes do parser, dedup, ACL e “sem arquivo ⇒ sem
  autorização” (I).
- Papéis e `allowedPages` no servidor; menu não autoriza (II).
- Migration Prisma versionada + `verify-production-migration-window`
  e o assert em `test-production-migration-window.cjs` (III).
- Graph, upload, parse e upsert em `src/lib`; rotas autenticam e
  delegam (IV).
- Logs sem secret, Message-ID completo ou itens/valores (V).
- SPEC-023, GSD off (VI).

**Pós-design**: sem violação. Pacotes Alpine no `Dockerfile` não
são dependência npm. Advisory lock reusa ADR-0008.

## Project Structure

### Documentation (this feature)

```text
specs/023-gestao-impcg-autorizacoes/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── api-gestao-impcg.md
└── tasks.md             # /speckit-tasks — não criado aqui
```

### Source Code

```text
src/lib/navigation.ts
src/components/SidebarNav.tsx
src/lib/graph-mail-client.ts
src/lib/onedrive-client.ts          # + upload + download content
src/lib/impcg/constants.ts
src/lib/impcg/parse-oficio.ts
src/lib/impcg/extract-pdf-text.ts
src/lib/impcg/ingest.ts
src/lib/impcg/store.ts
src/lib/__tests__/impcg-parse-oficio.test.ts
src/lib/__tests__/impcg-ingest-dedup.test.ts
src/lib/__tests__/impcg-acl.test.ts
src/lib/__tests__/impcg-upload-gate.test.ts
src/lib/bootstrap.ts
src/lib/background-service-health.ts
src/lib/postgres-advisory-lock.ts   # chave impcg-mail-ingest
src/app/(painel)/gestao/impcg/page.tsx
src/app/(painel)/gestao/impcg/page-client.tsx
src/app/api/gestao/impcg/route.ts
src/app/api/gestao/impcg/sync/route.ts
src/app/api/gestao/impcg/[id]/arquivo/route.ts
prisma/schema.prisma
prisma/migrations/20260830120000_add_impcg_authorization/
scripts/verify-production-migration-window.cjs
scripts/test-production-migration-window.cjs
Dockerfile                          # poppler + tesseract-por
```

**Structure Decision**: mesmo app Next.js. Domínio em `src/lib/impcg`.
UI no grupo `(painel)/gestao`. Sem worker container extra.

## Nota (2026-08-30) — motivo do parse parcial

`describeImpcgParseGap` deriva o texto pt-BR dos nulos e da soma
das linhas versus `totalAmount` (FAIL-004). Sem coluna/`parseNotes`.
A API devolve `parseMissingReason` calculado na listagem e no detalhe.

## Complexity Tracking

Nenhuma violação constitucional. OCR por binário da imagem em vez de
pacote npm; Graph mail em módulo novo (o token OneDrive não tem
`Mail.Read`).
