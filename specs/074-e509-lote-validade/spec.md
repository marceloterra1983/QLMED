---
id: SPEC-074
status: implemented
owner: QLMED
affected_modules:
  - estoque-entrada-nfe
  - stock-ledger
  - import-e509
---

# Feature Specification: E509 lote + validade do XML

**Feature Branch**: `fix/code-review-e509-findings`  
**Status**: Implemented  
**Input**: Planilha Spica E509 (XLSX ou ODS) com chave NF / código / lote; validade só no XML da nota recebida.

## Problem

A E509 identifica bem lote e código Spica, mas não tem coluna de validade. O
importador gravava lote sem `lotExpiry` e sem espelhar no ledger. Remediações
manuais no banco não eram reproduzíveis. Saídas com lote vazio vs entradas com
lote precisam de auditoria.

## Requirements

- **REQ-001**: `POST /api/estoque/import-e509` aceita `.xlsx` e `.ods`.
- **REQ-002**: Ao gravar/clonar lote, resolve validade única do XML da mesma nota
  (`rastro`/`dVal` ou `Validade:` junto do lote). Sem data única → não inventa.
- **REQ-003**: Após update/clone de lote, espelha no ledger via `syncEntryItemMovement`.
- **REQ-004**: Script `ops/scripts/qlmed-e509-incorporate.mjs` (dry-run/`--apply`)
  preenche `stock_movement` ENTRADA com lote Spica vazio e validade do XML.
- **REQ-005**: Script `ops/scripts/qlmed-stock-lot-gap-audit.mjs` reporta OUT com
  lote vazio vs IN com lote; `--apply-safe` só copia lote quando a mesma
  `invoiceId`+`product_codigo` tem exatamente um lote IN não vazio.

## Acceptance Criteria

1. **Given** E509 + XML com `dVal` para o lote, **When** import, **Then**
   `nfe_entry_item.lot_expiry` e movimento `entrada-item:*` recebem a data.
2. **Given** duas datas distintas para o mesmo lote no XML, **When** import,
   **Then** lote pode gravar; validade permanece vazia.
3. **Given** ODS E509 válido, **When** upload, **Then** `format=ods` e lotes importam.
4. **Given** `--apply-safe` no audit, **When** OUT e IN compartilham invoice e um
   único lote IN, **Then** OUT recebe esse lote; demais casos só no relatório.
