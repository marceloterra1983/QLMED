---
id: SPEC-058
status: implemented
owner: QLMED
affected_modules:
  - estoque
  - stock-ledger
  - saida-material
---

# Feature Specification: Visão em Árvore e Correção do Saldo de Estoque

**Feature Branch**: `feat/058-estoque-tree-view`

**Created**: 2026-09-07

**Status**: Implemented

**Input**: Correção da apuração do saldo de estoque (entradas de NF-e recebidas com mapeamento S1-S7 + corte temporal 01/01/2021) e reformulação visual das telas de Estoque (Controle e Saída Material) para adotar a estrutura canônica de Cadastro de Produtos (árvore Linha > Grupo > Subgrupo > Produto, expandir/recolher todos, busca unificada, e popup/expand de lotes e kardex com alternância de modo).

## Problem

1. O ledger de estoque não processava entradas de compras fiscais recebidas porque lia apenas `stock_entry` (que possui 0 registros manuais), enquanto 1.480 NF-e de entrada íntegras existem no banco. Além disso, as saídas históricas retroagiam até 2010 enquanto as entradas só existem a partir de dez/2020, gerando saldos negativos espúrios.
2. A tela de Controle exibia apenas uma tabela plana sem hierarquia por linha/grupo de produtos, divergindo da experiência de navegação do catálogo consolidada em Cadastro de Produtos.
3. Na Saída Material, os produtos precisam ser navegados pela mesma hierarquia com expansão e popup de lotes, mostrando apenas produtos com saldo disponível > 0.

## Roles and ownership

- **Actor**: usuários autorizados em `/estoque/controle` e `/estoque/saida-material`.
- **Company isolation**: garantida via `getOrCreateSingleCompany`.
- **Editor role**: exigido para backfill, ajustes e emissão.

## Requirements

- **REQ-001**: O recálculo de saldo / backfill deve processar NF-e de entrada recebidas a partir de 01/01/2021 com mapeamento de produtos (código Spica via `nfe_item_product_link` ou código de catálogo), credenciando saldo ao CD com lotes e validades extraídos do XML.
- **REQ-002**: As NF-e emitidas devem ter corte temporal em 01/01/2021 no backfill histórico para sincronizar o início das compras registradas.
- **REQ-003**: A visualização de produtos em Controle de Estoque deve adotar a estrutura de árvore de produtos de `/cadastro/produtos` (Linha > Grupo > Subgrupo > Produto), com contadores de itens, expandir/recolher todos e busca unificada.
- **REQ-004**: No Controle de Estoque, todos os produtos do catálogo são apresentados (mesmo com saldo zero), com colunas claras de Cód. Spica, Referência, Descrição, Fabricante, Saldo CD, Saldo Consignado e Saldo Total.
- **REQ-005**: Ao clicar no produto, deve abrir um modal de detalhes de estoque com abas (Lotes / Validade e Movimentações / Kardex), suportando alternância de modo Popup / Expandir conforme SPEC-039.
- **REQ-006**: Na Saída Material, a visualização também deve seguir a hierarquia de árvore, filtrando apenas produtos com saldo > 0 na localização relevante.

## Acceptance Criteria

- **AC-001**: Backfill processa entradas fiscais recebidas e respeita o corte de 01/01/2021 para entradas e saídas.
- **AC-002**: Controle de Estoque renderiza árvore Linha > Grupo > Subgrupo com controle de expansão e busca.
- **AC-003**: Modal de detalhes do produto exibe lotes com badges de validade e histórico de movimentações.
- **AC-004**: Saída Material exibe produtos agrupados por hierarquia apenas com saldo disponível.
- **AC-005**: Testes automatizados verdes (`npx vitest run`, `npx tsc --noEmit`, `npm run ui:verify`, `npm run docs:validate`).
