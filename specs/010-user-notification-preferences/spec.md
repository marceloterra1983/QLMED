---
id: SPEC-010
status: draft
owner: QLMED
affected_modules:
  - settings-ui
  - notification-outbox
---

# Feature Specification: Preferências de notificação por usuário

**Feature Branch**: `010-user-notification-preferences`

**Created**: 2026-08-26

**Status**: Draft

**Input**: Achado crítico do levantamento das 19 telas do painel — os três interruptores de notificação em Configurações são `useState` local e não persistem nada.

## Contexto: o defeito que originou esta spec

`src/app/(painel)/sistema/settings/components/PreferencesSection.tsx:12-14` declara três estados locais:

```tsx
const [notifyNewInvoices, setNotifyNewInvoices] = useState(true);
const [notifySyncErrors, setNotifySyncErrors] = useState(true);
const [weeklyEmail, setWeeklyEmail] = useState(false);
```

Os três interruptores (linhas 102-155) alternam esses estados e **não fazem mais nada**: não há chamada de API, não há persistência, e nenhum outro ponto do sistema lê essas preferências. O usuário marca, vê o interruptor mudar de cor, recarrega a página e a escolha some — sem nunca ter existido.

Esta é a pior categoria de defeito de interface: silenciosa. Nada falha, nada avisa, e o usuário acredita ter configurado algo. Um usuário que desliga "notificar novas notas" continua recebendo todas as notificações.

Diferente do interruptor de tema, no mesmo componente, que **funciona** (`handleThemeChange`, linha 39, grava em `localStorage`). A inconsistência dentro do mesmo card reforça a expectativa de que os outros também salvam.

## O que já existe

O QLMED tem um pipeline de notificação real e funcionando — esta spec não o cria, apenas o torna configurável:

- `NotificationOutboxEvent` (`prisma/schema.prisma`) com `eventType`, cujo enum `NotificationEventType` hoje tem **um único valor**: `invoice_received`.
- `NotificationDelivery`, uma entrega por canal (`email`, `whatsapp`) por destinatário, com retentativa e idempotência.
- `src/lib/notification-outbox.ts:160-181` monta os destinatários: busca **todos** os usuários `status: 'active'`, filtra por `canReceiveInvoiceNotifications(user, invoice.type)` e passa para `buildInvoiceNotificationDestinations`.

O ponto de integração é preciso: hoje a elegibilidade de um usuário depende só de status, papel e páginas permitidas. A preferência do usuário é uma condição adicional nesse mesmo filtro.

**Consequência importante para o escopo**: os três interruptores têm custos muito diferentes.

| Interruptor | Evento existe? | Custo |
|---|---|---|
| Novas notas recebidas | Sim (`invoice_received`) | Ligar preferência ao filtro que já existe |
| Erros de sincronização | Não | Novo tipo de evento + produtor que o dispare |
| Resumo semanal | Não | Novo tipo + agendador + montagem do resumo |

Tratá-los como um bloco único foi o que fez o defeito parecer pequeno. Eles são três funcionalidades.

## User Scenarios & Testing

### User Story 1 - Desligar notificação de notas recebidas (Priority: P1)

Um usuário do painel que não trabalha com entrada de notas recebe hoje e-mail (e WhatsApp, se tiver telefone cadastrado) a cada NF-e importada. Ele abre Configurações › Notificações, desliga "Notificar novas notas recebidas", e para de receber — de verdade, e permanentemente.

**Why this priority**: É o único dos três que se conecta a um pipeline que já existe e já entrega. Entrega valor sozinho, sem nenhum evento novo, e corrige a parte do defeito silencioso que hoje mais engana o usuário. Também é o de maior impacto: o volume de `invoice_received` é o maior do sistema.

**Independent Test**: Desligar o interruptor, recarregar a página (a escolha permanece), importar uma NF-e, e verificar que nenhuma `NotificationDelivery` foi criada para aquele usuário, enquanto os demais usuários ativos continuam recebendo normalmente.

**Acceptance Scenarios**:

