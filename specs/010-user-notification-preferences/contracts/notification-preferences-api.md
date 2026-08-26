# Contrato: `/api/users/me/notification-preferences`

**Spec**: [../spec.md](../spec.md) · **Plan**: [../plan.md](../plan.md) · **Data model**: [../data-model.md](../data-model.md) · **Fase**: 1

Rota das preferências de notificação do **próprio** usuário. Dois métodos: ler e gravar.

As formas de erro abaixo não foram inventadas para este documento — são as que `src/lib/api-error.ts` e `src/lib/auth.ts` já produzem hoje. Reusá-las é exigência do Princípio VI (uma fonte canônica por assunto).

## Identidade: `requireSessionRole`, nunca `requireAuth`

A decisão mais importante deste contrato, e a menos óbvia.

O helper de uso geral, `requireAuth`, **também autentica por API key** (`src/lib/auth.ts:114-126`). Quando a chamada vem de uma chave, o `userId` devolvido é o do *criador da chave*.

Numa rota de preferência pessoal isso seria um defeito silencioso: uma integração com chave de escopo administrativo passaria a ler e **sobrescrever** as preferências pessoais de quem gerou a chave, sem que nenhuma pessoa tenha pedido isso. Não é vazamento entre usuários, mas é escrita em nome de alguém que não agiu.

Por isso ambos os métodos usam **`requireSessionRole('viewer')`** (`src/lib/auth.ts:196`), que exige sessão de verdade e recusa chave de API. `viewer` é o piso da hierarquia: qualquer usuário ativo governa as próprias preferências, e é a sessão que diz quem ele é.

Consequência deliberada: **não existe** parâmetro de id de usuário em nenhum dos dois métodos, nem no caminho, nem em query, nem no corpo. O sujeito vem da sessão. É o que satisfaz FR-005 e o Princípio II — um identificador controlado pela requisição jamais amplia acesso, porque não há identificador na requisição.

---

## `GET /api/users/me/notification-preferences`

Devolve as preferências efetivas do usuário da sessão: **para todo tipo de evento existente**, o valor resolvido.

### Resposta `200`

```json
{
  "preferences": [
    { "eventType": "invoice_received", "enabled": true, "isDefault": true }
  ]
}
```

| Campo | Significado |
|---|---|
| `eventType` | Valor de `NotificationEventType`. A lista cobre **todos** os valores do enum, sempre. |
| `enabled` | Valor **efetivo**: o da linha se existir, senão o padrão do tipo. |
| `isDefault` | `true` quando não há linha gravada e o valor veio do padrão. |

Três propriedades que o cliente pode assumir:

1. **A lista nunca vem parcial.** Todo valor do enum aparece, tenha ou não linha gravada. A tela nunca precisa saber quais tipos existem — ela renderiza o que vier, e um tipo novo aparece sozinho.
2. **`enabled` já está resolvido.** O cliente não repete a regra de padrão; ela vive em `src/lib/notification-preferences.ts` e só lá.
3. **`isDefault` é informativo, não de controle.** Serve para a interface poder distinguir "nunca mexi nisso" de "escolhi isto", se quiser. Ignorá-lo é seguro.

`isDefault` existir em vez de `enabled: null` é escolha: nulo forçaria todo consumidor a reimplementar a coalescência, que é exatamente a duplicação que este plano remove.

---

## `PUT /api/users/me/notification-preferences`

Grava uma ou mais preferências do usuário da sessão.

### Corpo

```json
{
  "preferences": [
    { "eventType": "invoice_received", "enabled": false }
  ]
}
```

Validado por Zod. Regras:

| Regra | Consequência se violada |
|---|---|
| `preferences` é array com ao menos um item | `400` |
| `eventType` pertence a `NotificationEventType` | `400` |
| `enabled` é booleano | `400` |
| Sem `eventType` repetido no mesmo corpo | `400` |
| Nenhuma outra chave é aceita (sem `userId`) | `400` |

**Parcial, não substituição.** Enviar um item altera aquele tipo e deixa os demais como estavam. É o que casa com a interface, onde cada interruptor age sozinho — um `PUT` que apagasse os ausentes transformaria "liguei um" em "desliguei todos os outros".

O nome `PUT` é mantido porque a operação é **idempotente**: repetir o mesmo corpo leva ao mesmo estado. Cada item vira um `upsert` na chave `(userId, eventType)`.

`eventType` fora do enum reprova na validação, antes do banco. É a segunda barreira do FR-007: mesmo que o enum e o código divirjam, não se grava preferência para tipo inexistente.

