---
id: SPEC-022
status: approved
owner: QLMED
related_decisions: []
affected_modules:
  - nsdocs-sync
  - local-xml-sync
---

# Feature Specification: Situação de cancelamento no sync NSDocs e no XML local

**Feature Branch**: `feat/nfe-cancel-nsdocs-campos`

**Created**: 2026-08-28

**Status**: Approved

**Input**: Follow-up da [SPEC-020](../020-nfe-cancelado-tag/spec.md). A tag
**Cancelado** já existe; o sync periódico e a importação de XML local
não entregavam a evidência de cancelamento das notas já gravadas.

## Problem

A lista de emitidas só mostra **Cancelado** quando `cancelledAt` está
preenchido. A sincronização com o provedor de documentos pedia a lista
sem os campos de situação e chave. O XML autorizado antigo continua
sem o evento. O operador via nota vigente mesmo quando o provedor já
declarava cancelada, ou quando o arquivo local era só o evento de
cancelamento.

## User scenarios and testing

### User Story 1 — Sync traz a situação cancelada (Priority: P1)

Como o fluxo de sincronização, ao listar documentos do provedor eu
recebo se a nota está cancelada, sem baixar o XML de novo e sem
apagar o XML autorizado já gravado.

**Why this priority**: Sem a situação na lista, o detector da SPEC-020
não tem evidência do provedor.

**Independent Test**: Uma listagem de documentos do provedor inclui
situação e chave; nota existente com situação cancelada ganha
`cancelledAt`.

**Acceptance Scenarios**:

1. **AC-001** — Given uma NF-e já gravada cuja situação no provedor é
   cancelada, when o sync lista o documento, then a nota MUST ficar
   marcada como cancelada e o XML autorizado MUST permanecer o mesmo.
2. **AC-002** — Given uma NF-e vigente no provedor, when o sync lista
   o documento, then a nota MUST NOT ganhar marca de cancelada só por
   ter sido listada de novo.

### User Story 2 — Evento local marca a nota existente (Priority: P1)

Como o fluxo de importação de XML local, quando o arquivo é um evento
de cancelamento homologado e a nota da mesma chave já existe, eu
marco a nota sem criar documento novo e sem substituir o XML
autorizado.

**Why this priority**: Emitidas entram pelo XML local, não pelo
provedor de recebidos.

**Independent Test**: Um XML de evento de cancelamento aceito, com a
chave de uma nota existente, marca `cancelledAt` e não cria nota.

**Acceptance Scenarios**:

1. **AC-003** — Given uma NF-e existente e um arquivo local com
   cancelamento homologado da mesma chave, when o arquivo é
   importado, then a nota MUST ficar marcada como cancelada.
2. **AC-004** — Given um arquivo local que não é nota nem
   cancelamento homologado, when a importação falha em interpretá-lo,
   then MUST NOT inventar cancelamento.

## Requirements

### Functional requirements

- **FR-001**: A listagem de documentos do provedor MUST incluir a
  situação e a chave de acesso, não só o identificador interno.
- **FR-002**: Situação cancelada do provedor MUST marcar a NF-e
  existente pela chave, sem limpar `cancelledAt` e sem sobrescrever
  XML.
- **FR-003**: XML local de cancelamento homologado MUST atualizar a
  nota existente pela chave. MUST NOT criar nota só com o evento.
- **FR-004**: Manifestação do destinatário permanece ortogonal, como
  na SPEC-020.
- **FR-005**: Autorização e isolamento da empresa única não mudam.

### Failure cases

- **FAIL-001**: Lista sem situação — tratar como vigente, não
  inventar cancelamento.
- **FAIL-002**: Evento local sem chave ou sem aceite — não marcar.
- **FAIL-003**: Falha ao interpretar um arquivo — não derrubar o
  restante da importação.

### Non-functional

- Sem XML completo em log.
- Sem migration.
- Evidência: testes da listagem com situação e da aplicação do evento
  local.

### Out of scope

- Consulta SEFAZ nota a nota ou DistDFe em massa.
- Tag de cancelado em CT-e ou NFS-e.
- Excluir canceladas dos totais.
- Novo papel.

## Key entities

- **Situação do provedor**: estado consolidado do documento na
  listagem (autorizado, cancelado, etc.).
- **XML local de evento**: arquivo de cancelamento homologado que
  chega pela pasta de backup, não pela distribuição SEFAZ.

## Success Criteria

- **SC-001**: NF-e cuja situação no provedor é cancelada fica marcada
  após o sync, sem novo download de XML autorizado.
- **SC-002**: 100% dos testes de evento local homologado marcam a
  nota existente; 100% dos arquivos sem evidência não marcam.
- **SC-003**: XML autorizado já gravado permanece o mesmo depois do
  sync e depois do evento local.

## Assumptions

- A listagem do provedor devolve situação e chave quando esses campos
  são pedidos; sem o pedido, só o id interno.
- Emitidas históricas cujo evento nunca foi arquivado e que não estão
  no provedor continuam sem marca até chegar evidência (evento local
  ou próxima distribuição).
- SPEC-020 permanece o contrato da tag na página de emitidas.
