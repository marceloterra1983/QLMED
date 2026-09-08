---
id: SPEC-069
status: approved
owner: QLMED
affected_modules:
  - unimed-cg-ingest
  - gestao-unimed-cg-ui
  - gestao-unimed-cg-api
  - graph-mail-client
related_specs:
  - SPEC-045
  - SPEC-048
  - SPEC-049
---

# Feature Specification: Unimed CG — Ordem de Compra (SOULMV)

**Feature Branch**: `feat/069-unimed-cg-ordem-compra`

**Created**: 2026-09-08

**Status**: Approved

## Contexto

A Unimed Campo Grande envia ordens de compra do SOULMV por e-mail corporativo (`@unimedcg.coop.br`), com PDF anexo (`Relatório de Ordem de Compra`). O último remetente observado foi `jairo.teixeira@unimedcg.coop.br`. Esse fluxo é distinto dos e-mails OPME (`naoresponda.unimedcg@opmes.com.br`) já ingeridos em `/gestao/unimed-cg`.

O operador precisa ver as OCs recebidas no mesmo lugar das autorizações: card **ORDEM DE COMPRA** com número, produtos, quantidades, valores, CNPJ de faturamento e prazo de pagamento.

## Decisões fechadas

- Remetente SOULMV: qualquer endereço `@unimedcg.coop.br`
- Remetente GTPlan: `no-reply@gtplan.net` (assunto "Confirmação da Ordem de compra")
- Assunto: contém `ordem de compra` ou `ordem de compras` (acentos opcionais)
- Caixas: as mesmas do SPEC-045 (`marcelo@qlmed.com.br`, `flavio@qlmed.com.br`)
- Fonte: primeiro PDF anexo; SOULMV (`Ord. Compra`) ou GTPlan (`Número da ordem` / `unimedcg_{n}.pdf`)
- CNPJ de faturamento: o CNPJ do **comprador** no PDF (não o CNPJ/CPF do fornecedor QL MED)
- Prazo: `Desc. Condição de Pgto.` (ex.: `30 DIAS`)
- OneDrive: pasta `UNIMED-CG`; nome `UNIMED-CG-OC {orderNumber}.pdf`
- Intervalo: o mesmo tick `unimed-cg-mail-ingest` (15 min)
- ACL: igual aos demais cards Unimed CG
- WhatsApp: fora desta entrega
- Dinheiro: Decimal / centavos inteiros; sem float

## User Scenarios

### US1 — Ver ordens de compra (P1)

Como operador com acesso a `/gestao/unimed-cg`, quero um card **ORDEM DE COMPRA** listando as OCs recebidas com produtos, quantidade, valor unitário, valor total, CNPJ de faturamento e prazo.

### US2 — E-mail vira linha (P1)

Como sistema, ao receber e-mail do domínio Unimed CG com assunto de ordem de compra e PDF SOULMV, persistir a OC (dedup por mensagem e por número) e disponibilizar o PDF.

## Requirements

- FR-001: No mesmo tick de ingest Unimed CG, varrer as caixas por `from:unimedcg.coop.br` e assunto de ordem de compra.
- FR-002: Baixar o PDF anexo, extrair texto e parsear Ord. Compra, data, CNPJ comprador, prazo, itens (código, descrição, qtd, unitário, total) e valor total.
- FR-003: Persistência expand-only `UnimedCgPurchaseOrder` + `UnimedCgPurchaseOrderItem` + `UnimedCgPurchaseOrderSourceMessage`; unique `(companyId, orderNumber)` e `(companyId, internetMessageId)`.
- FR-004: Dedup: mensagem já vista não reprocessa; mesma OC em outro e-mail só grava origem, salvo upgrade de parse.
- FR-005: Upload OneDrive; falha de persistência coleta PDF órfão.
- FR-006: `GET /api/gestao/unimed-cg` inclui `purchaseOrders`; detalhe e arquivo em `/api/gestao/unimed-cg/ordem-compra/[id]`.
- FR-007: Página `/gestao/unimed-cg` com Section **ORDEM DE COMPRA**, tabela, empty state e modal com itens + PDF.
- FR-008: Pin da migration em `verify-production-migration-window` + teste da janela.
- FR-009: Testes do parser (fixture OC 188246 SOULMV + 186184 GTPlan) e do ingest (dedup).
- FR-010: No mesmo tick, varrer também `no-reply@gtplan.net`; falha de um remetente não derruba o outro.

## Acceptance Criteria

- AC-001: Fixture OC 188246 extrai número 188246, CNPJ `03315918000541`, prazo `30 DIAS`, item 78811 qtd 50 unitário 42,00 total 2.100,00.
- AC-002: Segunda passagem do mesmo `internetMessageId` não cria outra OC nem segundo upload.
- AC-003: E-mail OPME existente continua a ser classificado e persistido como antes.
- AC-004: Operador autenticado vê o card ORDEM DE COMPRA; sem ACL da página a API recusa.
- AC-005: E-mail do domínio sem assunto de OC é ignorado; e-mail sem PDF anexo é ignorado.
- AC-006: Fixture GTPlan 186184 extrai número 186184, CNPJ `03315918000541`, prazo `30 dias`, item 88271 qtd 20 unitário 2.800,00 total 56.000,00.

## Roles / ownership

- Leitura: quem já acessa `/gestao/unimed-cg`.
- Sync manual: admin|editor (`canSync`).
- Empresa: sempre a empresa do usuário autenticado; nenhum `companyId` da request.

## Failure cases

- Caixa Graph 401/403: registra falha de mailbox, não derruba as outras.
- PDF ilegível / sem `Ord. Compra`: parse `falha` ou skip se não houver número.
- Upload ok e persist falha: tenta apagar o item OneDrive órfão.

## Non-functional

- Sem log de PDF completo, token ou corpo integral do e-mail.
- Valores monetários em Decimal; quantidade com até 4 casas do SOULMV.

## Out of scope

- WhatsApp desta OC
- Emissão automática de NF-e a partir da OC
- Conferência com estoque/Spica
- Backfill de pasta OneDrive
- Leitura de arquivo `.msg` no cliente Windows
