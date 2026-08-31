---
id: SPEC-033
status: approved
owner: QLMED
related_decisions: [ADR-0010]
related_specs: [SPEC-017]
affected_modules:
  - notification-outbox
---

# Feature Specification: Caption curta da NF-e no WhatsApp

**Feature Branch**: `feat/nfe-whatsapp-caption`

**Created**: 2026-08-31

**Status**: Approved

**Input**: A mensagem de NF-e recebida no WhatsApp lista rótulos densos
(`Emitente/Transportadora:`, `Valor:`) e a chave de 44 dígitos. O operador
pediu texto curto: número, nome do emitente (apelido do cadastro quando
existir) e valor sem rótulo. Sem chave.

## Problem

O aviso de NF-e no grupo WhatsApp é denso demais para leitura no celular.
A chave e os rótulos ocupam a tela; o nome abreviado já cadastrado no contato
não é usado.

## User scenarios and testing

### User Story 1 — Ler a NF-e de relance (Priority: P1)

Como operador no grupo WhatsApp, ao chegar uma NF-e recebida vejo título,
número, nome do emitente e valor. Não vejo chave nem rótulos
`Emitente/Transportadora:` ou `Valor:`.

**Independent Test**: Montar o WhatsApp com número 39400, emitente Politec
Importacao e Comercio Ltda e valor 60895,80; o texto contém `Número: 39400`,
o nome e `R$ 60.895,80`; não contém `Chave:`, `Emitente/Transportadora:` nem
`Valor:`.

**Acceptance Scenarios**:

1. **AC-001** — Given uma NF-e recebida, when o WhatsApp é montado, then o
   texto MUST NOT conter a chave de acesso nem o rótulo `Chave:`.
2. **AC-002** — Given a mesma NF-e, when o WhatsApp é montado, then a linha
   do emitente MUST ser só o nome (sem `Emitente/Transportadora:`) e a linha
   do valor MUST ser só o montante formatado (sem `Valor:`).
3. **AC-003** — Given a mesma NF-e, when o WhatsApp é montado, then o texto
   MUST conter `Número:` e o número do documento.

### User Story 2 — Apelido do cadastro tem prioridade (Priority: P1)

Como operador, se o emitente tiver nome abreviado em Contatos, esse apelido
aparece no WhatsApp no lugar da razão social.

**Independent Test**: Caption com `senderShortName=Politec` e razão social
longa; o texto contém `Politec` e não a razão social completa.

**Acceptance Scenarios**:

1. **AC-004** — Given um apelido cadastrado para o CNPJ do emitente, when o
   WhatsApp é montado, then o nome exibido é o apelido.
2. **AC-005** — Given ausência de apelido, when o WhatsApp é montado, then o
   nome exibido é a razão social (`senderName`).

### User Story 3 — E-mail e CT-e não regredem (Priority: P1)

Como operador de e-mail, o aviso de NF-e por e-mail permanece com número,
emitente por extenso, valor e chave. O caption curto de CT-e (SPEC-017)
permanece.

**Independent Test**: `build_text` de NF-e ainda inclui `Chave:`; CT-e
WhatsApp continua usando `whatsappCaption` curto.

**Acceptance Scenarios**:

1. **AC-006** — Given uma NF-e, when o e-mail é montado, then o corpo ainda
   inclui a chave e o emitente por extenso com rótulos.
2. **AC-007** — Given um CT-e, when o WhatsApp é montado, then o caption
   curto da SPEC-017 permanece.

## Requirements

### Functional requirements

- **FR-001**: O caption WhatsApp de NF-e recebida MUST NOT incluir a chave
  de acesso nem o rótulo `Chave:`.
- **FR-002**: A linha do emitente MUST ser só o nome, sem
  `Emitente/Transportadora:`.
- **FR-003**: A linha do valor MUST ser só o montante em BRL (`R$ …`), sem
  o rótulo `Valor:`.
- **FR-004**: O caption MUST incluir `Número:` e o número do documento.
- **FR-005**: Se existir `ContactNickname.shortName` para o CNPJ do emitente
  na empresa da nota, o caption MUST usar esse apelido; senão MUST usar
  `senderName`.
- **FR-006**: E-mail (NF-e e CT-e) MUST permanecer com o texto completo
  atual (número, emitente/transportadora por extenso, valor, chave).
- **FR-007**: Caption WhatsApp de CT-e (SPEC-017) MUST permanecer inalterado.
- **FR-008**: O XML completo MUST NOT ser enviado ao worker; só campos já
  serializados no claim (incluindo `whatsappCaption` quando aplicável).

### Supersedes

- SPEC-017 **AC-005** e **FR-005** na parte “WhatsApp de NF-e permanece com
  o texto atual (incluindo chave)” — substituídos por esta spec.

## Success criteria

- Operador lê emitente e valor sem rolar a chave de 44 dígitos.
- Apelido cadastrado aparece quando existir.
- E-mail e CT-e WhatsApp sem regressão (testes automatizados).
