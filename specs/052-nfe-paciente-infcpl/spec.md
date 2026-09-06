---
id: SPEC-052
status: active
owner: QLMED
affected_modules:
  - fiscal-issued
  - invoice-ingest
  - invoices-api
---

# Feature Specification: Paciente nas informações complementares da NF-e emitida

**Feature Branch**: `feat/052-nfe-paciente-infcpl`
**Created**: 2026-09-06
**Status**: Active
**Spec Kit**: 052

## Problem

Notas fiscais de venda emitidas pela QLMED costumam trazer o nome do paciente em `<infCpl>` (ex.: `(Paciente JOAO DA SILVA)`). Hoje esse dado só existe no XML; não há campo consultável. Operadores precisam achar a NF pelo paciente e não conseguem no filtro de Emitidas.

## Goals

1. Detectar quando o `infCpl` contém nome de paciente e persistir em `Invoice.patientName`.
2. Permitir busca por nome do paciente no filtro de NF-e emitidas (`/fiscal/issued`).
3. Preencher o campo no ingest (sync/autorização) e backfill histórico (~9k notas com o padrão).

## Non-Goals

- Extrair médico, convênio, local de cirurgia (podem vir depois).
- Cadastro de pacientes / CRM.
- Alterar DANFE/PDF além do que já imprime o `infCpl`.

## Functional Requirements

- **FR-001**: Extrator determinístico de `infCpl`: padrão `(Paciente <NOME>)` (case-insensitive). Remove sufixo ` - ATEND.: …` quando presente. Retorna `null` se não houver match.
- **FR-002**: Coluna nullable `Invoice.patientName` (texto), indexada para busca.
- **FR-003**: Preencher `patientName` em create/update de Invoice emitida (NFE) sempre que o XML tiver `infCpl` parseável.
- **FR-004**: `GET /api/invoices?search=…` inclui `patientName` nas cláusulas OR de cada palavra.
- **FR-005**: Placeholder do filtro em Emitidas menciona paciente.
- **FR-006**: Backfill idempotente sobre emitidas históricas.

## Success Criteria

- ≥8.000 emitidas com `patientName` preenchido após backfill (baseline ~9.024 com padrão `(Paciente `).
- Busca por sobrenome de paciente conhecido retorna a NF correta.
- Migration na janela de produção (`verify-production-migration-window`).
