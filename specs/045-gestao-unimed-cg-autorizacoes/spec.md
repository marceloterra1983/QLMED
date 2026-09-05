---
id: SPEC-045
status: approved
owner: QLMED
affected_modules:
  - unimed-cg-ingest
  - gestao-unimed-cg-ui
  - graph-mail-client
  - whatsapp-evolution
---

# Feature Specification: Autorizações Unimed CG (OPME)

**Feature Branch**: `feat/gestao-unimed-cg-autorizacoes`

**Created**: 2026-09-05

**Status**: Approved

**Input**: Ingerir e-mails OPME Unimed Campo Grande das caixas Marcelo/Flavio, abrir o link "Clique aqui", gerar PDF, gravar no OneDrive, notificar WhatsApp via Evolution e expor tabela enxuta em `/gestao/unimed-cg`.

## Contexto

IMPCG e CASSEMS já entregam autorização por e-mail com PDF anexo. Unimed CG envia e-mail HTML com link público OPME (`unimedcg.opmes.com.br`) sem anexo. O operador precisa do mesmo fluxo operacional: arquivo no OneDrive, aviso no grupo WhatsApp e listagem em Gestão.

## Decisões fechadas

- Remetente: `naoresponda.unimedcg@opmes.com.br`
- Assunto: `[ID N] [OPME] autorização de faturamento do processo` → **Processo** = `N`
- Caixas: `marcelo@qlmed.com.br`, `flavio@qlmed.com.br`
- PDF: URL do "Clique aqui" via Puppeteer (host allowlist `unimedcg.opmes.com.br`)
- OneDrive: `1 - DOCUMENTOS/0 - AUTORIZACOES/UNIMED-CG` / `faturamento@qlmed.com.br`
- WhatsApp: `UNIMED_CG_WHATSAPP_ENABLED` + `UNIMED_CG_WHATSAPP_GROUP_JID` (Evolution, sem n8n)
- Intervalo: 15 minutos
- ACL: igual IMPCG (`canAccessPage` + sync admin|editor)
- Sem tabela de itens de linha na v1
- Sem backfill de pasta OneDrive na v1

## User Scenarios

### US1 — Ver autorizações (P1)

Como operador com acesso a `/gestao/unimed-cg`, quero ver Processo, Autorização, Data prev., Local, Valor total, Recebido em e PDF.

### US2 — E-mail vira arquivo e linha (P1)

Como sistema, ao receber e-mail do remetente com assunto OPME de faturamento, extrair o link, gerar PDF, persistir e avisar WhatsApp.

## Functional Requirements

- **FR-001**: Listar mensagens Graph por remetente **sem** exigir anexo (`$search` `from:`) nas caixas configuradas.
- **FR-002**: Filtrar assunto `[ID N] [OPME] autorização de faturamento do processo`; `processId` = `N` (assunto é autoridade se divergir do HTML).
- **FR-003**: Extrair URL do "Clique aqui" do HTML do corpo; fetch allowlist + parse de Processo, Autorização, Data prevista, Local, Valor total.
- **FR-004**: Gerar PDF via `renderUrlToPdf` com allowlist `unimedcg.opmes.com.br`; upload OneDrive; persistir `UnimedCgAuthorization`.
- **FR-005**: Dedup por `internetMessageId` e unique `(companyId, processId)`.
- **FR-006**: Notificar WhatsApp Evolution com PDF e caption:
  ```
  Autorização Unimed CG — Processo {processId}
  Autorização: {authorizationNumber}
  Local: {location}
  Valor total: R$ {totalAmount}
  ```
  Falha de WA NÃO reverte persistência. Janela 7 dias. Destino só com env próprio.
- **FR-007**: Página `/gestao/unimed-cg` com colunas do plano; empty state "Nenhuma autorização Unimed CG."; modal com PDF viewer.
- **FR-008**: APIs `GET /api/gestao/unimed-cg`, `GET .../[id]`, `GET .../[id]/arquivo`, `POST .../sync` com ACL da página.
- **FR-009**: Rotina `unimed-cg-mail-ingest` a cada 15 min + bootstrap + advisory lock.

## Fora de escopo (v1)

- Outros e-mails OPME / pré-solicitação
- Itens de materiais editáveis
- n8n
- Backfill de pasta OneDrive
