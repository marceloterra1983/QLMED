---
id: SPEC-016
status: approved
owner: QLMED
related_decisions: [ADR-0011]
affected_modules:
  - notification-outbox
  - pwa
  - settings-ui
---

# Feature Specification: Aviso no celular quando a nota é recebida

**Feature Branch**: `feat/pwa-invoice-push`

**Created**: 2026-08-27

**Status**: Approved

**Input**: O PWA deve avisar no telefone quando uma nota fiscal recebida entra
no sistema. A autorização no WhatsApp será por link; este canal é o toque no
aparelho, sem enquete e sem botão nativo do WhatsApp.

## Problem

E-mail e WhatsApp (grupo) já avisam a equipe. Quem usa o QLMED instalado no
celular não recebe um toque no aparelho. O usuário pediu esse aviso no PWA,
não um aplicativo de loja.

## User scenarios and testing

### User Story 1 — Ligar o aviso neste aparelho (Priority: P1)

Como operador, em Configurações, ativo “Avisar neste aparelho”. O sistema pede
permissão do navegador. Se eu aceitar, este telefone passa a poder receber o
toque.

**Independent Test**: Com sessão autenticada, gravar uma inscrição válida e
relê-la; sem sessão, a gravação é recusada.

**Acceptance Scenarios**:

1. **AC-001** — Given um usuário ativo autenticado, when ele autoriza o aviso
   neste aparelho com inscrição válida, then a inscrição fica associada só a
   ele e sobrevive a um novo login no mesmo aparelho.
2. **AC-002** — Given uma requisição sem sessão de usuário, when alguém tenta
   gravar inscrição, then o sistema recusa (não vale chave de API).
3. **AC-003** — Given o mesmo endereço de inscrição usado por outro usuário,
   when o usuário atual grava, then o endereço passa a ser dele (troca de
   conta no mesmo navegador).

### User Story 2 — Toque quando a nota recebida entra (Priority: P1)

Como operador com o aviso ligado neste aparelho e com preferência de “novas
notas” ligada, quando uma NF-e ou CT-e recebida recente é importada, o
telefone toca mesmo com o site fechado. O toque abre a nota no QLMED.

**Independent Test**: Montar destinos com VAPID ligado, usuário elegível e um
endereço de inscrição; existe um destino `push` com esse endereço. Sem VAPID
ou sem inscrição, não existe destino `push`.

**Acceptance Scenarios**:

1. **AC-004** — Given VAPID configurado e usuário elegível com inscrição, when
   o outbox monta destinos de uma NF-e/CT-e recebida na janela, then existe
   um destino `push` por inscrição.
2. **AC-005** — Given o usuário desligou “notificar novas notas”, when o outbox
   monta destinos, then não existe `push` para ele.
3. **AC-006** — Given VAPID ausente, when o outbox monta destinos, then não
   existe `push` e e-mail/WhatsApp seguem iguais.
4. **AC-007** — Given o toque enviado, when o usuário abre a notificação, then
   o QLMED abre no caminho da nota (mesmo destino do clique rastreado).

### User Story 3 — Um aparelho, um toque; falha não derruba a nota (Priority: P1)

Como operador, dois aparelhos meus recebem um toque cada. Se o navegador
invalidou a inscrição, o sistema esquece essa inscrição e a importação da
nota não falha.

**Independent Test**: Dois endereços no mesmo usuário geram dois destinos
`push`. Normalizar endereço inválido lança; inscrição 410 some.

**Acceptance Scenarios**:

1. **AC-008** — Given duas inscrições do mesmo usuário elegível, when o outbox
   monta destinos, then há dois `push` distintos.
2. **AC-009** — Given o provedor responde que a inscrição morreu, when o envio
   é tentado, then a inscrição é apagada e a entrega não fica em retentativa
   infinita.
3. **AC-010** — Given falha de envio do toque, when a nota é importada, then a
   nota permanece gravada; o toque segue o outbox (`dead`/`uncertain`), como
   e-mail e WhatsApp.

