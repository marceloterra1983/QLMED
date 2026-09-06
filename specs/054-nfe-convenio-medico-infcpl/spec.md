---
id: SPEC-054
status: active
owner: QLMED
affected_modules:
  - fiscal-issued
  - invoice-ingest
  - invoices-api
depends_on:
  - SPEC-052
---

# Feature Specification: Convênio e médico no infCpl da NF-e emitida

**Feature Branch**: `feat/053-nfe-convenio-medico`
**Created**: 2026-09-06
**Status**: Active
**Spec Kit**: 054

## Problem

O `infCpl` das emitidas já traz `(Convenio …)` e `(Medico …)` ao lado de `(Paciente …)`.
Só `patientName` (SPEC-052) é persistido. Operadores precisam ver convênio e médico
na lista de Emitidas, sem abrir o XML.

## Goals

1. Extrair e persistir `Invoice.convenioName` e `Invoice.doctorName` a partir do `infCpl`.
2. Preencher no ingest (sync/autorização) e backfill histórico.
3. Na coluna Paciente da lista: convênio acima, paciente no meio, médico abaixo
   (tipografia menor e mais apagada).
4. Incluir convênio e médico na busca textual de emitidas.

## Non-Goals

- Dt. Cirurgia / Local Cir. / Doc. Pac. (podem vir depois).
- Cadastro de médicos / CRM / convênios.
- Alterar DANFE/PDF.

## Functional Requirements

- **FR-001**: Extrator determinístico:
  - `(Convenio <NOME>)` → `convenioName` (uppercase, `|` → espaço). Null se vazio/`-`.
  - `(Medico|Médico <NOME>)` → `doctorName` (uppercase, remove `:`/`-` inicial, `|` → espaço).
    Null se vazio/`-`/sem token alfabético ≥2 chars. Um único token de nome é válido.
- **FR-002**: Colunas nullable `convenioName` e `doctorName` em `Invoice`, indexadas para busca.
- **FR-003**: Preencher em create/update de Invoice emitida (NFE) junto com `patientName`.
- **FR-004**: `GET /api/invoices?search=` inclui `convenioName` e `doctorName` no OR por palavra.
- **FR-005**: UI `/fiscal/issued` coluna Paciente empilhada; CSV exporta as três colunas.
- **FR-006**: Backfill idempotente.

## Success Criteria

- ≥8.000 emitidas com `convenioName` e/ou `doctorName` após backfill (baseline ~8.9k no padrão).
- Lista mostra convênio acima e médico muted abaixo quando presentes.
- Migration na janela de produção.
