---
id: SPEC-037
status: approved
owner: QLMED
related_decisions:
  - ADR-0009
affected_modules:
  - cassems-parse
---

# Feature Specification: Médico CASSEMS pelo PRESTADOR SOLICITANTE

**Feature Branch**: `fix/cassems-prestador-solicitante`

**Created**: 2026-08-31

**Status**: Approved

**Input**: No ofício CASSEMS o médico é o campo PRESTADOR SOLICITANTE.
Atualizar a leitura. IMPCG continua com MÉDICO/CRM. Não reparsear
ofícios já gravados.

## Problem

O ofício CASSEMS identifica o médico em **PRESTADOR SOLICITANTE**
(e **Nº CRM** na mesma faixa). A leitura já olhava esse rótulo, mas
também aceitava hospital ou a razão social da CASSEMS como se fosse
médico, e um **Nº CRM** vazio podia herdar dígitos da data. O
operador via hospital no lugar do médico.

## Roles and ownership

A leitura roda na ingestão (e-mail e pasta) sob o `companyId` de
`getSingleCompany()`, como a SPEC-024. Nenhuma rota HTTP nova. Viewer
só vê o nome já persistido; editor continua podendo corrigir o
cabeçalho (SPEC-024 FR-012).

## User scenarios and testing

### User Story 1 — Ler o médico no rótulo CASSEMS (Priority: P1)

Como operador, abro um ofício CASSEMS e o médico é o prestador
solicitante, com CRM quando o documento traz número.

**Why this priority**: é o pedido operacional; sem isso a lista mente.

**Independent Test**: Texto com `PRESTADOR SOLICITANTE: NOME` e
`Nº CRM: 13716` preenche médico e CRM; texto só com `MEDICO:` ainda
preenche.

**Acceptance Scenarios**:

1. **AC-001** — Given um ofício com `PRESTADOR SOLICITANTE: NOME` e
   CRM numérico, when a leitura corre, then MUST gravar esse nome em
   `doctorName` e só os dígitos do CRM em `doctorCrm`.
2. **AC-002** — Given um ofício histórico só com `MEDICO:` / `CRM:`,
   when a leitura corre, then MUST continuar preenchendo médico e CRM.
3. **AC-003** — Given `PRESTADOR SOLICITANTE` igual a hospital ou à
   razão social da CASSEMS, when a leitura corre, then MUST deixar
   `doctorName` vazio e MUST NÃO copiar o local de execução para o
   médico.
4. **AC-004** — Given `Nº CRM:` sem número e uma data no documento,
   when a leitura corre, then `doctorCrm` MUST permanecer vazio.

## Success Criteria

- **SC-001**: Ofício com PRESTADOR SOLICITANTE e CRM numérico mostra o
  médico certo na lista, sem o operador editar.
- **SC-002**: Ofício cujo prestador é o hospital ou a CASSEMS não
  aparece com esse nome no campo médico.

## Requirements

- **FR-001**: A leitura do ofício CASSEMS MUST obter o médico no
  rótulo **PRESTADOR SOLICITANTE**.
- **FR-002**: A leitura MUST aceitar o rótulo histórico **MEDICO** /
  **MÉDICO** quando PRESTADOR SOLICITANTE não trouxer um nome de
  pessoa, para ofícios antigos.
- **FR-003**: `doctorCrm` MUST sair só de um CRM ao lado do médico
  (mesma linha ou a linha seguinte de `Nº CRM`), com 4 a 10 dígitos.
  MUST NÃO herdar dígitos de data, página ou telefone.
- **FR-004**: Nome que for hospital, unidade CASSEMS ou a razão
  social da Caixa de Assistência MUST NÃO ser persistido como médico.

## Failure cases

- PRESTADOR SOLICITANTE vazio e sem MEDICO: `doctorName` nulo; status
  parcial se o restante existir (SPEC-024 FR-008).
- CRM ausente ou com menos de 4 dígitos: `doctorCrm` nulo; o nome da
  pessoa, se houver, permanece.

## Non-functional requirements

- **NFR-001**: Sem migration. Sem backfill automático de linhas já
  gravadas.
- **NFR-002**: A leitura de itens/tabela MUST NÃO mudar nesta feature.

## Applicable ADRs

ADR-0009 (Spec Kit obrigatório para mudança de comportamento).

## Test strategy

Testes unitários em `src/lib/__tests__/cassems-parse-oficio.test.ts`
para AC-001..AC-004. O fixture do ofício modelo 2479325231 permanece.

## Out of scope

Parse de itens/tabela. Reprocessar autorizações já persistidas.
Alterar o parser IMPCG. Nova tela ou API.
