# Research: SPEC-080

## Decision: retry de 401 no transporte Graph, não em cada caller

Callers recebem `accessToken` e fazem dezenas de GETs (sync XML, ingestão).
Envolver cada um com `try/refresh/retry` é incompleto: o token morre no
**meio** do loop. Transporte único cobre listagem, download e upload.

## Decision: binder por access token, lock por connection id

O Graph layer não pode importar Prisma (ciclo: connections → client → graph).
O binder vive em módulo sem Prisma. Dois 401 paralelos da mesma conexão
esperam o mesmo refresh (refresh token do Microsoft pode rotacionar).

## Decision: Graph Mail é a mesma classe

`tokenCache.expiresAt` com −60 s não cobre relógio do Graph nem job longo.
401 hoje vira `mailbox_forbidden`. Forçar token novo uma vez distingue
JWT morto de mailbox sem permissão.

## Alternatives rejected

- Só alargar a janela de 2 min: não cobre job > expiração.
- ALS: padrão novo no repo.
- Retry de 401 no `fetchWithResilience`: 401 não é transiente; o teste
  já exclui 401 de `isTransientHttpStatus`.
