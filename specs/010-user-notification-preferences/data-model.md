# Data Model: Preferências de notificação por usuário

**Spec**: [spec.md](./spec.md) · **Plan**: [plan.md](./plan.md) · **Fase**: 1

Escopo: apenas a User Story 1 (P1). P2 e P3 não acrescentam esquema — acrescentam valores ao enum de evento, e o modelo abaixo foi desenhado para absorvê-los sem migration.

> **Validado, não apenas escrito.** O modelo abaixo, mais a relação inversa em `User`, foram aplicados a uma cópia de `prisma/schema.prisma` e submetidos a `npx prisma validate` em 2026-08-26: *"The schema is valid 🚀"*. O esquema real não foi tocado; a migration é passo da Fase 2.

## Entidade

### `UserNotificationPreference`

Uma linha por par (usuário, tipo de evento). Ausência de linha significa o padrão daquele tipo — nunca "desligado".

```prisma
model UserNotificationPreference {
  id        String                @id @default(cuid())
  userId    String
  user      User                  @relation(fields: [userId], references: [id], onDelete: Cascade)
  eventType NotificationEventType
  enabled   Boolean
  createdAt DateTime              @default(now())
  updatedAt DateTime              @updatedAt

  @@unique([userId, eventType])
  @@index([eventType, enabled])
}
```

E a relação inversa no modelo existente:

```prisma
model User {
  // ... campos atuais inalterados ...
  notificationPreferences UserNotificationPreference[]
}
```

### Campo a campo

| Campo | Tipo | Por quê |
|---|---|---|
| `id` | `String @id @default(cuid())` | Convenção do repositório: todo modelo usa cuid. |
| `userId` + `user` | relação com `onDelete: Cascade` | Entrega FR-008 sem código de limpeza. Espelha `AccessLog`, que é a tabela de referência para dado que pende do usuário. |
| `eventType` | `NotificationEventType` | **A decisão central.** Chaveando ao enum, preferência para um tipo sem produtor é irrepresentável — FR-007 vira propriedade do esquema, não regra policiada em revisão. |
| `enabled` | `Boolean` **sem default** | Deliberado: a linha só existe porque alguém escolheu. Um default no banco sugeriria que a ausência é um estado válido de "não escolhido ainda", e ela já significa isso — pela ausência. O padrão mora no código (ver "Padrões"). |
| `createdAt` / `updatedAt` | convenção do repositório | Permite auditar quando a escolha mudou, sem tabela de histórico. |

### Restrições

| Restrição | Garante |
|---|---|
| `@@unique([userId, eventType])` | Um usuário não pode ter duas preferências contraditórias para o mesmo tipo. É também a chave natural do `upsert` da rota de escrita. |
| `@@index([eventType, enabled])` | Serve a pergunta que o outbox faz: "quem desligou este tipo". Ver "Índices". |
| FK com `Cascade` | Nenhuma preferência órfã sobrevive à exclusão do usuário. |

## Ausência de `companyId`, e por quê

O guia de Prisma do repositório diz que **toda tabela nova** deve levar `companyId` e `@@index([companyId])`. Esta não leva, e a divergência é deliberada.

Aquela regra existe para tabelas de *tenant* — `Invoice`, `NsdocsConfig`, `ContactNickname` — onde a linha pertence a uma empresa e o isolamento entre empresas depende disso.

Preferência de notificação pertence a uma **identidade**, não a uma empresa. O precedente já está no esquema: `AccessLog` e `ApiKey` pendem de `User` e nenhuma das duas tem `companyId`. `User` também não tem — tem a relação `companies`.

Acrescentar `companyId` aqui não seria conservador, seria uma mudança semântica: passaria a significar "preferência deste usuário nesta empresa", que é justamente o que a spec exclui ("Preferência por empresa: o sistema é de empresa única"). Criaria a possibilidade de linhas conflitantes por empresa para um sistema que não tem essa dimensão.

Se um dia o sistema deixar de ser de empresa única, isto é um `@@unique([userId, companyId, eventType])` numa migration própria — expansão, não correção.

## Padrões

Os padrões vivem em **um lugar só**, `src/lib/notification-preferences.ts`, e são consumidos pela tela e pelo outbox (Princípio VI). Hoje estão duplicados como literais em `PreferencesSection.tsx:12-14`; essa duplicação some.

| Tipo de evento | Padrão | Motivo |
|---|---|---|
| `invoice_received` | **ligado** | Preserva o comportamento atual (FR-003). Nenhum usuário existente perde notificação por causa desta feature. |

Regra de resolução, em uma frase: **valor da linha se existir, senão o padrão do tipo**. Não há terceiro estado.

