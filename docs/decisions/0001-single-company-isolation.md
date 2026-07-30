---
id: ADR-0001
status: accepted
date: 2026-07-22
supersedes: null
related_specs: []
---

# Isolamento single-company por companyId derivado do usuário autenticado

## Context

O modelo de dados do QLMED é multi-tenant (cada `Company` isola invoices,
produtos, estoque, financeiro via `companyId`), mas a operação atual é
**single-company** (`src/lib/single-company.ts`): o contexto de empresa vem da
identidade autenticada, não de um seletor multi-empresa. O filtro por empresa
precisa ser inviolável — vazamento cross-company num sistema fiscal é incidente
grave. A decisão vinha sendo aplicada em todo o código sem registro formal
(painel de especialistas 2026-07-22).

## Decision drivers

- Nenhum request pode escolher a empresa que enxerga (evitar IDOR).
- A regra deve valer para o Prisma tipado e para o SQL cru das tabelas satélite.
- Auditoria de segurança precisa de um ponto único de verdade.

## Considered options

### Option A — companyId derivado do usuário autenticado, via helpers canônicos

O contexto de empresa vem sempre da sessão autenticada (helpers canônicos), nunca
de IDs controlados pelo request. Todo acesso a dado filtra por esse companyId.

### Option B — companyId como parâmetro de request validado por autorização

Rota recebe companyId e valida se o usuário pode acessá-lo. Mais flexível, porém
cada rota vira uma superfície de erro de autorização.

## Decision

**Option A.** O `companyId` é derivado exclusivamente do usuário autenticado
através dos helpers canônicos; a autorização é sempre server-side (visibilidade
de UI nunca é autorização). Toda query — Prisma ou SQL cru — filtra por esse
companyId.

## Consequences

### Positive

- Vazamento cross-company exige burlar a autenticação, não uma única rota.
- Regra uniforme entre Prisma e SQL cru.

### Negative

- O isolamento das tabelas satélite depende hoje 100% da aplicação (sem FK/RLS
  no banco). Endereçado parcialmente em [ADR-0002] e na fase SCHEMA-02
  (FKs `ON DELETE CASCADE`).

## Verification

- Revisão de código: nenhuma query de negócio sem filtro por companyId derivado
  da sessão.
- Teste de isolamento (uma escrita numa empresa não aparece em outra).
- Futuro: FKs + avaliar Row-Level Security nas satélites (SCHEMA-02).
