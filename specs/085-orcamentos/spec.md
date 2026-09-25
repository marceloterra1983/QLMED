---
id: SPEC-085
status: approved
owner: QLMED
affected_modules:
  - navigation
  - orcamentos
  - cadastro-clientes
  - cadastro-produtos
  - pdf
---

# Feature Specification: Orçamentos comerciais (modelo SPICA H020)

**Feature Branch**: `feat/085-orcamentos`

**Created**: 2026-09-21

**Status**: Approved (pedido do dono em 2026-09-21: página de orçamentos com clientes/produtos do sistema; saída no modelo do PDF SPICA `H020_L_Orcamento_P`; item **Orçamentos** no topo do sidebar, acima de **Documentos**)

**Input**: "Desenvolva uma pagina para realizar o orçamentos baseados em tudo que temos do sistema, com clientes, produtos, etc. [PDF exemplo]. escreva uma spec, estudo sobre como deve ser a pagina e cria no topo do sidebar a pagina Orçamentos (acima da pagina Documentos)"

## Problem

A QL MED emite orçamentos comerciais no layout SPICA (paisagem, cabeçalho da empresa, cliente, tabela de itens com R.V.S./NCM, totais, paciente/médico/convênio/local). No QLMED isso ainda é feito fora do sistema: o cadastro de clientes, o catálogo de produtos (código, NCM, ANVISA, último preço de venda) e o gerador de PDF já existem, mas não há um fluxo que os una num documento numerado, persistido e imprimível.

## Roles and ownership

- **Actor**: usuário autenticado com a página `/orcamentos` em `allowedPages`, ou `admin`.
- **Leitura** (listar, abrir, baixar PDF): qualquer papel com a página.
- **Mutação** (criar, editar, duplicar, cancelar): `editor` ou `admin` (`requireEditor` nas rotas de escrita).
- **Company isolation**: `companyId` via `getOrCreateSingleCompany` a partir da sessão; nunca do body nem da query.
- **ACL de APIs vizinhas**: a página Orçamentos **não** abre `/api/products` (admin de catálogo) nem `/api/customers` (ficha completa). Busca de cliente e produto para o orçamento passa por `/api/orcamentos/*`.

## User Scenarios & Testing

### User Story 1 — Ver e abrir Orçamentos no menu (Priority: P1)

Operador autenticado com a página concedida vê **Orçamentos** no topo do sidebar, imediatamente acima de **Documentos**, sem seção. Clica e chega à listagem. Sem a página, o item não aparece e a rota/API respondem 403.

**Why this priority**: sem o atalho e a ACL, o resto do módulo é invisível ou aberto demais.

**Independent Test**: conferir `PAGE_GROUPS`, `PAGE_LABELS`, `buildNavItems` e o teste de conjunto de caminhos; HTTP da rota e prefixo `/api/orcamentos`.

**Acceptance Scenarios**:

1. **Given** admin, **When** abre o painel, **Then** o primeiro grupo do sidebar (sem seção) tem Orçamentos e depois Documentos.
2. **Given** viewer só com `/cadastro/documentos`, **When** pede `/orcamentos` ou `/api/orcamentos`, **Then** 403.
3. **Given** editor com `/orcamentos`, **When** pede `/api/products`, **Then** 403 (o orçamento não libera o admin de produtos).

---

### User Story 2 — Montar um orçamento com cliente e produtos (Priority: P1)

Operador cria um orçamento: escolhe um cliente do cadastro (CNPJ, razão, IE, endereço), busca produtos **em linha**, informa quantidade/preço/desconto, preenche paciente, médico, convênio, local, frete e observação. O sistema calcula subtotal e total em dinheiro com arredondamento half-up de 2 casas. Ao salvar, recebe número sequencial de 8 dígitos (ex.: `00008319`).

**Why this priority**: é o valor operacional; substitui o SPICA para o dia a dia.

**Independent Test**: gravar um orçamento com 1 item conhecido e conferir totais e número.

**Acceptance Scenarios**:

1. **Given** cliente cadastrado e produto em linha, **When** adiciona 1 UN a 3800,00 sem desconto e frete 0, **Then** subtotal = 3800,00 e total = 3800,00.
2. **Given** dois itens 10,005 e 0,005 a 1,00, **When** soma, **Then** cada linha e o subtotal usam Decimal half-up (não float IEEE-754).
3. **Given** produto fora de linha, **When** busca o catálogo do orçamento (filtro padrão), **Then** não aparece; o operador pode ligar “incluir fora de linha”.
4. **Given** orçamento sem cliente ou sem itens, **When** salva, **Then** 400 com mensagem clara.

---

### User Story 3 — PDF no modelo SPICA H020 (Priority: P1)

