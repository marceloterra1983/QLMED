---
id: SPEC-073
status: approved
owner: QLMED
affected_modules:
  - fiscal-ui
  - financeiro-ui
  - estoque-ui
  - cadastro-ui
  - gestao-ui
  - notifications
---

# Feature Specification: Número da nota fiscal com separador de milhar

**Feature Branch**: `feat/073-invoice-number-format`

**Created**: 2026-09-08

**Status**: Approved

**Input**: Padronizar em todo o site o número da nota fiscal com ponto de milhar (65254 → 65.254).

## Problem

O número da NF aparece cru (65254) nas listas, modais, financeiro, estoque e legendas. O operador lê milhares sem o ponto habitual do pt-BR. A DANFE oficial já agrupa dígitos; a UI do painel não.

## Roles and ownership

- **Actor**: qualquer usuário autenticado que vê NF-e, NFS-e ou CT-e.
- **Authorization**: inalterada.
- **Company isolation**: inalterada. Só muda apresentação.

## User Scenarios & Testing

### User Story 1 — Ler o número da nota com ponto (Priority: P1)

Como operador, vejo 65.254 em qualquer tela do painel que mostre o número da nota, em vez de 65254.

**Acceptance Scenarios**:

1. **AC-001** — Given uma NF-e/NFS-e/CT-e com número 65254, when a lista ou o modal renderiza, then o texto visível MUST ser `65.254`.
2. **AC-002** — Given um número com zeros à esquerda (`00065254`), when a UI renderiza, then MUST mostrar `65.254` (sem pad de 9 dígitos da DANFE).
3. **AC-003** — Given número abaixo de 1000, when a UI renderiza, then MUST permanecer sem ponto (`123`).
4. **AC-004** — Given busca `65053` na lista de emitidas, when o número exibido é `65.053`, then o Highlight MUST marcar o número.

### User Story 2 — Persistência e documentos oficiais intactos (Priority: P1)

Como o sistema, continuo gravando e exportando o número sem ponto.

**Acceptance Scenarios**:

1. **AC-005** — Given API, banco, nome de ficheiro e CSV, when o número é persistido ou exportado, then MUST permanecer sem o ponto de exibição.
2. **AC-006** — Given DANFE/DACTE oficiais, when o PDF é gerado, then o agrupamento `fmtNfNum` (9 dígitos) MUST permanecer o da SEFAZ — fora deste padrão de UI.

## Requirements

- **REQ-001**: Um helper puro único formata o número da nota para UI (`65254` → `65.254`).
- **REQ-002**: Toda superfície do painel que mostra número de NF-e, NFS-e ou CT-e (listas, modais, financeiro, estoque, cadastro, gestão, emissões, push e caption de WhatsApp de NF-e) MUST usar esse helper.
- **REQ-003**: Endereço, série, parcela/duplicata, fatura, chave de acesso e CSV NÃO usam o helper.
- **REQ-004**: Valor vazio ou ausente continua `-`. Texto sem dígitos permanece como veio.

## Out of scope

- Alterar XML, banco, chaves de acesso ou o bloco numérico da DANFE (`000.065.254`).
- Separador em valores monetários (já é `formatAmount`).
- Número de endereço ou de parcela.

## Success criteria

- Teste unitário do helper cobre 65254, pad, vazio e já formatado.
- Highlight cobre busca por dígitos sobre o número com ponto.
- Caption NF-e e push cobertos por teste.
- `npx tsc --noEmit` e `npm run docs:validate` passam.