## Requirements

### Functional requirements

- **FR-001**: O sistema MUST persistir, por usuário autenticado, a inscrição
  deste aparelho (endereço + chaves de envio), com cascade se o usuário sair.
- **FR-002**: Só a sessão do próprio usuário MUST criar ou apagar a inscrição.
  Chave de API MUST NOT gravar inscrição pessoal.
- **FR-003**: Com VAPID configurado, o outbox MUST criar um
  `NotificationDelivery` `push` por inscrição de cada usuário elegível
  (`selectNotifiableUsers`) na mesma janela de idade da nota (SPEC-010/015).
- **FR-004**: Sem VAPID, ou sem inscrição, o outbox MUST NOT criar `push`.
  E-mail e WhatsApp MUST permanecer inalterados (SPEC-015).
- **FR-005**: Preferência `invoice_received` desligada MUST silenciar o `push`
  daquele usuário (mesmo filtro do e-mail pessoal).
- **FR-006**: O texto do toque MUST identificar tipo (NF-e/CT-e), número e
  emitente. MUST NOT incluir XML, chave de acesso ou credencial.
- **FR-007**: O toque MUST abrir o QLMED no caminho da nota, com o mesmo
  rastreio de clique (`/r/{deliveryId}`) quando a entrega existir.
- **FR-008**: Inscrição rejeitada em definitivo pelo provedor (endereço morto)
  MUST ser removida.
- **FR-009**: O worker MUST tratar `push` como canal próprio: não enviar como
  WhatsApp e não baixar PDF/XML só para o toque.

### Failure cases

- **FAIL-001**: VAPID ausente ou inválido — nenhum `push` é enfileirado; a
  importação da nota não quebra.
- **FAIL-002**: Endereço de inscrição inválido (não HTTPS) — a gravação é
  recusada; destinos malformados não entram no outbox.
- **FAIL-003**: Provedor 410/404 na inscrição — entrega `dead`, inscrição
  apagada.
- **FAIL-004**: Provedor 5xx ou timeout depois do envio iniciado — `uncertain`,
  sem retentativa automática (mesma regra do outbox atual).

### Non-functional

- Segredos VAPID não entram no repositório. A chave pública pode ir ao
  navegador autenticado.
- Logs não registram XML, chave de acesso, endpoint completo nem chaves da
  inscrição.
- Evidência automatizada proporcional: destinos, normalização, payload sem
  dado fiscal sensível.

### Out of scope

- App na Play Store / App Store / TWA / Capacitor.
- Push para nota emitida, NFS-e, erro de sync ou resumo diário.
- Preferência por canal (e-mail sim / push não) além do interruptor já
  existente de “novas notas”.
- Enquete ou botão no WhatsApp.
- Tela de autorização de fluxo (link do WhatsApp) — decisão futura.

## Key entities

- **Inscrição de aparelho**: endereço HTTPS do navegador + chaves de envio,
  dono = usuário da sessão.
- **Entrega `push`**: uma linha do outbox por evento e endereço, mesma máquina
  de estados das demais entregas.

## Assumptions

- O usuário instala o PWA (Android Chrome; iPhone via Safari → Tela de Início)
  e autoriza notificação. Sem permissão, não há toque.
- iPhone só recebe depois de instalado na Tela de Início (iOS 16.4+).
- Um usuário, vários aparelhos: um toque por inscrição.

## Success criteria

- **SC-001**: Operador com aviso ligado neste aparelho recebe o toque na
  importação de uma NF-e/CT-e recebida recente, sem abrir o site antes.
- **SC-002**: Quem desligou “novas notas” ou nunca autorizou o aparelho não
  recebe toque.
- **SC-003**: E-mail e WhatsApp do mesmo evento não mudam de quantidade nem de
  destinatário por causa deste canal.
- **SC-004**: O toque não expõe XML nem chave de acesso.
