# Implementation Plan: Preferências de notificação por usuário

**Branch**: `010-user-notification-preferences` | **Date**: 2026-08-26 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/010-user-notification-preferences/spec.md`

## Summary

Persistir, por usuário, quais tipos de notificação ele quer receber, e aplicar essa escolha no ponto onde os destinatários já são montados hoje.

A abordagem técnica em uma frase: **uma linha por (usuário, tipo de evento), chaveada ao enum `NotificationEventType`**, lida junto com os usuários na mesma consulta que o outbox já faz, e aplicada como condição adicional no filtro que já existe em `enqueueInvoiceEvent`.

Só a User Story 1 (P1, notas recebidas) está neste plano. P2 e P3 dependem de tipos de evento que não existem e entram em planos próprios — ver "Escopo excluído".

## Technical Context

**Language/Version**: TypeScript 6, Node (Next.js 15.5 App Router), React 19

**Primary Dependencies**: Prisma 7.9 + `@prisma/adapter-pg`, NextAuth 4.24, Zod 4, Sonner (toasts)

**Storage**: PostgreSQL canônico via `DATABASE_URL` protegida. CI usa o `qlmed_ci` descartável.

**Testing**: Vitest 4 (`environment: node`), testes em `src/lib/__tests__/`

**Target Platform**: Servidor Linux, self-hosted, atrás de `app.qlmed.com.br`

**Project Type**: Aplicação web única (Next.js full-stack); não há separação backend/frontend em pacotes

**Performance Goals**: Nenhuma consulta adicional por evento de notificação. A montagem de destinatários já roda dentro da transação de criação da nota e não pode ganhar uma ida ao banco por usuário.

**Constraints**: A escrita da preferência é interativa (interruptor na tela); alvo de resposta abaixo de 500 ms. A leitura no caminho de notificação não pode aumentar o número de round trips da transação existente.

**Scale/Scope**: Empresa única, dezenas de usuários ativos, um tipo de evento com produtor. O volume de `invoice_received` é o maior do sistema (uma por NF-e importada).

## Constitution Check

*GATE: avaliado antes da Fase 0 e reavaliado após a Fase 1.*

| Princípio | Situação | Como este plano atende |
|---|---|---|
| **I. Evidência executável obrigatória** | Atende | Mudança de comportamento com teste que **reprova antes** da implementação: um teste de `buildEligibleRecipients` que exige exclusão do usuário com preferência desligada falha contra o código atual, porque hoje a preferência não é sequer um parâmetro. Verificação por reversão, como já feito em `fiscal-period` e `financeiro-valor-color`. |
| **II. Autorização é do servidor** | Atende | A rota deriva o usuário da sessão autenticada; não existe parâmetro de id de usuário na requisição. Um usuário não consegue ler nem escrever preferência alheia, e isso é propriedade da rota, não da tela. |
| **III. Migrations Prisma donas do esquema** | Atende | Migration versionada, puramente aditiva (tabela nova). Sem DDL em runtime. Ver "Compatibilidade e rollback". |
| **IV. Rotas adaptam; `src/lib` implementa** | Atende | A rota autentica, valida com Zod e delega. Leitura, escrita e a regra de elegibilidade ficam em `src/lib/notification-preferences.ts`, consumível também pelo outbox. |
| **V. Segredos e dados fiscais contidos** | Atende | Preferência não é segredo e não carrega dado fiscal. Nenhum log novo de payload. |
| **VI. Uma fonte canônica por assunto** | Atende | O padrão de cada preferência é definido **em um lugar só** (`src/lib/notification-preferences.ts`) e consumido pela tela e pelo outbox. Hoje o padrão está duplicado como literal em `PreferencesSection.tsx:12-14`; essa duplicação some. |

**Violações**: nenhuma. A seção "Complexity Tracking" fica vazia por isso.

## Decisões de projeto

### D1 — Formato de armazenamento: linha por (usuário, tipo)

A spec deixou em aberto (`NEEDS CLARIFICATION` em Key Entities) entre linha por par, coluna estruturada ou coluna booleana por preferência. **Escolhido: linha por par**, chaveada ao enum `NotificationEventType`.

Motivos, em ordem de peso:

1. **Torna FR-007 estrutural em vez de policiado.** A spec exige que preferência sem produtor não apareça funcionando. Chaveando ao enum, uma preferência para um tipo que não existe é *irrepresentável* — não dá para gravar "resumo semanal" antes de o evento existir. A regra deixa de depender de revisão e passa a depender do banco.
2. **Ausência é o padrão, sem migração de dados.** Nenhuma linha para usuário existente significa comportamento atual preservado (FR-003), então a migration não precisa preencher nada para os usuários já cadastrados.
3. **`onDelete: Cascade` entrega FR-008 de graça**, sem código de limpeza.
4. **P2/P3 não pedem migração de esquema** — pedem valor novo no enum, que precisariam de qualquer jeito por causa do produtor.

Alternativas rejeitadas:

| Alternativa | Rejeitada porque |
|---|---|
| Coluna booleana por preferência em `User` | Cada tipo novo vira migration. Pior: permite gravar preferência de um tipo sem produtor, exatamente o que FR-007 proíbe. |
| Coluna JSON em `User` | Sem integridade referencial com o enum; filtrar em SQL fica desajeitado; um typo em chave passa despercebido. |

### D2 — Onde a preferência entra no caminho de notificação

`enqueueInvoiceEvent` (`src/lib/notification-outbox.ts:160-181`) já busca os usuários ativos e filtra por `canReceiveInvoiceNotifications(user, invoice.type)`, que é **função pura** de `role` e `allowedPages` (linha 58).

A preferência entra como condição adicional nesse mesmo ponto, carregada na **mesma** consulta via `include`, para não acrescentar round trip (ver Performance Goals). A função de elegibilidade ganha a preferência como parâmetro e continua pura — o que a mantém testável sem banco, como hoje.

Decisão deliberada: **não** alterar a assinatura de `canReceiveInvoiceNotifications`. Ela responde "esse usuário *pode* ver essa nota", que é autorização. Querer receber é outra pergunta. Misturar as duas faria a preferência parecer controle de acesso, e um bug futuro em preferência viraria vazamento de autorização. Duas funções, uma composição.

### D3 — Interruptores sem produtor não vão para a tela

Os interruptores "erros de sincronização" e "resumo semanal" **saem** da tela nesta entrega, em vez de ficarem visíveis e inertes. Mantê-los seria repetir o defeito que a spec existe para corrigir, apenas com persistência por baixo — o usuário salvaria uma preferência que ninguém lê.

Voltam quando seus respectivos eventos e produtores existirem (SPEC-010-P2, SPEC-010-P3).

## Project Structure

### Documentation (this feature)

```text
specs/010-user-notification-preferences/
├── spec.md              # já existe
├── plan.md              # este arquivo
├── data-model.md        # Fase 1
├── contracts/           # Fase 1 — contrato da rota
└── tasks.md             # Fase 2 (/speckit-tasks), não criado aqui
```

### Source Code (repository root)

Aplicação web única; caminhos reais do repositório:

```text
prisma/
├── schema.prisma                                   # + model UserNotificationPreference
└── migrations/<timestamp>_user_notification_preferences/

