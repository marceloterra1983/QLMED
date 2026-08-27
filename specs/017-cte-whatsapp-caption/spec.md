---
id: SPEC-017
status: approved
owner: QLMED
related_decisions: [ADR-0010]
affected_modules:
  - notification-outbox
---

# Feature Specification: Caption curta do CT-e no WhatsApp

**Feature Branch**: `feat/cte-whatsapp-caption`

**Created**: 2026-08-27

**Status**: Approved

**Input**: A mensagem de CT-e recebido no WhatsApp hoje lista emitente por
extenso, valor e chave de 44 dígitos. O operador pediu texto curto: nome da
transportadora em uma palavra, cidade de origem (Campo Grande como C.G.),
ícone de caminhão e cidade de destino. Sem chave.

## Problem

O aviso de transporte no grupo WhatsApp é denso demais para leitura no celular.
A razão social completa (ex.: AZUL LINHAS AEREAS BRASILEIRAS SA) e a chave
ocupam a tela; a rota (de onde sai / para onde vai) não aparece, que é o que
a equipe usa para reconhecer o frete.

## User scenarios and testing

### User Story 1 — Ler o frete de relance (Priority: P1)

Como operador no grupo WhatsApp, ao chegar um CT-e recebido vejo nome curto
da transportadora, origem, destino e valor. Não vejo número nem chave.

**Independent Test**: Montar o texto do WhatsApp com emitente Azul, origem
Campo Grande, destino São Paulo e valor 325,63; o texto contém AZUL, C.G.,
caminhão apontando à direita e São Paulo; não contém número nem a chave.

**Acceptance Scenarios**:

1. **AC-001** — Given um CT-e da Azul Linhas Aéreas com origem Campo Grande,
   when o WhatsApp é montado, then o nome exibido é `AZUL` e a origem é `C.G.`.
2. **AC-002** — Given o mesmo CT-e, when o WhatsApp é montado, then o texto
   contém caminhão apontando à direita e a cidade de destino, e MUST NOT
   conter número do documento, `Nº`, a chave de acesso nem o rótulo `Chave:`.
3. **AC-003** — Given um CT-e da Pantanal, when o WhatsApp é montado, then o
   nome exibido é `PANTANAL`.

### User Story 2 — E-mail e NF-e não mudam (Priority: P1)

Como operador de e-mail e de NF-e, o aviso atual (número, emitente por
extenso, valor, chave) permanece. Só o WhatsApp de CT-e muda.

**Independent Test**: O texto de e-mail de CT-e e o WhatsApp de NF-e ainda
incluem número, emitente completo, valor e chave.

**Acceptance Scenarios**:

1. **AC-004** — Given um CT-e, when o e-mail é montado, then o corpo ainda
   inclui a chave e o emitente por extenso.
2. **AC-005** — Given uma NF-e, when o WhatsApp é montado, then o texto
   permanece o de hoje (incluindo chave).

### User Story 3 — Sem rota no XML (Priority: P2)

Como operador, se o XML do CT-e não tiver município de início ou fim, a
mensagem ainda sai com transportadora curta e valor, sem inventar cidade.

**Independent Test**: Caption sem `xMunIni`/`xMunFim` omite a linha da rota
e não inventa C.G.

**Acceptance Scenarios**:

1. **AC-006** — Given um CT-e sem municípios de prestação, when o WhatsApp é
   montado, then não há linha de rota e o restante do texto segue válido.

## Requirements

### Functional requirements

- **FR-001**: O caption WhatsApp de CT-e recebido MUST usar o nome curto da
  transportadora (uma palavra de marca: AZUL, PANTANAL, ou a primeira palavra
  significativa da razão social).
- **FR-002**: Campo Grande (qualquer capitalização) MUST aparecer como `C.G.`.
  Outras cidades MUST aparecer pelo nome do município, sem inventar sigla.
- **FR-003**: Quando origem e destino existirem, o caption MUST mostrar
  origem, caminhão apontando à direita (destino) e destino na mesma linha.
- **FR-004**: O caption WhatsApp de CT-e MUST NOT incluir a chave de acesso
  nem o rótulo `Chave:`.
- **FR-008**: O caption WhatsApp de CT-e MUST NOT incluir o número do
  documento nem o rótulo `Nº`.
- **FR-005**: E-mail (CT-e e NF-e) e WhatsApp de NF-e MUST permanecer com o
  texto atual (número, emitente/transportadora por extenso, valor, chave).
- **FR-006**: Sem município de início ou fim no documento, o sistema MUST
  omitir a linha da rota; MUST NOT inventar cidade.
- **FR-007**: O XML completo MUST NOT ser enviado ao worker; só campos já
  necessários ao texto (nome curto, cidades, valor, caption).

### Failure cases

- **FAIL-001**: XML sem `xMunIni`/`xMunFim` — caption sem rota; envio segue.
- **FAIL-002**: Razão social vazia — exibe `-` no lugar do nome curto.
- **FAIL-003**: Valor ausente — exibe `R$ 0,00` (mesmo critério do texto atual).

### Non-functional

- Sem migration. Cidades saem do XML já persistido na nota.
- Logs não registram XML nem chave.
- Evidência: testes unitários do caption e do worker.

### Out of scope

- Alterar o toque PWA (SPEC-016).
- Alterar destino do grupo (SPEC-015).
- Persistir origem/destino como colunas.
- Abreviação de outras cidades além de Campo Grande.
- Reenviar mensagens já entregues.

## Key entities

- **Caption WhatsApp de CT-e**: texto curto (marca, rota, valor) +
  link rastreado. Sem número e sem chave.
- **Nome curto da transportadora**: uma palavra reconhecível da razão social.

## Success Criteria

- **SC-001**: Operador identifica transportadora e rota em uma tela de
  WhatsApp, sem rolar para achar a chave.
- **SC-002**: 100% dos captions de CT-e gerados nos testes de aceite não
  contém chave de 44 dígitos.
- **SC-003**: E-mail e WhatsApp de NF-e continuam com o mesmo conteúdo de
  antes desta mudança (regressão coberta por teste).

## Assumptions

- Só Campo Grande tem sigla pedida (`C.G.`).
- Rota usa 🚛➡️: 🚚 sozinho aponta para a esquerda no iPhone/WhatsApp.
- Valor continua no WhatsApp; número e chave não.
- Destino e origem vêm de `xMunIni` e `xMunFim` do CT-e (início/fim da
  prestação), não da cidade de emissão.
