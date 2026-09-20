---
id: SPEC-077
status: approved
owner: QLMED
affected_modules:
  - fiscal-ui
  - financeiro-ui
  - invoices-api
  - sidebar-nav
related:
  - SPEC-012
  - SPEC-070
  - QLMED-UI-001
---

# Feature Specification: Paginação real das listas fiscais e financeiras

**Feature Branch**: `feat/077-fiscal-list-pagination`

**Created**: 2026-09-19

**Status**: Approved

**Input**: As listas fiscais pedem `limit=5000` e o financeiro `limit=2000`, saturando o processo Node. A lentidão observada não é o SQL da Invoice (~92 ms / 119 linhas) e sim o prefetch da sidebar + steal de CPU. SPEC-012 adiou paginação; SPEC-070 já pagina outros catálogos. SPEC-076 está ocupado por `jev-sefaz-followup` (worktree paralelo, não mergeado) — este recorte é 077.

## Problem

O operador abre NF-e recebidas/emitidas, CT-e, NFS-e ou contas a pagar/receber e o cliente pede milhares de linhas de uma vez. A API já sabe paginar (`page`/`limit`/`total`), mas a UI ignora isso. O rodapé usa `ListCount` (QLMED-UI-001) para não mentir o total quando o teto corta a lista; com paginação real, “lista truncada” deixa de ser o caminho feliz. O menu ainda faz prefetch de todas as rotas, competindo com a listagem.

## Roles and ownership

- **Actor**: usuário autenticado com a página em `allowedPages` (ou admin).
- **Mutação**: nenhuma nesta spec. Só leitura/listagem já autorizada.
- **Authorization**: inalterada; rotas continuam `requireAuth` no servidor.
- **Company isolation**: inalterada; `companyId` só via helpers canônicos. Identificadores no query string NÃO alargam o conjunto.

## User Scenarios & Testing

### User Story 1 — Folhear a lista fiscal em páginas (Priority: P1)

Como operador, vejo no máximo uma página de 50 a 100 documentos fiscais e avanço/volto sem recarregar milhares de linhas.

**Why this priority**: é a causa da saturação do processo ao abrir Fiscal.

**Independent Test**: abrir NF-e recebidas com mais documentos no filtro do que o tamanho da página; a primeira resposta traz só a página; Anterior/Próxima mudam o conjunto.

**Acceptance Scenarios**:

1. **AC-077-001** — Given filtro com mais documentos do que o tamanho da página, when a lista fiscal carrega, then a UI MUST pedir `limit` entre 50 e 100 e MUST NOT pedir 5000.
2. **AC-077-002** — Given página 1 de N, when o operador clica Próxima, then a UI MUST pedir `page=2` com o mesmo filtro e mostrar outro conjunto.
3. **AC-077-003** — Given uma única página (total ≤ tamanho), when a lista carrega, then os botões de página MAY ocultar-se e o rodapé MUST mostrar o total sem aviso de truncamento.

### User Story 2 — Contas a pagar/receber paginadas (Priority: P1)

Como operador financeiro, folheio duplicatas em páginas de 50 a 100 em vez de baixar 2000 de uma vez.

**Why this priority**: o cliente já tem estado `page`/`limit=50` mas força `limit=2000`.

**Independent Test**: GET de contas a pagar na UI usa o `limit` da página (50–100), não 2000.

**Acceptance Scenarios**:

1. **AC-077-004** — Given a tela de contas a pagar ou receber, when carrega, then MUST pedir `limit` entre 50 e 100.
2. **AC-077-005** — Given total maior que a página, when o operador avança, then MUST pedir a página seguinte e o rodapé MUST informar quantos registros existem no filtro.

### User Story 3 — Contagem honesta (QLMED-UI-001) (Priority: P1)

Como operador, sei quantos documentos existem no filtro e quantos estou vendo nesta página, sem achar que conferi o período inteiro.

**Why this priority**: a auditoria b177b07 proibiu imprimir `pagination.total` como se fosse o que está na tela.

**Independent Test**: as quatro listas fiscais só escrevem a contagem via `ListCount`; com paginação, o texto descreve intervalo da página, não “lista truncada”.

**Acceptance Scenarios**:

