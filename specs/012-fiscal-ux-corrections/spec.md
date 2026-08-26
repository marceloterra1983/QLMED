---
id: SPEC-012
status: implemented
owner: QLMED
affected_modules:
  - produtos-ui
  - financeiro-ui
  - fiscal-dashboard
  - api-fiscal
---

# Feature Specification: Correções de UX fiscal e financeira

**Feature Branch**: `fix/ux-criticos-p1`

**Created**: 2026-08-26 (retroativa — ver "Nota de processo")

**Status**: Implemented

**Input**: Três achados críticos do levantamento de leitura das 19 telas do painel.

## Nota de processo

Esta especificação é **retroativa**, escrita depois da implementação (commit `4310f17`), em resposta a revisão automatizada que apontou, com razão, a ausência do artefato Spec Kit exigido por `AGENTS.md`: *"Spec Kit remains the mandatory gate for behavior, contracts, data, security, operations or architecture changes."*

As três correções mudam comportamento observável, e uma delas muda **contrato de API**. A evidência de aceitação existia, mas num `GATES.md` avulso na raiz do repositório, sem rastreabilidade — que é exatamente a lacuna apontada. Ela foi movida para [evidence.md](./evidence.md) neste diretório.

Registrado como retroativo em vez de antedatado: a ordem correta seria spec antes do código.

## User Scenarios & Testing

### User Story 1 - Ver o resumo do cadastro de produtos (Priority: P2)

Quem abre Cadastros › Produtos vê, acima da tabela, quantos produtos existem, quantos têm registro ANVISA e a quantidade total em estoque — números que a API já calculava e que ficavam apenas no estado do componente.

**Acceptance Scenarios**:

1. **Given** a lista carregada, **When** a tela renderiza, **Then** os três números aparecem e correspondem ao conjunto **filtrado** no momento.
2. **Given** a lista ainda carregando, **When** a tela renderiza, **Then** os cards não aparecem — nunca zeros piscando antes do valor real.
3. **Given** um filtro aplicado, **When** os números mudam, **Then** todos os três refletem o mesmo conjunto; nenhum é global enquanto os outros são filtrados.

---

### User Story 2 - Distinguir dinheiro entrando de dinheiro saindo (Priority: P1)

Em Contas a Receber, o valor de uma duplicata é visualmente distinto do de Contas a Pagar. O usuário não confunde recebimento com atraso.

**Why this priority**: É a correção de maior consequência. `FinanceiroTable` pintava todo valor de vermelho na visão mobile — a mesma cor de "vencida" —, apagando a distinção entre os dois sentidos numa tela financeira.

**Acceptance Scenarios**:

1. **Given** Contas a Receber, **When** a lista renderiza, **Then** o valor aparece em verde.
2. **Given** Contas a Pagar, **When** a lista renderiza, **Then** o valor aparece em vermelho.
3. **Given** uma duplicata a receber e **vencida**, **When** a linha renderiza, **Then** o valor segue verde e o selo de status segue vermelho — são dimensões independentes.
4. **Given** as visões desktop e mobile, **When** ambas renderizam, **Then** usam a mesma regra de cor.

---

### User Story 3 - Um período só na tela de Impostos (Priority: P1)

O período escolhido governa **toda** a tela, e o modo Trimestre é operável.

**Why this priority**: Dois defeitos que se reforçavam. O painel "Por CFOP" mostrava o ano inteiro enquanto os cards respeitavam o filtro — dois números discordando lado a lado numa tela fiscal. E o modo Trimestre não tinha seletor: o trimestre era derivado de um `month` que só aparecia no modo Mês, tornando T2–T4 inalcançáveis.

**Acceptance Scenarios**:

1. **Given** o modo Trimestre, **When** a tela renderiza, **Then** há um seletor T1–T4 e escolher T3 muda os dados.
2. **Given** qualquer período, **When** cards, tabela mensal e painel CFOP renderizam, **Then** todos cobrem o **mesmo** intervalo.
3. **Given** qualquer período, **When** um painel renderiza, **Then** seu cabeçalho nomeia o intervalo ativo (ex.: "abr–jun 2026").

### Edge Cases

- Fevereiro em ano bissexto: o intervalo do mês termina em 29.
- Trimestre ancorado em qualquer mês do trimestre produz o mesmo intervalo.
- Campo de resumo que a API não calcula: **não** deve ser exibido. Ver FR-004.

## Requirements

### Functional Requirements

- **FR-001**: A tela de Produtos MUST exibir os campos de `ProductsSummary` que a API de fato calcula, e MUST ocultá-los enquanto `loading`.
- **FR-002**: A cor do valor de uma duplicata MUST derivar do sentido (`pagar`/`receber`), por função única, aplicada igualmente em desktop e mobile.
- **FR-003**: A cor de **status** da duplicata MUST permanecer independente da cor de valor.
- **FR-004**: Nenhum campo de resumo constante ou não calculado MUST ser apresentado como métrica. `invoicesProcessed` valia `0` fixo em `products/list/route.ts` e foi **removido** da API, do tipo e da tela — exibi-lo teria transformado campo morto em número errado.
- **FR-005**: `/api/fiscal/by-cfop` MUST aceitar os mesmos parâmetros de período que `/api/fiscal/dashboard` (`period`, `year`, `month`).
- **FR-006**: O cálculo do intervalo MUST ter fonte única, consumida pelas duas rotas, de modo que não possam divergir.
- **FR-007**: O modo Trimestre MUST oferecer seleção explícita de T1–T4.
- **FR-008**: Cada painel da tela de Impostos MUST nomear o intervalo que está exibindo.

### Contract Change

`GET /api/fiscal/by-cfop` — **mudança de contrato**, registrada por exigência do gate:

| | Antes | Depois |
|---|---|---|
| Query | `year` | `period`, `year`, `month` |
| Resposta | `{ year, byCfop }` | `{ period: { type, year, month, startDate, endDate }, byCfop }` |

Compatibilidade: o único consumidor é `fiscal/dashboard/page-client.tsx`, que lia apenas `data.byCfop` — inalterado. `year` sozinho descrevia mal o conteúdo assim que a rota passou a aceitar recortes menores que um ano.

## Success Criteria

- **SC-001**: Contas a Pagar e a Receber produzem cores de valor diferentes, verificado por asserção de igualdade exata.
- **SC-002**: Os quatro trimestres produzem intervalos corretos, incluindo bissexto.
- **SC-003**: `dashboard` e `by-cfop` derivam o intervalo da mesma função.
- **SC-004**: Nenhum número exibido na tela de Produtos vem de constante do servidor.
- **SC-005**: Revertida a correção, os testes correspondentes reprovam.

## Assumptions

- Escopo de empresa única.
- Sem mudança de esquema: nenhuma das três correções toca o banco.
- A remoção de `invoicesProcessed` é segura por não ter outro consumidor, verificado por varredura.

## Out of Scope

- Calcular de fato a contagem de NF-e processadas: exigiria ligação produto→nota que não existe no schema. Somar `aggInvoiceCount` contaria em dobro notas com vários produtos.
- Virtualização das tabelas financeiras e paginação real (achados de severidade alta do mesmo levantamento, não endereçados aqui).