1. **Given** um usuário com a preferência ligada, **When** uma NF-e é importada, **Then** existe `NotificationDelivery` para ele, como hoje.
2. **Given** um usuário que desligou a preferência, **When** uma NF-e é importada, **Then** nenhuma `NotificationDelivery` é criada para ele.
3. **Given** um usuário que desligou a preferência, **When** ele recarrega Configurações, **Then** o interruptor aparece desligado.
4. **Given** um usuário que desligou a preferência, **When** outro usuário ativo tem a preferência ligada, **Then** o segundo continua recebendo — a preferência é individual, nunca global.
5. **Given** um usuário que nunca tocou no interruptor, **When** uma NF-e é importada, **Then** ele recebe (o padrão preserva o comportamento atual).
6. **Given** o destinatário institucional `NOTIFICATION_ALWAYS_EMAIL`, **When** qualquer usuário desliga sua preferência, **Then** o envio institucional continua — não é preferência de usuário e não pode ser desligado por um.

---

### User Story 2 - Ser avisado de falhas de sincronização (Priority: P2)

Um administrador quer saber quando a sincronização com a SEFAZ falha, sem precisar abrir Sistema › Erros para descobrir.

**Why this priority**: Depende de um tipo de evento que não existe. Entrega valor real (hoje a falha é silenciosa até alguém olhar), mas exige decidir o que conta como falha notificável e evitar tempestade de mensagens quando uma falha se repete a cada ciclo.

**Independent Test**: Forçar uma falha de sync e verificar que uma entrega é criada para os usuários com a preferência ligada, e apenas uma por janela de agrupamento.

**Acceptance Scenarios**:

1. **Given** um usuário com a preferência ligada, **When** um ciclo de sync termina com erro, **Then** ele é notificado uma vez.
2. **Given** a mesma falha se repetindo a cada ciclo, **When** vários ciclos falham dentro da janela de agrupamento, **Then** o usuário recebe uma notificação, não uma por ciclo.
3. **Given** um usuário sem permissão para a página Sistema › Erros, **When** ocorre a falha, **Then** ele não é notificado.

---

### User Story 3 - Resumo semanal por e-mail (Priority: P3)

Um usuário recebe, uma vez por semana, um e-mail com as principais movimentações fiscais do período.

**Why this priority**: É a única das três que precisa de agendamento e de montagem de conteúdo novo; nada disso existe. É também a de menor urgência — não corrige informação ausente, adiciona conveniência.

**Independent Test**: Disparar o resumo manualmente para um usuário e conferir que o conteúdo bate com o período e que quem desligou a preferência não recebe.

**Acceptance Scenarios**:

1. **Given** um usuário com a preferência ligada, **When** o resumo semanal é disparado, **Then** ele recebe um e-mail cobrindo a semana fechada.
2. **Given** um usuário com a preferência desligada (padrão), **When** o resumo é disparado, **Then** ele não recebe.
3. **Given** uma semana sem movimentação, **When** o resumo é disparado, **Then** [NEEDS CLARIFICATION: enviar um resumo vazio ou não enviar nada?]

### Edge Cases

- Usuário desligado (`status != 'active'`) que tinha preferências salvas: continua fora, por status; a preferência não o reativa.
- Usuário sem telefone cadastrado: a preferência governa o evento, não o canal. Desligar "novas notas" corta e-mail **e** WhatsApp daquele usuário.
- Preferência gravada e usuário excluído depois: a preferência deve sair junto (cascade), sem deixar órfã.
- Duas abas abertas alterando o mesmo interruptor: a última gravação vence; não há merge.
- Falha de rede ao gravar: o interruptor **não** pode ficar mostrando o estado novo. Ver FR-004.
- Preferência ausente no banco (usuário criado antes desta feature): vale o padrão, sem migração de dados obrigatória.

## Requirements

### Functional Requirements

