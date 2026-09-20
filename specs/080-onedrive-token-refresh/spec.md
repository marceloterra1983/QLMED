---
id: SPEC-080
status: approved
owner: QLMED
affected_modules:
  - onedrive
  - graph-mail
  - documentos-ingest
  - local-xml-sync
related:
  - SPEC-071
  - SPEC-042
---

# Feature Specification: Renovar token Graph expirado sem falhar a operação

**Feature Branch**: `feat/080-onedrive-token-refresh`

**Created**: 2026-09-19

**Status**: Approved

**Input**: Falha na API do OneDrive com
`InvalidAuthenticationToken` / "Lifetime validation failed, the token is
expired". Corrigir e varrer o código por bugs da mesma classe.

## Problem

O access token do Microsoft Graph (OneDrive delegado e caixa de e-mail
app-only) tem vida curta (~1 h). O sistema hoje só renova o token OneDrive
quando o relógio local diz que falta pouco para expirar. Se o Graph recusar
o JWT no meio de um sync, download ou listagem — token já morto, relógio
ainda “válido”, ou job longo — a operação aborta com o JSON cru do Graph.
O operador precisa reconectar a conta ou repetir o fluxo à mão.

A caixa Graph (IMPCG/CASSEMS/cartas) tem o mesmo padrão: cache em memória
com folga de 60 s, mas 401 vira `mailbox_forbidden` sem pedir token novo.

## Roles and ownership

- **Operador**: usa Documentos, sync XML, backup NF-e, ingestão de e-mail.
- **Sistema**: chama Microsoft Graph com Bearer; NÃO alarga permissão.
- **Authorization**: inalterada. Refresh usa o refresh token já guardado
  (OneDrive) ou client credentials já configuradas (mail). Sem reconexão
  OAuth nova neste spec, salvo se o refresh token estiver inválido.
- **Company isolation**: inalterada. A conexão OneDrive continua da empresa
  autenticada; o token de mail continua app-only da tenant.

## User Scenarios & Testing

### User Story 1 — OneDrive continua após token expirado (Priority: P1)

Como operador, um sync ou leitura de arquivo no OneDrive NÃO falha só
porque o Graph devolveu token expirado, se a conta ainda tiver refresh
token válido.

**Why this priority**: é a falha observada em produção
(`request-id` 730a7067-b9c8-4914-bb0f-6db7247074fc).

**Independent Test**: uma chamada Graph 401 com `InvalidAuthenticationToken`
renova o access token e repete a mesma requisição uma vez.

**Acceptance Scenarios**:

1. **AC-080-001** — Given um access token que o Graph recusa com 401
   (token expirado) e um refresh token válido, when a API do OneDrive é
   chamada, then o sistema MUST renovar o access token e MUST repetir a
   chamada uma vez com o token novo.
2. **AC-080-002** — Given o mesmo 401 e nenhum refresh bound/válido, when
   a API é chamada, then MUST falhar como hoje (sem loop infinito).
3. **AC-080-003** — Given um job longo (muitas páginas/arquivos), when o
   token expira no meio, then a próxima chamada Graph MUST poder renovar
   sem o operador reconectar a conta.

### User Story 2 — Caixa Graph não trata token morto como “proibido” (Priority: P1)

Como sistema, um 401 por token de app expirado na caixa de e-mail NÃO é
classificado como falta de permissão até falhar de novo com token novo.

**Why this priority**: mesma classe de bug; IMPCG/CASSEMS/cartas usam o
mesmo Graph.

**Independent Test**: listagem da caixa com 401 no primeiro GET, depois
200 com token novo, devolve mensagens.

**Acceptance Scenarios**:

1. **AC-080-004** — Given cache de token app-only ainda “válido” no
   relógio e Graph 401, when a caixa é listada, then MUST pedir token novo
   e MUST repetir a requisição uma vez.
2. **AC-080-005** — Given 401 persistente após o token novo, when a caixa
   é listada, then MUST continuar a falhar como acesso negado/indisponível
   (não mascarar permissão real).

### User Story 3 — Varredura da mesma classe (Priority: P2)

Como mantenedor, as outras integrações com token de vida curta estão
classificadas: ou já renovam, ou não são OAuth JWT.

**Why this priority**: o pedido foi varrer o código, não só o OneDrive.

**Independent Test**: o spec e o plano listam o resultado da varredura.

**Acceptance Scenarios**:

1. **AC-080-006** — Given NSDocs, Sefaz, Evolution, reCAPTCHA OPME e
   caches de relatório, when a varredura classifica, then MUST constar
   no plano como fora desta classe (não JWT Graph) ou com o mesmo
   tratamento se algum JWT paralelo existir.

## Requirements

- **FR-080-01**: Toda chamada HTTP ao Microsoft Graph do OneDrive MUST,
  em 401, tentar renovar o access token da conexão e repetir **uma** vez.
- **FR-080-02**: A renovação OneDrive MUST persistir access/refresh
  criptografados e `tokenExpiresAt`, e MUST atualizar o objeto em memória
  da conexão para o job corrente.
- **FR-080-03**: Renovações concorrentes da mesma conexão MUST serializar
  (um único refresh token request).
- **FR-080-04**: Chamadas Graph Mail MUST, em 401, invalidar o cache
  app-only, obter token novo e repetir **uma** vez.
- **FR-080-05**: Logs MUST NÃO incluir access token, refresh token nem
  Bearer.
- **FR-080-06**: Sem refresh token OneDrive, a falha MUST continuar a
  pedir reconexão da conta.

## Failure cases

- Refresh token rejeitado pelo IdP: erro de renovação; operador reconecta.
- 401 após a retry: erro Graph existente (não loop).
- 403 real (escopo/mailbox): inalterado após a retry.

## Non-functional

- Sem schema, sem pacote novo, sem UI.
- Retry de auth é 1, não backoff de 401 (401 não é transiente de rede).
- Folga de relógio do OneDrive pode ser alargada; a retry em 401 é o
  contrato, não a folga.

## Out of scope

- Nova tela de reconexão OAuth.
- Trocar o modelo de permissões Graph.
- NSDocs, Sefaz, Evolution API key, reCAPTCHA do portal OPME.
- Alterar mensagens de erro além do necessário para o retry.

## Assumptions

- O refresh token OneDrive em produção ainda é válido; o JWT de access
  é que expirou.
- `expires_in` do IdP continua ~3600 s.
- Client credentials da caixa Graph estão configuradas.

## Success criteria

- **SC-080-01**: Teste prova 401 OneDrive → refresh → 200 na mesma
  operação, sem segundo 401.
- **SC-080-02**: Teste prova 401 Graph Mail → token novo → listagem ok.
- **SC-080-03**: Teste prova 401 sem renovação possível falha uma vez,
  sem loop.
- **SC-080-04**: `docs:validate`, typecheck e testes do recorte passam.

## Test strategy

- `onedrive-graph.test.ts`: 401 com bind de refresh; 401 sem bind.
- `onedrive-connections.test.ts`: force refresh; serialização; bind no
  `ensureValid`.
- `graph-mail-token-retry.test.ts`: 401 então 200; 401 persistente.
- Sem chamada real à Microsoft.
