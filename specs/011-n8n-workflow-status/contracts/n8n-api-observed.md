# Formato observado da API do n8n (T012)

**Instância**: `https://n8n.qlmed.com.br` · n8n `2.29.10` (imagem `n8nio/n8n:2.29.10`)
**Data da observação**: 2026-08-26
**Autenticação**: cabeçalho `X-N8N-API-KEY`

Este documento registra o que a API **de fato devolveu**, não o que a documentação promete. Existe porque o plano proíbe escrever o schema Zod de memória — T013 deve ser escrito contra o que está aqui.

Nenhum valor de credencial, parâmetro de nó ou conteúdo de execução foi copiado para este documento: só nomes de campo, tipos e cardinalidades.

---

## `GET /api/v1/workflows`

### Envelope

```json
{ "data": [ ... ], "nextCursor": "<string|null>" }
```

### Campos de um item

| Campo | Tipo | Observação |
|---|---|---|
| `id` | `string` | Observado string, nunca número |
| `name` | `string` | |
| `active` | `boolean` | |
| `isArchived` | `boolean` | |
| `createdAt` / `updatedAt` | `string` | ISO 8601 |
| `versionId` / `activeVersionId` | `string` | |
| `triggerCount` | `number` | |
| `nodes` | `array` | Pesado. Ver "Peso" abaixo |
| `connections` | `object` | Chaveado por nome de nó |
| `activeVersion` | `object` | Duplica boa parte do workflow |
| `staticData` | `object \| null` | Estado interno dos nós |
| `settings` | `object` | `errorWorkflow`, `executionOrder`, `timezone`… |
| `shared` | `array` | Compartilhamento |
| `tags` | `array` | |
| `meta` / `pinData` | `null` | Observados nulos nesta instância |
| `nodeGroups` | `array` | Vazio nesta instância |

Os três que a feature usa — `id`, `name`, `active` — **confirmam** o que `parseWorkflows` já assume. O parser provisório está correto quanto ao formato.

---

## `GET /api/v1/executions`

### Envelope

Idêntico: `{ data, nextCursor }`.

### Campos de um item

| Campo | Tipo | Observação |
|---|---|---|
| `id` | `string` | |
| `workflowId` | `string` | Liga à lista de workflows |
| `status` | `string` | **Ver "Status" abaixo** |
| `mode` | `string` | Observado só `"webhook"` |
| `finished` | `boolean` | |
| `startedAt` / `stoppedAt` | `string` | ISO 8601. `stoppedAt` não veio nulo em nenhuma das 17 |
| `waitTill` | `null` | |
| `retryOf` / `retrySuccessId` | `null` | |

### Status

Amostra de **17 execuções**: `success` (14), `error` (3).

**Só esses dois foram observados.** A documentação do n8n cita ainda `running`, `waiting`, `canceled`, `crashed` e `new`, e nenhum apareceu aqui.

Consequência para T013: o schema **não deve** declarar um enum fechado com os dois observados. Um `running` real reprovaria a validação e derrubaria a tela inteira para `unavailable` — transformando "uma execução em andamento" em "não consigo saber". Tratar `status` como string, e mapear o que não for reconhecido para um estado neutro.

---

## Achados que mudam o cliente

### 1. `nextCursor` é paginação real, e o cliente a ignora

Medido: com `limit=1`, `nextCursor` vem **preenchido**; com `limit=250`, vem `null`. A paginação é por cursor, não por offset.

`fetchN8nWorkflows` hoje faz uma requisição e ignora `nextCursor`. Nesta instância há 2 workflows e o padrão da API cobre tudo numa página, então o defeito é **latente**: passando do limite, a tela mostraria uma lista incompleta **sem sinal nenhum de que está incompleta** — que é a mesma família de defeito que a User Story 2 combate.

Ação para T013: ou seguir o cursor até o fim, ou pedir `limit` alto e **declarar truncamento** se `nextCursor` voltar preenchido. Nunca ignorar em silêncio.

### 2. A resposta é pesada para o que a tela precisa

Medido: **30.554 bytes para 2 workflows** — cerca de 15 KB cada, porque cada item traz `nodes`, `connections`, `activeVersion` e `staticData`.

A API v1 não oferece projeção de campos, então não há como pedir menos. Duas consequências:

- O custo cresce com a complexidade dos workflows, não com a quantidade. O cache curto (D3) já limita a frequência.
- `nodes` e `staticData` podem carregar configuração sensível. O cliente já descarta tudo fora de `id`/`name`/`active` no parser, e só o resultado parseado entra no cache — nada disso deve passar a ser guardado ou registrado.

### 3. `id` é string nos dois recursos

Nenhum número apareceu. O parser aceita ambos e normaliza para string, o que continua correto e não precisa mudar.

---

## O que continua não observado

- Estados de execução além de `success` e `error`.
- `mode` além de `webhook`.
- Comportamento com workflow **nunca executado** — nenhum caso na amostra. É um cenário de aceitação da spec (User Story 1, cenário 3) e precisa ser tratado pela **ausência** de execução para aquele `workflowId`, não por um campo.
- Resposta com `nextCursor` preenchido em uso real.
