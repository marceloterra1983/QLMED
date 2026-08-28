# Research: SPEC-021

## Decision: Cabeçalho só venda (contagem e valor)

- **Decision**: Quantidade e total do cabeçalho usam o mesmo predicado
  da SPEC-018 (`cfopTag === 'Venda'` / `getCfopTagByCode`).
- **Rationale**: O pedido é “somar somente as notas de vendas”. Manter
  a contagem de todas as linhas e somar só venda mentiria a quantidade.
- **Alternatives considered**: (1) Dois totais no cabeçalho — fora de
  escopo. (2) Contar todas e somar só venda — rejeitado por inconsistência.

## Decision: Linhas de não-venda continuam no corpo

- **Decision**: Não filtrar a lista; só o cabeçalho muda.
- **Rationale**: A SPEC-018 já resolveu a visibilidade com `(CONSIG.)`.
- **Alternatives considered**: Omitir não-venda do WhatsApp — o grupo
  deixaria de ver remessa/devolução do dia.

## Decision: Soma canônica no TypeScript; n8n replica

- **Decision**: `summarizeIssuedDailySalesHeader` em `src/lib` é a
  evidência. O node `Montar Resumo` filtra com `isVenda` já existente.
- **Rationale**: Constituição IV; o envio real ainda é o n8n (SPEC-018).
- **Alternatives considered**: Endpoint que devolve o texto pronto —
  escopo maior, sem pedido. Importar TS no n8n — inviável.

## Decision: `cancelledAt` exclui da soma

- **Decision**: Se o item tiver `cancelledAt` truthy, não entra no
  cabeçalho. SPEC-020 já está em `main` e a lista devolve o campo.
- **Rationale**: Nota cancelada não é venda vigente.
- **Alternatives considered**: Esperar outro PR — desnecessário após o
  merge da 020.

## Decision: Rótulos do cabeçalho

- **Decision**: `Notas de venda` e `Valor de vendas` no lugar de
  `Notas emitidas` / `Valor total`.
- **Rationale**: FR-005 — o grupo não deve achar que o número é o de
  todas as linhas listadas.
