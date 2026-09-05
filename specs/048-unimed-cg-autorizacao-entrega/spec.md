---
id: SPEC-048
status: approved
owner: QLMED
affected_modules:
  - unimed-cg-ingest
  - gestao-unimed-cg-ui
  - graph-mail-client
  - whatsapp-evolution
related_specs:
  - SPEC-045
---

# Feature Specification: Autorização para entrega Unimed CG (OPME)

**Feature Branch**: `feat/unimed-cg-entrega-cards`

**Created**: 2026-09-05

**Status**: Approved

**Input**: Ingerir e-mails OPME Unimed Campo Grande com assunto de etapa de autorização concluída, gerar PDF, gravar no OneDrive, notificar WhatsApp e expor segunda tabela em `/gestao/unimed-cg` ao lado do faturamento.

## Contexto

SPEC-045 cobre autorização de faturamento. O mesmo remetente também envia `[ID N] [OPME] etapa de autorização concluída` (autorização para entrega). O operador precisa das duas filas na mesma página, em cards recolhidos.

## Decisões fechadas

- Remetente e caixas: iguais ao SPEC-045 (`naoresponda.unimedcg@opmes.com.br`, Marcelo/Flavio)
- Assunto entrega: `[ID N] [OPME] etapa de autorização concluída` → Processo = `N`
- Link: "Clique aqui" / "CLIQUE AQUI" → `visualiza-email-processo.php` (host allowlist)
- OneDrive: mesma pasta `1 - DOCUMENTOS/0 - AUTORIZACOES/UNIMED-CG`
- Nome do PDF: `UNIMED-CG-ENTREGA {processId}.pdf`
- WhatsApp: mesmo grupo (`UNIMED_CG_*`), caption específica de entrega
- UI: dois `Section` com `defaultOpen={false}`:
  - `AUTORIZAÇÃO DE FATURAMENTO` (tabela SPEC-045; agora em card recolhido)
  - `AUTORIZAÇÃO PARA ENTREGA` (nova)
- Colunas entrega: Processo | Autorização principal | Situação | Data autorização | Fornecedor | Recebido em | PDF
- Campos parseados: Solicitação/processId, Autorização Principal, Situação, Data de Autorização, Fornecedores
- Persistência expand-only: `UnimedCgDeliveryAuthorization` + `UnimedCgDeliverySourceMessage` (enum `UnimedCgParseStatus` reutilizado)
- Sync único: um POST processa faturamento e entrega

## User Scenarios

### Cenário 1 — Operador abre a página

1. Acessa `/gestao/unimed-cg`
2. Vê dois cards recolhidos (Faturamento e Entrega)
3. Expande cada um e vê a tabela correspondente (ou empty state)

### Cenário 2 — Ingestão de entrega

1. Chega e-mail com assunto de etapa concluída
2. Sistema baixa HTML do link, gera PDF, grava OneDrive, notifica WhatsApp
3. Linha aparece na tabela de entrega (dedupe por `internetMessageId` / `processId`)

## Requisitos

- FR-001: Assunto de entrega não pode ser descartado pelo filtro de faturamento
- FR-002: Deduplicação independente da tabela de faturamento (mesmo processId pode existir nas duas)
- FR-003: PDF de entrega e faturamento convivem na mesma pasta com nomes distintos
- FR-004: API lista retorna `billing` e `deliveries` (página atualizada no mesmo PR; sem depender de `items`)
- FR-005: Detalhe/arquivo de entrega em rotas `/api/gestao/unimed-cg/entrega/[id]`(+`/arquivo`)

## Fora de escopo

- Backfill OneDrive
- Tabela de itens de linha / procedimentos
- Grupo WhatsApp separado