- **FR-001**: O sistema MUST persistir, por usuário, o estado de cada preferência de notificação, sobrevivendo a recarga de página, novo login e troca de dispositivo.
- **FR-002**: O sistema MUST aplicar a preferência "novas notas recebidas" no momento de montar os destinatários de `invoice_received`, excluindo do envio o usuário que a desligou.
- **FR-003**: O sistema MUST tratar preferência ausente como o padrão que preserva o comportamento atual: novas notas **ligado**, erros de sync **ligado**, resumo semanal **desligado** — os mesmos valores hoje codificados em `PreferencesSection.tsx:12-14`. Isso vale igualmente para usuários criados depois desta feature: nascem **ligados** para `invoice_received`, sem linha gravada. Decidido pelo dono em 2026-08-26.
- **FR-004**: A interface MUST refletir apenas estado confirmado pelo servidor. Se a gravação falhar, o interruptor volta ao valor anterior e o erro é comunicado ao usuário. Nunca repetir o defeito atual, em que o controle muda de aparência sem nada ter sido salvo.
- **FR-005**: O sistema MUST permitir que um usuário leia e altere **apenas as próprias** preferências. Autorização verificada no servidor, nunca por visibilidade de interface.
- **FR-006**: O envio institucional (`NOTIFICATION_ALWAYS_EMAIL`) MUST permanecer fora do alcance das preferências individuais.
- **FR-007**: O sistema MUST manter as preferências ainda sem produtor (P2, P3) invisíveis ou explicitamente marcadas como indisponíveis até que seu evento exista — um interruptor que salva mas nunca surte efeito é o mesmo defeito com outra roupa.
- **FR-008**: A exclusão de um usuário MUST remover suas preferências.
- **FR-009**: Alterar uma preferência MUST ser registrado no log de acesso com a ação `user_updated`, reusando o valor já existente de `AccessLogAction`. Decidido pelo dono em 2026-08-26: não se cria valor novo no enum. O `path` do registro MUST distinguir a alteração de preferência das demais mudanças de perfil que compartilham a mesma ação.

### Key Entities

- **Preferência de notificação**: pertence a um usuário e a um tipo de notificação; guarda se aquele usuário quer receber aquele tipo. Some com o usuário. O conjunto de tipos precisa acompanhar `NotificationEventType`, de modo que um tipo novo não nasça sem preferência correspondente nem uma preferência sobreviva a um tipo removido.

  **Resolvido no plano (D1)**: uma linha por (usuário, tipo), chaveada ao enum `NotificationEventType`. O motivo decisivo não foi normalização — é que assim uma preferência para tipo sem produtor fica irrepresentável, e o FR-007 passa a ser propriedade do esquema em vez de regra policiada em revisão. Ver [plan.md](./plan.md) e [data-model.md](./data-model.md).

## Success Criteria

### Measurable Outcomes

- **SC-001**: Uma preferência alterada continua valendo após recarga, novo login e outro dispositivo — 100% dos casos, verificado por teste automatizado.
- **SC-002**: Um usuário que desliga "novas notas recebidas" tem zero `NotificationDelivery` criada para si em importações posteriores, enquanto os demais usuários ativos mantêm a contagem inalterada.
- **SC-003**: Nenhum controle da tela de Configurações altera sua aparência sem confirmação do servidor — verificado por teste que simula falha de gravação.
- **SC-004**: O comportamento de notificação de todo usuário que nunca abriu a tela permanece idêntico ao anterior à feature — nenhuma notificação perdida por causa da migração.

## Assumptions

- O pipeline de outbox (`notification-outbox.ts`) permanece o único caminho de notificação; esta feature adiciona uma condição de elegibilidade, não uma rota de envio paralela.
- O escopo é de empresa única, como o resto do sistema: preferência é por usuário, sem dimensão de empresa.
- P2 e P3 podem ser entregues em ciclos separados; P1 sozinho já é entregável e corrige a parte mais visível do defeito.
- A mudança de esquema segue migration versionada do Prisma, conforme `CLAUDE.md`. Não há DDL em runtime.
- Nenhum dado histórico precisa ser migrado: ausência de preferência significa padrão.
