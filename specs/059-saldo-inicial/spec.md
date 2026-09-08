---
id: SPEC-059
status: implemented
owner: QLMED
affected_modules:
  - estoque
  - stock-ledger
---

# Feature Specification: Saldo de abertura no corte 2021

**Feature Branch**: `feat/059-saldo-inicial`

**Created**: 2026-09-07

**Status**: Implemented

## Problem

O backfill fiscal desde 01/01/2021 não tem NF-e de compra anteriores ao corte. Produtos vendidos em 2021+ sem compra no XML ficam com CD negativo. Além disso, o POST de backfill apagava o ledger inteiro antes de reconstruir; um timeout HTTP deixava só as entradas.

## Requirements

- **REQ-001**: Após reconstruir o ledger fiscal, gravar `SALDO_INICIAL` em 01/01/2021 igual ao pico de déficit cronológico por produto/lote/local.
- **REQ-002**: O backfill não apaga movimentos fiscais ≥ 2021 (é resumível). Só remove pré-corte e reabre `SALDO_INICIAL`.
- **REQ-003**: Um segundo backfill não duplica abertura (idempotency `opening:2021:…`).

## Acceptance Criteria

- **AC-001**: `computeImpliedOpenings` coberto por testes (só saída; compra cobre; pico ≠ saldo final; mesmo instante).
- **AC-002**: Produto sem compra e com saída no período recebe abertura que zera o CD daquele lote/local.
