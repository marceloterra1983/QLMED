---
id: SPEC-051
status: approved
owner: QLMED
affected_modules:
  - unimed-cg-billing-match
  - nfe-emission-authorize
  - gestao-unimed-cg-ui
  - gestao-unimed-cg-api
related_specs:
  - SPEC-045
  - SPEC-048
  - SPEC-049
  - SPEC-025
---

# Feature Specification: Unimed CG — Processos Faturados via NF-e (infCpl)

**Feature Branch**: `feat/051-unimed-cg-faturado-nfe`

**Created**: 2026-09-06

**Status**: Approved

## Contexto

Autorizações de faturamento Unimed CG precisam ser marcadas como já faturadas quando uma NF-e emitida ao CNPJ Unimed (`03.315.918/0001-18`) contém o nome do beneficiário em `infCpl`. A UI agrupa o processo faturado e todos os documentos relacionados (mesmo `processId`) numa Section **PROCESSOS FATURADOS**, removendo-os das listas de origem.

## Decisões fechadas

- CNPJ destinatário: dígitos `03315918000118` (constante em `unimed-cg/constants.ts`)
- Match: `fold(patientName)` com ≥2 tokens deve ser substring de `fold(infCpl)`
- Fonte `infCpl`: `Invoice.xmlContent`; fallback `InvoiceEmission.payload.infCpl`
- Persistência expand-only em `UnimedCgAuthorization`: `billedInvoiceId`, `billedInvoiceNumber`, `billedMatchedAt`, `billedMatchStatus` (`matched` | `ambiguous` | null)
- Ambíguo: grava status, não escolhe NF errada; **não** move para Faturados
- Trigger primário: sucesso de autorização NF-e com dest Unimed; catch-up no tick de ingest Unimed CG
- Pré-solicitação: só entra no agrupamento se houver `processId` compartilhado (hoje usa `preSolicitationId` — fora do agrupamento automático)
- Tag amarela mostra o **número da NF**; clique abre `InvoiceDetailsModal`
- Origens filtram `processId` presentes no conjunto matched

## Requirements

- FR-001: Migration expand-only + pin `verify-production-migration-window`
- FR-002: Módulo `billing-match.ts` com normalize/extract/match + `runUnimedCgBillingMatch`
- FR-003: Hook em `authorize.ts` pós-autorização quando dest CNPJ = Unimed
- FR-004: Catch-up no fim do tick `runUnimedCgIngest` (após backfill de nomes)
- FR-005: API lista `billed` + filtra origens por processIds faturados
- FR-006: UI Section PROCESSOS FATURADOS (pai + subitens) + tag amarela + modal NF
- FR-007: Testes unitários matcher; rotina documentada em system-routines

## Acceptance Criteria

- AC-001: Emitir NF-e Unimed com patientName em infCpl marca autorização matched
- AC-002: Múltiplas NF-e → ambiguous, sem invoiceId definitivo
- AC-003: Listas origem não mostram processIds matched
- AC-004: Faturados mostra hierarquia e abre modal pela tag NF
- AC-005: Gates + vitest + tsc verdes; deploy produção após merge

## Out of scope

- Match por valor/data; edição manual do vínculo; pré-solicitação sem processId; badge simples “Faturado” sem hierarquia
