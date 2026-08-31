---
id: SPEC-033
status: approved
owner: QLMED
affected_modules:
  - gestao-cassems-ui
  - gestao-cassems-api
  - gestao-cassems-parse
---

# Feature Specification: Revisão da página de autorizações CASSEMS

**Feature Branch**: `fix/cassems-page-review`

**Created**: 2026-08-31

**Status**: Approved

**Input**: Replicar em CASSEMS a revisão aprovada para IMPCG na SPEC-032 — chip
sozinho na tabela, explicação do parse no popup, anexo abrindo sem espera em
série e data de emissão futura tratada como leitura errada.

## Problem

CASSEMS e IMPCG são convênios espelhados: a página, a rota do anexo e o parser
seguem o mesmo desenho. Os três defeitos corrigidos na SPEC-032 estão presentes
no código CASSEMS, sem nenhuma divergência que os atenue.

`ParseBadge` em `gestao/cassems/page-client.tsx` imprime o texto completo do que
faltou (`Faltou: CRM, procedimento, …`) ao lado do número da autorização, tanto
na tabela desktop quanto nos cards mobile, deixando a coluna "Nº" ilegível assim
que houver linhas parciais. O mesmo texto aparece duas vezes no modal: no
`subtitle` e no campo "Leitura".

Abrir o anexo é lento por construção. O `<iframe>` do visualizador está dentro do
bloco `{detail && …}` e usa `detail.id`, então o download do PDF só começa depois
que o JSON de detalhe responde. Em série com isso,
`/api/gestao/cassems/[id]/arquivo` chama `downloadOneDriveItemContent()`, que faz
`Buffer.from(await response.arrayBuffer())` e materializa o arquivo inteiro na
memória do Node antes de emitir o primeiro byte.

`extractIssuedAt` aceita qualquer ano de quatro dígitos: não há faixa válida nem
barreira de data futura, e a função retorna a primeira data encontrada sem
considerar outras candidatas. Um "2024" lido como "2034" pelo OCR é persistido e
exibido como se fosse verdade. Na base de produção o defeito é hoje latente
(1 autorização CASSEMS, `parseStatus = ok`, nenhuma `issuedAt` no futuro), mas o
caminho de código que produziu a data impossível na IMPCG é o mesmo.

## Requirements

- **FR-001**: A tabela (desktop) e os cards (mobile) MUST exibir apenas o chip
  curto de status (`Parcial` / `Falha`). O texto do que faltou MUST NÃO aparecer
  na linha da lista.
- **FR-002**: O modal de detalhe MUST exibir o texto completo do que faltou
  (`parseMissingReason`) uma única vez, junto do status de leitura. O `subtitle`
  do modal MUST NÃO repetir esse texto.
- **FR-003**: O `<iframe>` do visualizador de PDF MUST ser montado a partir do id
  selecionado, sem esperar a resposta do JSON de detalhe, para que o download do
  anexo e o do detalhe corram em paralelo.
- **FR-004**: `/api/gestao/cassems/[id]/arquivo` MUST repassar o corpo da
  resposta do OneDrive em streaming, sem bufferizar o arquivo inteiro antes de
  responder, declarando `Content-Length` quando o Graph o informar. A rota MUST
  continuar exigindo sessão e acesso à página.
- **FR-005**: A rota do anexo MUST registrar `durationMs` e `bytes` por
  requisição, para que a latência seja mensurável em produção — a rota exige
  sessão autenticada e não pode ser medida de fora.
- **FR-006**: `extractIssuedAt` MUST rejeitar data fora da faixa plausível
  (1990–2100), data inexistente no calendário e data no futuro, caindo na próxima
  data candidata válida do documento ou em `null`. Data ausente é preferível a
  data inventada.
- **FR-007**: `describeCassemsParseGap` MUST relatar `data inválida` quando a
  linha persistida tiver `issuedAt` no futuro, para que registros gravados antes
  desta correção apareçam como pendência em vez de dado bom.
- **FR-008**: A lista e o modal MUST NÃO exibir data futura como se fosse válida;
  nesses casos exibem o marcador de ausência (`—`).

## Failure cases

- OneDrive responde erro ou expira: a rota devolve o erro atual da API, sem vazar
  detalhe do Graph, e o visualizador mostra falha em vez de ficar girando.
- Autorização sem `oneDriveItemId` ou sem conexão OneDrive: 404, comportamento
  preservado.
- PDF sem nenhuma data legível ou só com datas impossíveis: `issuedAt` fica
  `null`, `computeCassemsParseStatus` não pode marcar `ok` e o gap lista `data`.
- Graph não declara `content-length`: a rota responde sem `Content-Length`, em
  chunked, sem quebrar o visualizador.

## Test strategy

- Vitest cobrindo `extractIssuedAt` via `parseOficio` com data futura (esperado:
  cair na data passada válida do documento) e com data futura única (esperado:
  `issuedAt` nulo), mais `describeCassemsParseGap` com `issuedAt` futuro
  (esperado: `data inválida`).
- Vitest de contrato garantindo que a rota do anexo responde com o corpo em
  streaming, `Content-Type: application/pdf`, antes de o upstream terminar, e que
  registra `durationMs`.
- `npx tsc --noEmit`, `npm run lint`, `npm test` e `npm run docs:validate`.

## Out of scope

Migration Prisma e alteração de `prisma/schema.prisma` (outro fluxo em
andamento). Ordenação por clique nas colunas, paginação da lista, formatação
monetária (auditada: `Decimal` com `ROUND_HALF_UP`), estado vazio e toasts de
erro, todos já corretos. Reprocessamento em massa do parse de linhas já
gravadas. Cache de PDF em disco ou CDN.