src/lib/
├── notification-preferences.ts                     # NOVO — padrões, leitura, escrita, elegibilidade
├── notification-outbox.ts                          # ALTERADO — compõe a preferência no filtro
└── __tests__/
    ├── notification-preferences.test.ts            # NOVO — unitário, sem banco
    └── notification-outbox.integration.test.ts     # ALTERADO — cobre exclusão por preferência

src/app/api/users/me/notification-preferences/
└── route.ts                                        # NOVO — GET e PUT, usuário da sessão

src/app/(painel)/sistema/settings/components/
└── PreferencesSection.tsx                          # ALTERADO — estado do servidor, não useState solto
```

**Structure Decision**: sem diretório novo de topo. A regra vive em `src/lib` (Princípio IV), a rota é fina sob `src/app/api`, e a tela consome a rota. Testes seguem a convenção já vigente, `src/lib/__tests__/` — verificado: é onde estão todos os 43 arquivos de teste do repositório.

## Compatibilidade e rollback

Exigido pelo Princípio III.

**Compatibilidade**: a mudança é aditiva. Nenhuma coluna existente muda de tipo, nome ou nulidade; nenhuma linha existente é reescrita. Não há passo de expand/contract porque não há mudança incompatível — a tabela nasce vazia e a ausência de linha já significa o comportamento atual.

**Ordem de implantação**: a migration pode subir antes do código, sem efeito. O código novo lê a tabela e, não achando linha, aplica o padrão. Não há janela em que o esquema novo e o código antigo se contradigam.

**Rollback**: reverter o código restaura exatamente o comportamento anterior, mesmo com a tabela preenchida — o código antigo não a consulta. A tabela pode ser removida depois, em migration própria, sem pressa. Nenhum dado fiscal depende dela.

**Verificação de migration**: `npm run db:migrate:verify` e `npm run db:reconcile:verify`, exigidos pelos Quality Gates para mudança de banco.

## Estratégia de testes

Proporcional ao risco, conforme Princípio I. O risco central é **notificação deixar de ser entregue a quem a queria** — falso negativo é pior que falso positivo aqui.

1. **Unitário, sem banco** (`notification-preferences.test.ts`): a função de elegibilidade com preferência ligada, desligada e ausente; o padrão por tipo; e a garantia de que ausência equivale a ligado para `invoice_received`.
2. **Reversão obrigatória**: com a condição de preferência removida da composição, o teste de exclusão **deve reprovar**. Sem isso o teste não protege nada — mesma verificação aplicada nas correções do PR #164.
3. **Integração** (`notification-outbox.integration.test.ts`, já existente): importar nota com dois usuários ativos, um com preferência desligada, e afirmar que a contagem de `NotificationDelivery` cai exatamente um, com o outro intacto. Cobre o Cenário 4 da User Story 1 (preferência é individual, nunca global).
4. **Destinatário institucional**: teste afirmando que `NOTIFICATION_ALWAYS_EMAIL` sobrevive a qualquer preferência desligada (FR-006).
5. **Interface**: teste de que falha na gravação reverte o interruptor (FR-004) — o defeito original era exatamente o controle mudar sem nada ter sido salvo.

## Quality gates

Da constituição, todos obrigatórios antes do merge:

```bash
npm run docs:validate
npx tsc --noEmit
npm run lint
npm test
npm run build
npm run db:migrate:verify      # exigido por ser mudança de banco
npm run db:reconcile:verify    # idem
```

## Escopo excluído

Explícito, conforme exigência da constituição para specs:

- **User Story 2 (erros de sincronização)** e **User Story 3 (resumo semanal)**: dependem de valores novos em `NotificationEventType` e de produtores que os disparem. Nenhum dos dois existe. Entram em planos próprios; este plano deliberadamente não cria enum nem interruptor para eles (D3).
- **Escolha de canal por preferência** (querer e-mail mas não WhatsApp): a spec trata preferência por *evento*, não por canal. Desligar corta os dois canais daquele usuário.
- **Preferência por empresa**: o sistema é de empresa única.
- **Interface de administrador para editar preferência alheia**: FR-005 restringe cada usuário às próprias.
- **Migração de dados históricos**: desnecessária por construção (ausência = padrão).

## Ambiguidades resolvidas

Ambas decididas pelo dono em 2026-08-26. Nenhuma pendência bloqueia a Fase 2.

### A1 — Log de acesso reusa `user_updated`

FR-009 grava com a ação **`user_updated`**, já existente em `AccessLogAction`. Não se cria valor novo: o enum é compartilhado, e ampliá-lo por uma feature obrigaria todo consumidor de log a lidar com um valor a mais.

Custo aceito e mitigado: `user_updated` passa a cobrir dois eventos distintos — administrador alterando um usuário, e usuário alterando a própria preferência. Quem auditar precisa distinguir os dois. O campo `path` de `AccessLog` (`String?`) faz isso, e é o mesmo recurso que `requireSessionRole` já usa para qualificar `permission_denied` (`path: "required=session:${minRole}"`, `auth.ts:224`).

Convenção adotada, seguindo esse precedente: `path` recebe `"notification-preferences"` mais os tipos alterados. Sem o `path`, os dois eventos ficariam indistinguíveis no log — que é exatamente o risco de reusar um valor de enum.

### A2 — Usuário novo nasce ligado

Usuários criados depois desta feature seguem o mesmo padrão dos existentes: **ligado** para `invoice_received`, sem linha gravada.

Isso simplifica a implementação de forma relevante: a criação de usuário **não** precisa ser tocada. Nenhum gancho no fluxo de registro, nenhuma linha semeada, nenhum caminho novo que possa falhar pela metade. A regra é uma só — ausência significa o padrão — e vale para todo usuário, de qualquer época.

Se a decisão tivesse sido "nasce desligado", seria preciso semear linhas na criação, e passaria a existir a possibilidade de um usuário sem linha por falha de semeadura, indistinguível de um usuário legítimo sem linha.
