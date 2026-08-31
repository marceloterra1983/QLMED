---
id: SPEC-032
status: approved
owner: QLMED
affected_modules:
  - gestao-impcg-ui
  - gestao-impcg-api
  - gestao-impcg-parse
---

# Feature Specification: Revisão da página de autorizações IMPCG

**Feature Branch**: `fix/impcg-page-review`

**Created**: 2026-08-31

**Status**: Approved

**Input**: Pedido do operador — "na tabela, manter somente o tag parcial, a
explicação do que faltou deixar dentro do popup, acho que esta página precisa
de uma revisão para funcionar adequadamente, os anexos não estão abrindo
rapidamente".

## Problem

Em produção há 97 autorizações IMPCG, 80 delas com `parseStatus = parcial`.
A tabela imprime o texto completo do que faltou (`Faltou: CRM, procedimento,
…`) ao lado do número do ofício em cada linha, então 80 de 97 linhas carregam
um parágrafo de diagnóstico e a coluna "Nº" fica ilegível.

Abrir o anexo é lento por construção, não por volume: o `<iframe>` do pdf.js
só é montado depois que o JSON de detalhe responde, e a rota
`/api/gestao/impcg/[id]/arquivo` baixa o PDF inteiro do OneDrive para um
`Buffer` antes de emitir o primeiro byte. São dois atrasos em série antes de
o visualizador receber qualquer dado.

O ofício 12741 mostra `issuedAt = 2034-06-26`. O parser aceita qualquer ano
entre 1990 e 2100, então um "2024" lido errado pelo OCR vira uma data futura
que é exibida como se fosse verdade.

## Requirements

- **FR-001**: A tabela (desktop) e os cards (mobile) MUST exibir apenas o
  chip curto de status (`Parcial` / `Falha`). O texto do que faltou MUST NÃO
  aparecer na linha da lista.
- **FR-002**: O modal de detalhe MUST exibir o texto completo do que faltou
  (`parseMissingReason`) junto do status de leitura.
- **FR-003**: O `<iframe>` do visualizador de PDF MUST ser montado assim que
  a autorização é selecionada, sem esperar a resposta do JSON de detalhe, de
  forma que o download do anexo e o do detalhe corram em paralelo.
- **FR-004**: `/api/gestao/impcg/[id]/arquivo` MUST repassar o corpo da
  resposta do OneDrive em streaming, sem bufferizar o arquivo inteiro antes
  de responder. A rota MUST continuar exigindo sessão e acesso à página.
- **FR-005**: A rota do anexo MUST registrar `durationMs` e `bytes` por
  requisição, para que a latência seja mensurável em produção.
- **FR-006**: O parser MUST rejeitar data de emissão no futuro, caindo para
  a próxima data candidata do documento ou para `null`. Data inexistente é
  preferível a data inventada.
- **FR-007**: `describeImpcgParseGap` MUST relatar `data inválida` quando a
  linha persistida tiver `issuedAt` no futuro, para que registros já gravados
  antes desta correção apareçam como pendência em vez de dado bom.
- **FR-008**: A tabela MUST NÃO exibir data futura como se fosse válida;
  nesses casos exibe o marcador de ausência (`—`).

## Failure cases

- OneDrive responde erro ou expira: a rota devolve o erro atual da API, sem
  vazar detalhe do Graph, e o visualizador mostra falha em vez de ficar
  girando.
- Autorização sem `oneDriveItemId` ou sem conexão OneDrive: 404, comportamento
  preservado.
- PDF sem nenhuma data legível: `issuedAt` fica `null` e o gap lista `data`.

## Test strategy

- Vitest cobrindo `parseOficio` com data futura (esperado: `issuedAt` nulo ou
  a data passada válida do documento) e `describeImpcgParseGap` com
  `issuedAt` futuro (esperado: `data inválida`).
- Vitest de contrato garantindo que a rota do anexo responde com o corpo em
  streaming e `Content-Type: application/pdf`.
- `npx tsc --noEmit`, `npm run lint` e `npm test` no pipeline habitual.

## Out of scope

Paginação da lista (97 linhas cabem numa resposta). Cache de PDF em disco ou
CDN. Reprocessamento em massa do parse das 80 linhas parciais já gravadas.
Alterações equivalentes na página CASSEMS, que compartilha o formato mas não
foi pedida.
