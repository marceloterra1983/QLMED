---
id: SPEC-026
status: draft
owner: QLMED
affected_modules:
  - sidebar-nav
  - produtos-ui
  - navigation-acl
---

# Feature Specification: Consulta ANVISA a partir de Produtos

**Feature Branch**: `feat/anvisa-consulta-produtos`

**Created**: 2026-08-30

**Status**: Draft

**Input**: Remover a página ANVISA da barra lateral e colocar um botão
para abrir o site oficial da ANVISA (consulta de Produtos para Saúde)
dentro da página de Produtos.

## Problem

A barra de Cadastros tem um item ANVISA que abre uma tela interna de
embed. O portal oficial bloqueia iframe; o operador precisa do site da
ANVISA, não de uma página extra no menu. A consulta de Produtos para
Saúde deve partir da tela de Produtos.

## Roles and ownership

- **Qualquer usuário com Cadastros › Produtos**: vê o botão e abre o
  site oficial da ANVISA numa nova aba.
- **Admin**: mesma superfície; o item ANVISA some da barra e da lista
  de páginas concedíveis em Usuários.
- Isolamento: sem dado novo; o botão só abre URL pública. Autorização
  das APIs `/api/anvisa` (validação de registro no cadastro) passa a
  exigir a página de Produtos.

## User scenarios and testing

### User Story 1 — Barra sem ANVISA (Priority: P1)

Como operador, abro o painel e em Cadastros vejo Produtos, Clientes e
Fornecedores. Não vejo ANVISA.

**Independent Test**: `PAGE_GROUPS` e o menu da barra não listam
`/cadastro/anvisa`.

**Acceptance Scenarios**:

1. **AC-001** — Given um usuário autenticado, when a barra renderiza,
   then não há item com rótulo ANVISA nem destino `/cadastro/anvisa`.
2. **AC-002** — Given a tela de Usuários, when o admin escolhe páginas,
   then `/cadastro/anvisa` não aparece como página concedível.

---

### User Story 2 — Abrir o site oficial em Produtos (Priority: P1)

Como operador em Cadastros › Produtos, uso um botão que abre a consulta
pública de Produtos para Saúde no site da ANVISA.

**Independent Test**: O cabeçalho de Produtos tem um link externo para
`https://consultas.anvisa.gov.br/#/saude/` com `target=_blank` e
`rel=noopener noreferrer`.

**Acceptance Scenarios**:

1. **AC-003** — Given a tela de Produtos, when o operador aciona
   “Consulta ANVISA”, then o navegador abre o portal oficial de
   Produtos para Saúde numa nova aba.
2. **AC-004** — Given o mesmo botão, when o HTML é inspecionado, then
   o destino é exatamente a URL pública de Produtos para Saúde e o
   link não aponta para `/cadastro/anvisa`.

---

### User Story 3 — Validação ANVISA do cadastro continua (Priority: P1)

Como editor em Produtos, continuo validando código ANVISA no detalhe
do produto. A API de consulta interna não depende mais da página
retirada da barra.

**Independent Test**: `requiredPagesForApi('/api/anvisa')` contém
`/cadastro/produtos` e não exige `/cadastro/anvisa`.

**Acceptance Scenarios**:

1. **AC-005** — Given um viewer só com `/cadastro/produtos`, when chama
   `/api/anvisa/validate`, then o ACL de página autoriza.
2. **AC-006** — Given um viewer só com `/fiscal/invoices`, when chama
   `/api/anvisa/validate`, then o ACL de página recusa.

### Edge Cases

- `allowedPages` antigo ainda contendo `/cadastro/anvisa`: a entrada
  fica órfã; não reaparece na barra nem em Usuários. O usuário com
  Produtos segue com o botão.
- A rota `/cadastro/anvisa` pode continuar existindo por bookmark; não
  é mais destino da barra.
- O portal da ANVISA pode recusar embed; o botão não depende de iframe.

## Requirements

### Functional Requirements

- **FR-001**: A barra MUST NOT exibir item ANVISA nem link para
  `/cadastro/anvisa`.
- **FR-002**: `PAGE_GROUPS` MUST NOT listar `/cadastro/anvisa` como
  página concedível.
- **FR-003**: A tela de Produtos MUST oferecer um controle que abre
  `https://consultas.anvisa.gov.br/#/saude/` em nova aba, com
  `rel="noopener noreferrer"`.
- **FR-004**: `/api/anvisa` MUST ser gated por `/cadastro/produtos`.
- **FR-005**: O botão MUST NOT navegar para a tela interna
  `/cadastro/anvisa`.

## Success Criteria

- **SC-001**: Um operador encontra a consulta oficial em no máximo um
  clique a partir de Produtos, sem item extra na barra.
- **SC-002**: Usuários com acesso a Produtos continuam usando a
  validação de registro ANVISA no cadastro.
- **SC-003**: Revertida a mudança, os testes de navegação e do botão
  reprovam.

## Assumptions

- A URL pública de Produtos para Saúde permanece
  `https://consultas.anvisa.gov.br/#/saude/`.
- Não há mudança de schema.
- A tela interna de embed pode permanecer no código; some só da
  navegação e das permissões concedíveis.

## Out of Scope

- Consulta de Medicamentos no portal da ANVISA.
- Apagar a rota `/cadastro/anvisa` e as APIs de embed-status.
- Alterar a validação de código ANVISA no detalhe do produto.
