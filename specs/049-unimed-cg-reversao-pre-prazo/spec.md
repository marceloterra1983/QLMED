---
id: SPEC-049
status: approved
owner: QLMED
affected_modules:
  - unimed-cg-ingest
  - gestao-unimed-cg-ui
  - graph-mail-client
  - whatsapp-evolution
  - opme-portal
related_specs:
  - SPEC-045
  - SPEC-048
---

# Feature Specification: Unimed CG — Reversão, Pré-solicitação, Prazo NF + Beneficiário

**Feature Branch**: `feat/unimed-cg-reversao-pre-prazo`

**Created**: 2026-09-05

**Status**: Approved

## Contexto

Além de faturamento (SPEC-045) e entrega (SPEC-048), o remetente OPME Unimed CG envia e-mails de reversão de processo, pré-solicitação/cotação e alerta de prazo de Nota Fiscal. A página `/gestao/unimed-cg` passa a ter cinco `Section` recolhidas.

## Decisões fechadas

- Remetente/caixas: iguais ao SPEC-045
- Assuntos:
  - Reversão: `[ID N] [OPME] Reversão de Processo`
  - Pré: `[OPME] solicitação para completar dados da pré-solicitação [Eletivo|Urgente]?`
  - Prazo NF: `[ID N] [OPME]` + `prazo para lançamento da Nota Fiscal`
- PDF dos três novos kinds: HTML do e-mail via `renderHtmlToPdf` (sem depender de Clique aqui público)
- OneDrive: pasta `UNIMED-CG`; nomes `UNIMED-CG-REVERSAO`, `UNIMED-CG-PRE-SOLICITACAO`, `UNIMED-CG-PRAZO-NF`
- WhatsApp: mesmo grupo `UNIMED_CG_*`, captions distintas
- Beneficiário: enriquecimento via portal OPME (`UNIMED_CG_OPME_USERNAME` / `UNIMED_CG_OPME_PASSWORD` — só nomes de env neste doc; nunca hardcode de senha). Sessão reutilizada no tick. UI coluna **Beneficiário / Local** (paciente acima, local abaixo)

## UI

Cinco sections `defaultOpen={false}`:
1. AUTORIZAÇÃO DE FATURAMENTO
2. AUTORIZAÇÃO PARA ENTREGA
3. REVERSÃO DE PROCESSO
4. PRÉ-SOLICITAÇÃO
5. PRAZO DE NOTA FISCAL

## Fora de escopo

- Solver de captcha de terceiros
- Grupo WhatsApp separado