Operador gera/baixa o PDF do orçamento salvo. A folha é **A4 paisagem** e contém, nesta ordem visual: cabeçalho da QL MED (razão, CNPJ, IE, endereço, fone, e-mail, data, página); título **ORÇAMENTO**; número, data, cliente, código (se houver), endereço, CNPJ, IE, vendedor; tabela Ítem / Código / Descrição / R.V.S. / NCM / Un. / Qtde. / Pr. Un. / Desc. / Total; Sub-Total, Frete, Total; paciente, médico, convênio, local; observação; fecho “Atenciosamente” com os contatos comerciais. Não reproduz o rodapé Joinner/SPICA.

**Why this priority**: o dono entregou o PDF como contrato de saída.

**Independent Test**: HTML gerado a partir de um fixture igual ao PDF de exemplo contém os campos-chave; visual conferido no preview.

**Acceptance Scenarios**:

1. **Given** o fixture equivalente ao PDF `spica_h020_l_orcamento_p luiz carlos de almeida.pdf`, **When** gera o HTML, **Then** constam número, cliente, item 4326202, R.V.S., NCM, 3.800,00, paciente LUIZ CARLOS DE ALMEIDA, médico, convênio e local.
2. **Given** orçamento cancelado, **When** gera PDF, **Then** marca d'água **CANCELADO**.
3. **Given** sessão sem a página, **When** pede o PDF, **Then** 401/403; o PDF não vaza para outra empresa.

---

### User Story 4 — Reabrir, duplicar e cancelar (Priority: P2)

Operador reabre um orçamento da lista, ajusta itens e reimprime. Duplicar cria um **novo** número com os mesmos dados. Cancelar impede edição; o registro permanece.

**Why this priority**: o fluxo diário inclui revisão e reaproveitamento; não é o MVP mínimo, mas cabe na mesma entrega.

**Independent Test**: duplicar incrementa o número; cancelado recusa PATCH.

**Acceptance Scenarios**:

1. **Given** orçamento 00008318, **When** duplica, **Then** nasce 00008319 em rascunho com os mesmos itens e cliente.
2. **Given** orçamento cancelado, **When** PATCH, **Then** 409.

---

### Edge Cases

- Cliente sem endereço completo: o PDF imprime o que houver; não bloqueia o orçamento (diferente da emissão de NF-e).
- Preço de venda ausente no produto: o campo preço inicia em 0,00 e o operador informa.
- Quantidade ≤ 0 ou preço negativo: recusa.
- Desconto maior que `qtde × preço`: recusa.
- Dois operadores salvando ao mesmo tempo: o número sequencial não colide (`@@unique` empresa+número + transação).
- Busca vazia de produtos: devolve a primeira página em linha, não o catálogo inteiro sem limite.
- `viewer` vê e imprime; os botões de gravar/cancelar não disparam mutação (servidor recusa).

## Requirements

### Página e navegação

- **FR-001**: Existe a página `/orcamentos` em `PAGE_GROUPS` (seção **Comercial**, primeiro grupo), `PAGE_LABELS` e `buildNavItems`. No sidebar o item **Orçamentos** fica no grupo sem seção, **acima** de **Documentos**. Em `PAGE_GROUPS` **não** mora dentro de Cadastros (o picker de ACL mostra Comercial › Orçamentos).
- **FR-002**: Prefixo `/api/orcamentos` mapeado **somente** para `/orcamentos` em `API_PREFIX_TO_PAGES`. Prefixo não mapeado continua default-deny.
- **FR-003**: Listagem com PageHeader “Orçamentos”, busca (número/cliente), filtro de situação, tabela (número, data, cliente, total, situação, ações) e botão **Novo orçamento** (editor+). Sem `alert`/`confirm` nativos.
- **FR-004**: Editor em `/orcamentos/novo` e `/orcamentos/{id}`: bloco cliente (busca typeahead no cadastro), bloco clínico (paciente, médico, convênio, local, vendedor), tabela de itens com busca de produto, quantidade, preço unitário, desconto em valor, totais, frete, observação, Salvar, Gerar PDF, Duplicar, Cancelar.

### Dados de cliente e produto

- **FR-005**: Cliente vem do acervo de **clientes** (destinatários de NF-e emitida + ficha fiscal + override de endereço). Snapshot no orçamento: nome, CNPJ, IE, endereço (logradouro, número, bairro, município, UF, CEP), código interno se existir. Mudança posterior no cadastro **não** altera orçamento já gravado até o operador reescolher o cliente. A busca casa nome abreviado (`ContactNickname.shortName`), razão social e CNPJ, sem acento. Quem casa pelo nome abreviado aparece antes de quem casa só pela razão. A lista e o resumo mostram o abreviado em destaque; o PDF continua com a razão social.
- **FR-006**: Produto vem de `ProductRegistry` da empresa. Busca padrão: **em linha** (`outOfLine` nulo ou falso), por descrição/código/NCM/ANVISA. Ao escolher, copia código (`codigo` ou `code`), descrição, R.V.S. (`anvisaCode`), NCM, unidade e sugere preço = último preço de venda (`aggLastSalePrice`) ou, se ausente, último preço de compra (`aggLastPrice`). O operador pode editar descrição e preço da linha (snapshot).
- **FR-007**: Valores monetários e totais usam Decimal half-up 2 casas (`src/lib/money.ts`). Quantidade admite até 4 casas. Proibido `number` IEEE-754 como fonte de verdade do total persistido.

