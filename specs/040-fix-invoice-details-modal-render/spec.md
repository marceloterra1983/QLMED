---
id: SPEC-040
status: draft
owner: QLMED
affected_modules:
  - invoice-details
  - ui-modal
---

# Feature Specification: Correção da Renderização do Popup da Nota Fiscal

**Feature Branch**: `fix/danfe-modal-render`

**Created**: 2026-09-03

**Status**: Draft

**Input**: Ao abrir o popup da nota fiscal, a visualização (DANFE/XML) é renderizada cortada, colapsando para 150px de altura e deixando um espaço em branco no restante do modal.

## Problem

Ao abrir o modal de detalhes de uma nota fiscal (`InvoiceDetailsModal`), o container do corpo não definia classes de expansão flexível vertical (`flex flex-col flex-1 h-full min-h-0 overflow-hidden`). Sem essas propriedades, o pai não agia como flex container e o filho `h-full` computava como `height: auto`, fazendo com que a tag `<iframe>` recaísse na altura padrão HTML de 150px. Isso gerava um corte severo na DANFE, mostrando apenas os primeiros 150px do cabeçalho com uma scrollbar minúscula e uma grande área vazia/branca abaixo.

## Roles and ownership

- **Actor**: qualquer usuário autenticado com acesso a notas fiscais.
- **Authorization**: inalterada.
- **Company isolation**: preservada pelas rotas de API existentes.

## User Scenarios & Testing

### User Story 1 - Visualização completa da DANFE e XML no modal (Priority: P1)

Ao clicar para visualizar uma nota fiscal, a DANFE ou o código XML deve ocupar 100% da altura disponível da janela modal, sem cortes ou áreas brancas artificiais.

**Acceptance Scenarios**:
1. **Given** um documento fiscal (NF-e, CT-e, NFS-e), **When** o operador abre a visualização pelo modal, **Then** a DANFE é renderizada ocupando toda a altura do modal (92vh no desktop e 100% no mobile), permitindo scroll suave de todo o documento A4.
2. **Given** a visualização em XML, **When** o operador alterna para XML, **Then** o editor de código escuro com numeração de linhas preenche toda a altura e largura da janela.

## Requirements

- **REQ-001**: `InvoiceDetailsModal` deve configurar `bodyClassName` com classes flexíveis de altura total (`flex flex-col flex-1 h-full min-h-0 overflow-hidden`).
- **REQ-002**: O container interno e o `iframe` devem expandir para preencher 100% da altura e largura da viewport do modal.
- **REQ-003**: `Modal.tsx` deve respeitar `bodyClassName` com `overflow-` customizado sem conflito de classes.
- **REQ-004**: Testes automatizados garantindo que o layout e as classes de altura sejam verificados.

## Acceptance Criteria

- **AC-001**: O iframe da DANFE não colapsa para 150px e ocupa toda a altura útil do modal.
- **AC-002**: A alternância entre DANFE e XML preserva a altura integral.
- **AC-003**: `npm run typecheck`, `npm run ui:verify`, `npm run ui:dialogs`, `npm run docs:validate` e `npm test` passam verdes.
