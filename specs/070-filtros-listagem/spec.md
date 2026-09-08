---
id: SPEC-070
status: approved
owner: QLMED
affected_modules:
  - cadastro-produtos
  - products-list
  - ui-filters
---

# Feature Specification: Filtros de listagem (padrão Controle)

**Feature Branch**: `feat/070-filtros-listagem`

**Created**: 2026-09-08

**Status**: Approved

**Input**: O filtrar de Cadastro › Produtos divergia do de Estoque › Controle. Controle é o padrão para catálogo em memória. Auditar as demais listagens e aplicar o token canônico onde ainda havia classe copiada.

## Problem

Duas famílias de filtro coexistiam sem contrato. Controle filtra no keystroke, em memória, e a busca inclui linha/grupo/subgrupo. Produtos usava card `MobileFilterWrapper`, classes `py-2` copiadas e `GET /api/products/list` com debounce, sem hierarquia no `OR` da busca — "alexis" não achava item do grupo ALEXIS cuja descrição não contém a palavra.

## Roles and ownership

- **Actor**: usuário autenticado com a página correspondente em `allowedPages` (ou admin).
- **Mutação**: nenhuma. Só leitura/filtro de listagens já autorizadas.
- **Company isolation**: inalterada; `companyId` continua via helpers de auth.

## Padrão canônico (auditoria)

### Padrão A — catálogo já em memória (preferido)

Usar em Controle, Saída Material e Produtos em árvore (ordenar por Linha).

- Barra **inline**: `Field` + `FILTER_INPUT_CLS`. Sem Card. Sem `MobileFilterWrapper`.
- Aplica **no mesmo keystroke** (`useMemo` / filter local).
- Busca inclui rótulos visíveis: código, nome, fabricante, **linha, grupo, subgrupo**.

### Padrão B — lista paginada no servidor

Usar em NF-e recebidas/emitidas, CT-e, NFS-e, clientes/fornecedores.

- `MobileFilterWrapper` + `FILTER_INPUT_CLS`.
- Debounce ou **Aplicar** (query cara / período).
- Não copiar a string de `FILTER_INPUT_CLS`.

## Requirements

- **FR-070-01**: `GET /api/products/list?search=` MUST incluir `productType`, `productSubtype` e `productSubgroup` no `OR` (além de description/code/codigo e `aggSearchText` quando houver agregado).
- **FR-070-02**: `filterProductRows` MUST devolver produto cujo grupo/linha contém o termo mesmo se a descrição não contiver o termo.
- **FR-070-03**: A barra de Produtos MUST usar `FILTER_INPUT_CLS` e MUST NOT usar `MobileFilterWrapper`.
- **FR-070-04**: Na visão em árvore, digitar na busca MUST filtrar o catálogo já carregado sem novo `search=` na API.
- **FR-070-05**: Contas a pagar/receber, Rotinas e Vínculos NF MUST usar `FILTER_INPUT_CLS` nos inputs de listagem.

## User Scenarios & Testing

### US1 — Busca pelo nome do grupo em Produtos (P1)

**Given** um produto no grupo ALEXIS cuja descrição é "ESTABILIZADOR…", **When** busca `alexis` em Produtos (árvore), **Then** o produto aparece, como no Controle.

### US2 — Barra igual ao Controle (P1)

**Given** desktop em `/cadastro/produtos`, **When** vê os filtros, **Then** são campos `FILTER_INPUT_CLS` em barra solta, sem card "Filtros".

### US3 — Listagens paginadas não regridam (P2)

**Given** NF-e emitidas/recebidas, **When** filtra, **Then** o wrapper mobile e o Aplicar/debounce permanecem; só o token visual já era `FILTER_INPUT_CLS`.
