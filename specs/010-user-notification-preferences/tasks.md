# Tasks: Preferências de notificação por usuário

**Input**: Design documents from `/specs/010-user-notification-preferences/`

**Prerequisites**: [spec.md](./spec.md), [plan.md](./plan.md), [data-model.md](./data-model.md), [contracts/](./contracts/notification-preferences-api.md)

**Tests**: obrigatórios. O Princípio I da constituição exige evidência executável para mudança de comportamento, e o teste relevante **deve reprovar antes** da implementação.

**Escopo**: só a User Story 1 (P1). US2 e US3 dependem de valores em `NotificationEventType` que não existem e de produtores que não existem; entram em ciclos próprios.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: pode rodar em paralelo (arquivo diferente, sem dependência)
- **[US1]**: User Story 1 — desligar notificação de notas recebidas

---

## Fase A — Fundação (bloqueia tudo)

- [ ] **T001** Acrescentar `model UserNotificationPreference` a `prisma/schema.prisma`, mais a relação inversa `notificationPreferences` em `User`, exatamente como em [data-model.md](./data-model.md). Sem `companyId` — ver a justificativa lá.

- [ ] **T002** Gerar a migration `add_user_notification_preferences`. **Não** rodar `migrate dev` nem `db push` contra a base canônica (regra do `db-safety`); gerar o arquivo versionado e revisar o SQL: deve ser só `CREATE TABLE`, uma FK `ON DELETE CASCADE`, o índice único composto e `@@index([eventType, enabled])`. Zero `ALTER` em tabela existente.

- [ ] **T003** `npx prisma generate` para atualizar o client.

- [ ] **T004** Provar a migration: `npm run db:migrate:verify` e `npm run db:reconcile:verify`, ambos contra o `qlmed_ci` descartável.

---

## Fase B — Regra de domínio (o coração; nada de HTTP aqui)

- [ ] **T005** [US1] Criar `src/lib/notification-preferences.ts` com:
  - `NOTIFICATION_PREFERENCE_DEFAULTS`, mapa de `NotificationEventType` → booleano. Hoje: `invoice_received: true`. **Fonte única** do padrão (Princípio VI).
  - `resolvePreference(eventType, rows)` — valor da linha se existir, senão o padrão.
  - `wantsNotification(user, eventType)` — função **pura**, recebe as preferências já carregadas, sem tocar no banco.

- [ ] **T006** [US1] Escrever `src/lib/__tests__/notification-preferences.test.ts` cobrindo as invariantes 1, 2 e 6 do data-model: ausência resolve para o padrão; `enabled` explícito manda; e **todo** valor de `NotificationEventType` tem padrão declarado.
  A invariante 6 é a que protege a feature no futuro — deve ser escrita percorrendo o enum, não listando os valores à mão, senão não pega o tipo que alguém acrescentar amanhã.

- [ ] **T007** [US1] **Portão de reversão.** Antes de tocar no outbox, provar que T006 reprova sem T005: substituir `wantsNotification` por um `return true` fixo e exigir que a suíte fique vermelha. Restaurar. Sem este passo, o teste não protege nada — é a mesma verificação aplicada em `fiscal-period` e `financeiro-valor-color` no PR #164.

---

## Fase C — Integração no caminho de notificação

- [ ] **T008** [US1] Em `src/lib/notification-outbox.ts:165-171`, acrescentar as preferências ao `select` da consulta que já existe, com `where: { eventType: 'invoice_received' }`. **Continua uma consulta** — se virar duas, o objetivo de performance do plano foi perdido.

- [ ] **T009** [US1] Na linha 179, compor `wantsNotification` com o `canReceiveInvoiceNotifications` existente. **Não alterar a assinatura** de `canReceiveInvoiceNotifications` (decisão D2): ela responde autorização, e misturar vontade com permissão faria um bug de preferência virar vazamento de autorização.

- [ ] **T010** [US1] Estender `src/lib/__tests__/notification-outbox.integration.test.ts`: dois usuários ativos, um com `enabled: false`; afirmar que a contagem de `NotificationDelivery` cai exatamente um e que o outro fica intacto (Cenário 4 da US1 — preferência é individual, nunca global).

- [ ] **T011** [US1] Teste do destinatário institucional (FR-006): `NOTIFICATION_ALWAYS_EMAIL` sobrevive a qualquer preferência desligada. Não é usuário, não tem linha, não pode ser desligado por ninguém.

---

## Fase D — Rota