A tabela acima tem uma linha só porque o enum tem um valor só. Quando `NotificationEventType` ganhar `sync_failed`, é aqui que o padrão dele é declarado — e é isso que impede um tipo novo de nascer sem padrão definido.

## Índices

`@@index([eventType, enabled])` merece justificativa, porque índice sem pergunta correspondente é peso morto.

A pergunta do caminho de notificação é: dado um tipo, **quem o desligou**. O conjunto de usuários ativos já é carregado pelo outbox; o que falta é saber quais deles optaram por não receber. Como "desligado" é minoria esperada, o índice composto responde isso lendo pouco.

A pergunta da tela — "as preferências deste usuário" — é servida pelo `@@unique([userId, eventType])`, que já é um índice por `userId` no prefixo. Não é preciso um segundo.

## Como o outbox consome

O plano (D2) exige não acrescentar round trip dentro da transação que cria a nota. A consulta que hoje existe em `src/lib/notification-outbox.ts:165-171`:

```ts
tx.user.findMany({
  where: { status: 'active', ... },
  select: { email: true, phone: true, role: true, allowedPages: true },
})
```

passa a carregar também as preferências do tipo em questão, no mesmo `select`:

```ts
tx.user.findMany({
  where: { status: 'active', ... },
  select: {
    email: true, phone: true, role: true, allowedPages: true,
    notificationPreferences: {
      where: { eventType: 'invoice_received' },
      select: { enabled: true },
    },
  },
})
```

Continua **uma** consulta. O array vem vazio para quem nunca escolheu, e vazio resolve para o padrão — que é exatamente a semântica desejada, sem `null` nem coalescência espalhada pelo código.

A composição das duas condições (autorização e vontade) fica na função pura, conforme D2, sem alterar `canReceiveInvoiceNotifications`.

## Migration

**Nome**: `add_user_notification_preferences`, seguindo a nomenclatura descritiva das existentes (`add_notification_clicks`, `expand_invoice_duplicata_decimal`).

**Conteúdo**: `CREATE TABLE`, uma FK com `ON DELETE CASCADE`, um índice único composto e um índice composto. Nenhum `ALTER` em tabela existente — a relação inversa em `User` é construção do Prisma Client e não gera DDL.

**Aditiva por construção**: nenhuma coluna existente muda de tipo, nome ou nulidade; nenhuma linha existente é reescrita; a tabela nasce vazia. Não há passo de expand/contract porque não há mudança incompatível (Princípio III).

**Ordem**: a migration pode ser aplicada antes do código, sem efeito observável — ninguém consulta a tabela ainda. Não existe janela em que esquema novo e código antigo se contradigam.

**Rollback**: reverter o código restaura o comportamento anterior mesmo com a tabela populada, porque o código antigo não a consulta. Derrubar a tabela é migration própria, sem pressa, e não afeta dado fiscal.

**Verificação**: `npm run db:migrate:verify` e `npm run db:reconcile:verify`, ambos contra o `qlmed_ci` descartável. `migrate deploy` na base canônica é passo humano, fora do alcance do agente.

## Invariantes verificáveis

O que os testes devem afirmar sobre o modelo:

1. Usuário sem linha para um tipo resolve para o padrão daquele tipo.
2. Usuário com `enabled: false` é excluído dos destinatários daquele tipo; com `enabled: true`, incluído.
3. Excluir o usuário remove suas preferências (cascade), sem órfãs.
4. Dois `upsert` no mesmo par (usuário, tipo) resultam em **uma** linha, não duas.
5. O destinatário institucional `NOTIFICATION_ALWAYS_EMAIL` não é afetado por preferência alguma (FR-006) — não é usuário e não tem linha.
6. Todo valor de `NotificationEventType` tem padrão declarado. Um valor novo sem padrão deve reprovar em teste, não em produção.

A sexta é a que protege a feature no futuro: sem ela, um tipo novo entra no enum e o padrão fica indefinido silenciosamente.

## Fora deste modelo

- **Preferência por canal** (e-mail sim, WhatsApp não): a spec trata preferência por evento. Exigiria `channel` na chave única — expansão futura, não omissão.
- **Histórico de mudanças**: `updatedAt` diz quando mudou, não para quê nem por quem. A trilha é FR-009, gravada em `AccessLog` com a ação `user_updated` e o tipo alterado no `path` — tabela existente, sem histórico próprio aqui.
- **Preferência por empresa**: ver "Ausência de `companyId`".
- **Preferência de administrador sobre outro usuário**: FR-005 restringe cada um às próprias.
