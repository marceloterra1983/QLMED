---
id: ADR-0014
status: proposed
date: 2026-09-01
supersedes: null
related_specs: []
---

# Retenção de dado operacional: mecanismo pronto, prazo por decidir

## Context

QLMED-DATA-012 da auditoria b177b07: cinco tabelas são append-only e nunca
tiveram política de retenção. Crescem para sempre porque ninguém decidiu o
contrário — não porque alguém decidiu que devem.

Duas delas guardam rasto de pessoa. `AccessLog` liga `userId` a ação e caminho;
`NotificationClick` guarda `ipHash` e `userAgent`. "Para sempre" não é uma
posição neutra para esse tipo de linha.

## Decision drivers

- O prazo de retenção é decisão de negócio e de proteção de dados. Um agente de
  auditoria pode construir o mecanismo; não pode escolher o número.
- Purgar com prazo chutado é perda de dado. Perda de dado não é correção de
  auditoria — é o incidente que a auditoria devia evitar.
- Um `AccessLog` sem retenção também é o registro que uma investigação futura
  vai querer. O prazo não é "o menor possível"; é o que equilibra as duas coisas.

## Considered options

### A — Escolher prazos razoáveis e ligar o purge

Fecha o finding numa rodada. Custo: o primeiro purge apaga dado real com base
num número que ninguém assinou. Irreversível.

### B — Só documentar a política, sem código

Honesto, e não entrega nada executável. O finding volta na próxima auditoria com
o mesmo texto.

### C — Mecanismo com prazo por configuração, desligado por omissão

O código sabe purgar. Cada tabela tem uma variável própria. Sem a variável, a
tabela não é tocada. Nada chama o purge automaticamente.

## Decision

**Opção C.** `src/lib/data-retention.ts` implementa
`purgeExpiredOperationalData()`, com uma regra por tabela e o prazo vindo de
variável de ambiente. Regras do mecanismo:

- Variável ausente ⇒ tabela não é purgada, e o retorno diz
  `no-retention-configured`.
- Prazo inválido (`0`, negativo, não inteiro) ⇒ recusado como
  `invalid-retention`. `0` apagaria tudo; tratá-lo como "sem retenção" seria
  confundir engano de configuração com intenção.
- Nenhum default numérico no código. A única falha possível aqui é não apagar.
- `bootstrap.ts` não chama esta função. Ligar um purge no boot com prazos ainda
  não assinados trocaria um problema de governança por um incidente.

### Prazos propostos, pendentes de decisão do dono/DPO

Nenhum destes está ativo. São ponto de partida para a conversa, não default.

| Tabela | Variável | Proposta | Natureza |
|---|---|---|---|
| `AccessLog` | `QLMED_RETENTION_ACCESS_LOG_DAYS` | 365 | Trilha de auditoria com `userId`. Prazo curto demais apaga a prova que a trilha existe para dar. |
| `NotificationClick` | `QLMED_RETENTION_NOTIFICATION_CLICK_DAYS` | 90 | Telemetria com `ipHash` e `userAgent`. É a que menos justifica retenção longa. |
| `SyncLog` | `QLMED_RETENTION_SYNC_LOG_DAYS` | 180 | Histórico de execução, sem dado pessoal. Serve para diagnóstico. |
| `CnpjCache` | `QLMED_RETENTION_CNPJ_CACHE_DAYS` | 30 | Cache. Reconstrói-se sozinho; linha velha é dado desatualizado da Receita. |
| `NcmCache` | `QLMED_RETENTION_NCM_CACHE_DAYS` | 180 | Cache. Tabela NCM muda pouco. |

Fora de escopo deste ADR, e ainda em aberto:

- **`Invoice.xmlContent`**: o finding cita, mas retenção aqui não é apagar linha
  — é decidir se e quando o XML fiscal sai da coluna. Prazo legal de guarda de
  documento fiscal, e a coluna é fonte de várias derivações. Precisa de ADR
  próprio.
- **Acionamento**: cron, unit de sistema ou job no scheduler. Escolher antes de
  ter prazo seria escolher no vazio.

## Consequences

### Positive

- O mecanismo existe, tem teste, e é seguro por omissão.
- A decisão que falta está isolada e nomeada: cinco números e um acionamento.

### Negative

- O finding não fecha nesta rodada. Fecha quando o dono assinar os prazos e o
  acionamento for ligado.
- Código que ninguém chama ainda é código. Se os prazos não vierem, isto vira
  peso morto e deve ser apagado, não mantido "para depois".

## Verification

- `src/lib/__tests__/audit-l8-data-retention.test.ts`: sem variável, nenhum
  `deleteMany` acontece; prazo inválido é recusado; o corte usa a coluna de tempo
  correta de cada tabela (`startedAt` no `SyncLog`, `fetchedAt` nos caches).
- Reverter `parseRetentionDays` para devolver um default numérico deixa três
  desses testes vermelhos.