1. **AC-077-006** — Given 1234 notas no filtro e página de 50, when a página 1 renderiza, then `ListCount` MUST indicar que está mostrando um recorte (ex.: 1–50 de 1234), não 1234 notas como se todas estivessem na tabela.
2. **AC-077-007** — Given total igual ao carregado (cabe numa página), when renderiza, then MUST mostrar `{total} {noun}` sem aviso de truncamento.
3. **AC-077-008** — Given as quatro listas fiscais, when a contagem é impressa, then MUST passar por `ListCount` (único ponto de escrita).

### User Story 4 — Menu sem prefetch (Priority: P2)

Como operador, ao carregar o painel o menu NÃO dispara o download antecipado de todas as rotas pesadas.

**Why this priority**: o diagnóstico atribui steal/CPU ao prefetch do Next, não ao SQL.

**Independent Test**: `SidebarNav` renderiza `Link` com prefetch desligado.

**Acceptance Scenarios**:

1. **AC-077-009** — Given o menu lateral, when um item é um `Link` do Next, then MUST usar `prefetch={false}`.

## Requirements

- **FR-077-01**: As listas de NF-e recebidas, NF-e emitidas, CT-e e NFS-e MUST pedir paginação no servidor com tamanho de página entre 50 e 100.
- **FR-077-02**: Contas a pagar e contas a receber MUST pedir o mesmo intervalo de tamanho de página (deixar de forçar 2000).
- **FR-077-03**: `GET /api/invoices` MUST continuar autenticando e isolando por empresa; MUST contar o total só quando necessário (página 1 incompleta usa o comprimento; páginas seguintes podem omitir `COUNT` se o cliente já tem o total).
- **FR-077-04**: `ListCount` MUST permanecer o único escritor da contagem nas quatro listas fiscais e MUST distinguir página vs truncamento silencioso.
- **FR-077-05**: A UI de paginação MUST estar em pt-BR (Anterior / Próxima, página X de Y).
- **FR-077-06**: `SidebarNav` MUST desligar prefetch nos links do menu.
- **FR-077-07**: Filtro, busca, ano ou ordenação MUST voltar para a página 1.

## Failure cases

- Sem sessão: a API continua 401; a UI não pagina dados de outro tenant.
- Página além do total: o servidor normaliza ou devolve lista vazia; a UI não inventa linhas.
- Falha de rede: toast de erro existente; não zerar o total conhecido sem evidência.

## Non-functional

- Uma página de lista não deve puxar milhares de documentos só para preencher a tabela.
- Sem migration. Sem pacote novo. Sem mock de auth/isolamento.

## Out of scope

- bcryptjs, workers NSDocs, Docker na vps2, upgrade Hostinger.
- Virtualização de tabela (SPEC-012 ainda adia isso).
- Entrada NF-e, produtos, clientes/fornecedores (já paginados ou padrão A em memória).
- Reescrever o carregamento in-memory das duplicatas no servidor (o GET já fatiava; o cliente ignorava).
- Export CSV completo além da página visível (o dump antigo também era capado).

## Assumptions

- Tamanho canônico da página de lista = 50 (dentro de 50–100), alinhado a Produtos.
- Teto da API de invoices (5000) e financeiro (2000) permanece para consumidores que não são a tabela (ex.: export legado); a UI das listas não usa esses tetos.
- Número 077 (não 076) porque `specs/076-jev-sefaz-followup` já existe em worktree paralelo.

## Success criteria

- **SC-077-01**: Operador folheia listas fiscais/financeiras sem a UI pedir 5000/2000 linhas.
- **SC-077-02**: Rodapé nunca afirma que o período inteiro está na tela quando só uma página foi carregada.
- **SC-077-03**: Menu não faz prefetch das rotas.
- **SC-077-04**: `npm test`, `docs:validate` e typecheck/lint passam.

## Test strategy

- Teste puro de `shouldCountListTotal` e constantes de page size.
- Atualizar `audit-data-display` (FR antigo de limit 5000 → page size 50–100).
- Render das listas fiscais: URL com `limit` no intervalo; `ListCount` paginado.
- `sidebar-nav-paths` (ou teste irmão) garante `prefetch={false}`.
- Sem mock de `requireAuth` / isolamento de empresa.