### Persistência e número

- **FR-008**: Modelos Prisma `Quote` + `QuoteItem`, migração expand-only pinada no portão de produção. Número inteiro sequencial por empresa, impresso com 8 dígitos. Situações: `draft`, `issued`, `cancelled`. Primeiro save cria `draft` com número. “Gerar PDF” marca `issued` se ainda for rascunho. Cancelar só `editor+`, não apaga linhas.
- **FR-009**: Totais persistidos (`subtotal`, `freight`, `total`) são os calculados no servidor a partir das linhas; o cliente não manda o total como autoridade.

### PDF

- **FR-010**: `GET /api/orcamentos/{id}/pdf` devolve `application/pdf` (inline ou `?download=1` attachment). HTML autocontido, CSS inline, sem script/rede — mesmo `renderHtmlToPdf` do DANFE. Paisagem A4. Cabeçalho emissor: dados da `Company` + ficha fiscal/override do CNPJ da empresa; se faltar endereço/IE/fone, usa o timbre conhecido da QL MED (o mesmo do PDF exemplo). Rodapé comercial padrão (Flavio, Daniele, Marcelo) editável só via observação nesta entrega — os três e-mails do exemplo são o fecho fixo.
- **FR-011**: O PDF **não** é documento fiscal, **não** baixa estoque e **não** cria NF-e.

### Falhas

- **FR-012**: Sem sessão → 401. Sem página → 403. Orçamento de outra empresa → 404 (não 403, para não vazar existência). Validação Zod → 400. Conflito de cancelado → 409. Falha de PDF (Chromium ausente) → 503 com mensagem operacional, sem stack.

## Key Entities

- **Orçamento (Quote)**: documento comercial numerado da empresa; snapshot do cliente; campos clínicos; frete; observação; situação; totais.
- **Item (QuoteItem)**: linha com snapshot de produto, quantidade, preços e total da linha.
- **Cliente / Produto**: entidades já existentes; o orçamento só lê e copia.

## Success Criteria

- **SC-001**: Um operador que já conhece o SPICA completa um orçamento de 1 item com cliente existente em menos de 2 minutos na primeira tentativa.
- **SC-002**: O PDF gerado para o fixture do exemplo contém os mesmos campos de negócio que o PDF SPICA (número, cliente, item, valores, paciente/convênio/local), sem o rodapé Joinner.
- **SC-003**: 100% dos totais de teste usam Decimal; nenhum teste de orçamento persiste dinheiro em `float`/`double`.
- **SC-004**: Utilizador sem `/orcamentos` não vê o item e não lê API/PDF.

## Assumptions

- Uma empresa (QL MED); timbre padrão é o do PDF exemplo quando o cadastro da empresa não tem endereço.
- Código SPICA do cliente (`Cód.: 00571`) não existe no QLMED; o campo fica vazio a menos que venha de um override futuro. Não inventar código.
- Validade comercial explícita (ex.: “15 dias”) não aparece no PDF exemplo; v1 não imprime prazo de validade.
- WhatsApp/e-mail do PDF, conversão em NF-e e baixa de estoque ficam fora.
- Operadores atuais com lista explícita de páginas **não** ganham Orçamentos automaticamente; o admin concede no picker. `admin` já vê tudo.

## Non-functional

- Listagem pagina (50). Busca de produto/cliente limita 20.
- PDF: timeout já existente de 30s do renderer.
- UI em pt-BR, ícones Material Symbols Outlined, componentes do painel (sem shadcn).

## Applicable ADRs

- [ADR-0007](../../docs/decisions/0007-single-canonical-database.md) — persistência Prisma/migração.
- Isolamento de empresa e ACL default-deny (constituição II; AUTH-005).

## Test strategy

- Unitário: totais Decimal; formatação do número; HTML do PDF com fixture SPICA; ACL (`orcamentos-acl`, `sidebar-nav-paths`, `navigation`).
- UI: listagem e editor renderizam título, busca e botão Novo.
- Migração: pin SHA no portão de produção + teste do pin.
- Preview `:3002` após apontar o cwd para esta worktree.

## Out of scope

- Emissão de NF-e a partir do orçamento.
- Baixa de estoque / reserva de lote.
- Assinatura digital, XML fiscal, SEFAZ.
- Multi-moeda, tabela de preço por convênio, aprovação hierárquica.
- Importação em lote dos orçamentos históricos do SPICA.
- Envio automático por WhatsApp/e-mail (reimpressão/download manual nesta entrega).
- Cadastro novo de cliente/produto de dentro do orçamento (usa os cadastros existentes).
