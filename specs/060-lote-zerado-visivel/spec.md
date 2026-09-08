---
id: SPEC-060
status: implemented
owner: QLMED
affected_modules:
  - estoque
  - stock-ledger
  - entrada-nfe
---

# Feature Specification: Lote zerado visível

**Feature Branch**: `feat/060-lote-zerado-visivel`

**Created**: 2026-09-08

**Status**: Implemented

**Input**: Lotes consumidos (saldo 0), como o 26C52 da NF-e 65260, precisam aparecer na busca e no modal do Controle, com kardex ligando à NF-e, e na busca da Entrada NF-e. Saída Material continua só com quantidade > 0.

## Problem

O ledger está correto: a NF-e de entrada credita o lote e as saídas o zeram. As telas atuais descartam saldo zero, então o lote some da busca do Controle, da aba Lotes e não dá para achar a nota na Entrada pelo número do lote. O kardex já traz o id da nota, mas não o número nem o popup fiscal.

## Roles and ownership

- **Actor**: usuário autenticado com `/estoque/controle` e/ou `/estoque/entrada-nfe` em `allowedPages` (ou admin).
- **Leitura**: as APIs de catálogo, movimentos e lista de Entrada NF-e exigem autenticação; não há mutação nesta feature.
- **Company isolation**: `companyId` via `getOrCreateSingleCompany` a partir da sessão; nunca de query/body controlados pelo cliente.
- **Saída Material**: continua listando apenas saldos com quantidade > 0; lote zerado não entra no picker.

## User Scenarios & Testing

### US1 — Buscar lote consumido no Controle (P1)

**Given** o produto 002626 tem o lote 26C52 com saldo 0 após a entrada 65260 e as saídas, **When** o operador busca `26C52` em Controle, **Then** o produto 002626 aparece.

**Why this priority**: é o único jeito de achar o produto pelo lote depois de consumido.

**Independent Test**: catálogo do Controle inclui o lote zerado; a busca por lote casa.

**Acceptance Scenarios**:

1. **Given** lote com quantidade 0 no ledger, **When** busca pelo código do lote, **Then** o produto correspondente é listado.
2. **Given** o mesmo ledger, **When** abre Saída Material, **Then** o lote zerado não aparece para seleção.

### US2 — Ver lote zerado e kardex com NF-e (P1)

**Given** o produto 002626 aberto no modal, **When** o operador olha Lotes, **Then** vê 26C52 com quantidade 0 e badge Zerado.

**Why this priority**: sem o lote na lista, o kardex filtrado não é alcançável.

**Acceptance Scenarios**:

1. **Given** modal aberto, **When** clica no lote, **Then** vai para Movimentações filtrada por esse lote.
2. **Given** kardex do lote, **When** olha as linhas, **Then** vê tipos incluindo Saldo inicial, direção IN/OUT e o número da NF-e (ex.: 65260).
3. **Given** número da NF-e no kardex, **When** clica, **Then** abre o mesmo popup de detalhes da NF-e usado no Fiscal.

### US3 — Buscar lote na Entrada NF-e (P1)

**Given** a NF-e recebida 65260 gerou movimento com lote 26C52, **When** a busca por emitente/número não casa e o texto é o lote, **Then** a lista devolve a 65260.

**Why this priority**: o operador lembra o lote, não o número da nota.

**Acceptance Scenarios**:

1. **Given** busca `26C52` sem casar emitente/número/CNPJ, **When** a API consulta movimentos da empresa, **Then** devolve as NF-e recebidas ligadas.
2. **Given** busca que já casa número ou emitente, **When** há resultado, **Then** não substitui a lista por outro critério.

### Edge Cases

- Lote com quantidade ~0 por arredondamento: tratado como zerado quando `includeZero` está ativo no Controle.
- Movimento sem `invoiceId`: kardex não mostra link de NF-e.
- Busca de lote na Entrada não encontra movimento da empresa: lista vazia, sem vazar nota de outra empresa.
- Produto com muitos movimentos: a janela do kardex cobre até 500 linhas; com filtro de lote, a vida daquele lote cabe nessa janela.

## Requirements

- **REQ-001**: O ledger expõe saldos com quantidade 0 quando o catálogo do Controle pede `includeZero`; o padrão do ledger (Saída Material, FEFO, alocação) continua descartando ~0.
- **REQ-002**: A busca do Controle encontra produto por código de lote mesmo com saldo 0.
- **REQ-003**: O modal de produto lista lote zerado com badge **Zerado** e quantidade 0; clique no lote filtra o kardex (`lot`).
- **REQ-004**: O kardex mostra rótulo de `SALDO_INICIAL`, busca até 500 movimentos e exibe número da NF-e clicável que abre o popup fiscal existente.
- **REQ-005**: A API de movimentos devolve número, série e direção da NF-e ligada, sempre no recorte da empresa autenticada.
- **REQ-006**: A busca GET da Entrada NF-e, se não casar emitente/número/CNPJ, procura `stock_movement.lot` da mesma empresa e devolve NF-e `received` ligadas.
- **REQ-007**: Saída Material permanece apenas quantidade > 0.

## Acceptance Criteria

- **AC-001**: `includeZero` no ledger coberto por teste; busca `26C52` no catálogo acha 002626; Saída não inclui o lote zerado.
- **AC-002**: Modal/kardex: badge Zerado, filtro por lote, NF clicável via popup existente, label Saldo inicial, `limit=500`.
- **AC-003**: Entrada NF-e: fallback de lote coberto por teste; `26C52` lista a 65260 quando o texto não casa nota/emitente.
- **AC-004**: `npx tsc --noEmit`, testes relevantes, `npm run docs:validate` e `npm run ui:verify` verdes.
- **AC-005**: Preview `:3002` exercita busca 26C52 no Controle e na Entrada (ou evidencia o bloqueio de login).

## Failure cases

- Sessão ausente nas APIs de catálogo, movimentos ou Entrada: 401, sem dados.
- Tentativa de ampliar empresa por query: ignorada; só a empresa da sessão.
- Lote inexistente na empresa: busca vazia, sem erro 500.

## Non-functional

- Sem migration; sem página nova; sem índice extra nesta fatia.
- Payload do Controle cresce um registro por lote esgotado; se estourar, o passo seguinte é um índice só `{ lot }` por produto (fora desta fatia).
- Sem log de XML fiscal completo.

## Applicable ADRs

Nenhum ADR novo. Isolamento e persistência seguem a constituição e o ledger existente (SPEC-056 / SPEC-058 / SPEC-059).

## Test strategy

- Unitário: filtro `includeZero` do ledger; busca do catálogo por lote zerado; fallback da busca da Entrada quando o texto não casa.
- Typecheck e `ui:verify` no modal (tokens existentes, sem pill à mão).
- Preview canônico `:3002` no fluxo 26C52 / 65260.

## Assumptions

- O popup de NF-e já existente (`NfeDetailsModal`) é suficiente; não se cria outro contrato de detalhes.
- A busca da Entrada por lote usa igualdade do texto (trim, sem diferenciar maiúsculas) contra `stock_movement.lot`.
- Emitidas continuam fora desta fatia: as saídas aparecem no kardex do Controle.

## Out of scope

- Lote zerado na Saída Material.
- Página nova de dossiê de lote.
- Busca por lote em NF-e emitidas.
- Índice `{ lot }` enxuto (só se o payload do catálogo estourar).
- Migration Prisma ou mudança de schema.