### Resposta `200`

Idêntica em forma à do `GET`, com o estado **já atualizado** — a lista completa, todos os tipos.

Deliberado: a tela não precisa de uma segunda ida ao servidor para confirmar, e não fica tentada a assumir sucesso e pintar o interruptor sozinha. Isso é o mecanismo de FR-004 — o controle só reflete o que o servidor confirmou, que é precisamente o defeito original (`PreferencesSection.tsx:102-155` muda a aparência sem nada salvar).

---

## Erros

Iguais aos do resto da API, produzidos pelos helpers existentes.

| Situação | Status | Corpo | Origem |
|---|---|---|---|
| Sem sessão | `401` | `{"error": "Não autorizado"}` | `NOT_AUTHENTICATED` → `unauthorizedResponse()` |
| Tentativa com chave de API | `401` | `{"error": "Não autorizado"}` | idem — não há sessão |
| Usuário não ativo, ou `tokenVersion` revogada | `401` | `{"error": "Não autorizado"}` | `requireSessionRole` lança `NOT_AUTHENTICATED` (`auth.ts:210`, `:215`) |
| Corpo inválido (`PUT`) | `400` | `{"error": "Dados invalidos", "details": {...}}` | `apiValidationError(zodError)` |
| Falha inesperada | `500` | `{"error": "Erro interno do servidor"}` | `apiError(e, 'users/me/notification-preferences')` |

**Não há `403` nesta rota.** Verificado em `auth.ts:206-231`: `requireSessionRole` só lança `FORBIDDEN` quando o papel do usuário fica abaixo do mínimo, e com mínimo `viewer` — o piso de `ROLE_HIERARCHY` — esse ramo é inalcançável. Usuário inativo cai em `NOT_AUTHENTICATED`, ou seja `401`, não `403`.

Registrado porque a intuição erra aqui: "usuário existe mas não pode" sugere 403, e o código devolve 401. Um teste escrito pela intuição reprovaria contra um servidor correto.

Nenhum corpo de erro carrega dado de outro usuário, nem confirma a existência de outro usuário — não há como perguntar por outro.

O `500` nunca expõe a mensagem interna: `apiError` registra por Pino e devolve texto genérico. Mantido como está (Princípio V).

## Registro em log de acesso

FR-009 pede registro da alteração. **Bloqueado por decisão em aberto**: qual valor de `AccessLogAction` usar.

O enum tem hoje `user_updated`, que descreve administrador alterando usuário — semanticamente diferente de usuário mudando a própria preferência. Um valor próprio auditaria melhor, mas mexe num enum compartilhado.

Registrado como pendência do dono no plano. A rota deve escrever no `AccessLog` **assim que o valor for decidido**; até lá, não inventar um.

## Contratos verificáveis

O que os testes de contrato afirmam, além dos testes de unidade do modelo:

1. `GET` sem sessão devolve `401`, e o corpo é exatamente `{"error":"Não autorizado"}`. Usuário inativo também devolve `401`, não `403` — ver a nota em "Erros".
2. `GET` com chave de API válida devolve `401` — **não** as preferências do criador da chave. É a prova da decisão de identidade acima, e reprova se alguém trocar `requireSessionRole` por `requireAuth`.
3. `GET` de usuário sem nenhuma linha devolve todos os tipos com `isDefault: true` e o valor padrão.
4. `PUT` com `eventType` fora do enum devolve `400` e **não** grava nada.
5. `PUT` com o mesmo corpo duas vezes resulta em uma linha e mesma resposta (idempotência).
6. `PUT` de um tipo não altera os demais (parcial, não substituição).
7. `PUT` com `userId` no corpo devolve `400` — o campo não existe no contrato e não pode ser silenciosamente ignorado.
8. A resposta do `PUT` reflete o estado gravado, não o corpo enviado — verificado gravando e relendo.

A segunda e a sétima são as que impedem regressão de segurança; ambas devem reprovar se a autorização voltar a aceitar identificador vindo da requisição.

## Fora deste contrato

- **Rota de administrador para preferência alheia**: FR-005 restringe cada usuário às próprias. Não existe e não deve existir sem spec própria.
- **`DELETE`**: apagar a linha significaria "voltar ao padrão". Redundante — basta gravar o valor do padrão, e uma rota a menos é uma superfície a menos.
- **Preferência por canal**: fora do modelo (ver data-model).
- **Paginação**: a lista é do tamanho do enum, hoje um item.