- [ ] **T012** [US1] Criar `src/app/api/users/me/notification-preferences/route.ts` com `GET` e `PUT`, conforme [o contrato](./contracts/notification-preferences-api.md).
  **Usar `requireSessionRole('viewer')`, nunca `requireAuth`** — este é o ponto mais fácil de errar de toda a feature. `requireAuth` aceita chave de API e devolveria o `userId` do criador da chave, fazendo uma integração sobrescrever preferência de gente.
  A rota autentica, valida com Zod e delega (Princípio IV): nenhuma regra de padrão mora aqui.

- [ ] **T013** [US1] Registro em `AccessLog` no `PUT`: ação `user_updated`, `path: "notification-preferences:<tipos>"`. Gravação **não bloqueante** (`.catch` com `log.warn`), como em `auth.ts:123-125` — falha de log não pode derrubar a gravação da preferência.

- [ ] **T014** [US1] Testes de contrato, cobrindo os 8 itens de "Contratos verificáveis". Os dois que impedem regressão de segurança:
  - `GET` com **chave de API** devolve `401`, não as preferências do criador da chave. Reprova se alguém trocar por `requireAuth`.
  - `PUT` com `userId` no corpo devolve `400` — o campo não existe e não pode ser ignorado em silêncio.
  Incluir também: usuário inativo devolve **`401`, não `403`** (verificado em `auth.ts:210`; a intuição erra aqui).

---

## Fase E — Interface

- [ ] **T015** [US1] Reescrever o card "Notificações" em `src/app/(painel)/sistema/settings/components/PreferencesSection.tsx`:
  - Remover os três `useState` das linhas 12-14 e os literais de padrão junto — o padrão passa a vir do servidor.
  - Estado vindo do `GET`; cada interruptor grava por `PUT` e **só muda de aparência com a resposta**.
  - Em falha, reverter o interruptor e avisar por `toast.error` (FR-004). É o defeito original, invertido.

- [ ] **T016** [US1] **Remover da tela** os interruptores "erros de sincronização" e "resumo semanal" (decisão D3). Deixá-los persistindo algo que ninguém lê seria o mesmo defeito com outra roupa. Voltam com seus produtores.

- [ ] **T017** [US1] Teste de que falha na gravação reverte o interruptor. É a prova de SC-003, e a única tarefa que ataca diretamente o sintoma que o usuário via.

---

## Fase F — Portões

- [ ] **T018** Rodar a bateria da constituição, toda ela:
  ```bash
  npm run docs:validate
  npx tsc --noEmit
  npm run lint
  npm test
  npm run build
  npm run db:migrate:verify
  npm run db:reconcile:verify
  ```

- [ ] **T019** **Reversão final**, sobre o conjunto: desfazer a composição de T009 e exigir que T010 reprove. Verde de suíte não é prova; suíte que reprova sem a correção é.

- [ ] **T020** Confirmar SC-004 por leitura: nenhum usuário que nunca abriu a tela muda de comportamento. Como ausência de linha resolve para o padrão ligado, e nada semeia linhas (decisão A2), isso é verdade por construção — mas deve ser afirmado por teste, não por raciocínio.

---

## Dependências

```
T001 → T002 → T003 → T004        (fundação, série)
T003 → T005 → T006 → T007        (domínio; T007 é portão)
T007 → T008 → T009 → T010, T011  (integração; T010/T011 [P] entre si)
T005 → T012 → T013 → T014        (rota)
T012 → T015 → T016 → T017        (interface)
tudo → T018 → T019 → T020
```

Paralelizável de verdade: **T010 ‖ T011**, e **Fase D ‖ Fase E** depois de T012 existir. O resto é série — Fase B é fundação de tudo que vem depois.

## Critério de pronto

Não é "as tarefas estão marcadas". É:

1. As 20 tarefas concluídas.
2. Os dois portões de reversão (T007, T019) exercitados de fato, com a suíte observada vermelha e depois verde.
3. A bateria de T018 limpa, incluindo os dois verificadores de migration.
4. Os seis critérios de sucesso da spec afirmados por teste, não por leitura.

## Fora deste ciclo

- **US2 (erros de sincronização)** e **US3 (resumo semanal)**: precisam de valor novo em `NotificationEventType` e de produtor. T016 tira os interruptores da tela justamente para que não fiquem fingindo funcionar até lá.
- **Preferência por canal**, **por empresa**, e **rota de administrador para preferência alheia**: fora de escopo pela spec.
