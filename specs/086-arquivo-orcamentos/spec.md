---
id: SPEC-086
status: approved
owner: QLMED
affected_modules:
  - orcamentos
  - graph-mail
  - pdf
---

# Feature Specification: Arquivo histórico de orçamentos (e-mail QL MED + PDF SPICA)

**Feature Branch**: `fix/085-linha-avulsa` (entrega conjunta com o fix da linha avulsa)

**Created**: 2026-09-21

**Status**: Approved (pedido do dono: acessar e-mails **enviados** de flavio@, daniele@ e marcelo@**qlmed.com.br**, baixar PDFs de orçamento, organizar em `/home/marce/Cloud/onedrive/0 - ORÇAMENTOS`, persistir os dados lidos e listar no padrão de cards do site)

**Input**: caixas Microsoft 365 `@qlmed.com.br` (não Gmail pessoal); PDFs SPICA H020 e modelo simples; listagem Orçamentos.

## Problem

Os orçamentos históricos da QL MED estão nos Enviados das três caixas comerciais e em pastas do OneDrive. A página Orçamentos (SPEC-085) só conhece documentos criados no QLMED. Sem importar o arquivo, o operador não pesquisa paciente/cliente/número do acervo SPICA no mesmo sítio.

## Roles and ownership

- **Actor**: usuário com `/orcamentos`.
- **Leitura** do arquivo: mesma ACL da listagem.
- **Importação**: `editor` ou `admin`.
- **Company isolation**: `getOrCreateSingleCompany`; nunca `companyId` do cliente.
- **Fonte de e-mail**: Graph app-only nas caixas `flavio@qlmed.com.br`, `daniele@qlmed.com.br`, `marcelo@qlmed.com.br`. Gmail pessoal está fora.

## User Scenarios & Testing

### User Story 1 — Ver orçamentos históricos na listagem (Priority: P1)

Operador abre `/orcamentos` e vê cartões (mobile) e tabela (desktop) com número, data, cliente, paciente, total, origem (QLMED / E-mail / Arquivo) e situação. Busca cobre nome de cliente e paciente do arquivo.

**Why this priority**: é o que o dono pediu como tabela no padrão de cards.

**Independent Test**: fixture parseado aparece na listagem com origem `email` ou `arquivo`.

**Acceptance Scenarios**:

1. **Given** um PDF H020 do Luiz Carlos no arquivo, **When** a listagem carrega, **Then** mostra `00008318`, cliente IASEMT, paciente LUIZ CARLOS, total 3.800,00, origem E-mail ou Arquivo.
2. **Given** viewport estreita, **When** há linhas, **Then** cada orçamento é um Card (não só tabela).
3. **Given** orçamento criado no QLMED, **When** lista, **Then** origem QLMED e o número continua sequencial (o arquivo **não** consome `Quote.number`).

### User Story 2 — PDFs das caixas @qlmed.com.br na pasta OneDrive (Priority: P1)

Job de coleta Graph percorre SentItems/search das três caixas, baixa anexos PDF cujo assunto ou nome parece orçamento, deduplica por SHA-256 e grava em `0 - ORÇAMENTOS/_email/{caixa}/{data}_{ficheiro}.pdf` com `_manifest.jsonl`.

**Independent Test**: manifest só contém `*@qlmed.com.br`; nenhum endereço Gmail.

### User Story 3 — Parse SPICA → banco (Priority: P1)

`parseQuotePdfText` lê H020 (`No.`, cliente, itens, totais, paciente/convênio/local) e o modelo simples (CASSEMS/Maria de Fátima). `QuoteArchive` persiste snapshot + itens; PDF original permanece no OneDrive; `GET /api/orcamentos/arquivo/{id}/pdf` só lê caminho dentro de `0 - ORÇAMENTOS`.

## Requirements

- **FR-001**: Caixas Graph exclusivamente `@qlmed.com.br` (Flavio, Daniele, Marcelo).
- **FR-002**: Pasta canónica `/home/marce/Cloud/onedrive/0 - ORÇAMENTOS` (`_email`, `_arquivo`, `_indice.json`).
- **FR-003**: Modelos `QuoteArchive` + `QuoteArchiveItem`, unique `(companyId, sha256)`, expand-only, pin de migração.
- **FR-004**: Listagem mistura QLMED + arquivo, paginada; cards no mobile; tabela no `sm+` com paciente e origem.
- **FR-005**: Números SPICA históricos **não** ocupam a sequência `Quote.number` (SPEC-085 permanece a partir de 1 no QLMED).
- **FR-006**: Parser recusa texto sem “ORÇAMENTO”; CNPJ do cliente não é o da QL MED (07.832.309/0001-97).
- **FR-007**: PDF do arquivo: 404 se o path sair da pasta canónica.

## Key Entities

- **QuoteArchive**: snapshot de um PDF histórico; origem email/disco; hash.
- **QuoteArchiveItem**: linha lida do PDF.
- **Quote**: inalterado (SPEC-085).

## Assumptions

- Graph app-only já autorizado nas três caixas (mesmo tenant dos ofícios).
- OneDrive montado neste host; produção vps2 só vê metadados até o PDF ser copiado para volume de runtime (fora desta entrega).
- PDFs que não parseiam ficam no disco e no manifest, sem linha no banco.

## Out of scope

- Converter arquivo em NF-e; WhatsApp; regravar número SPICA em `Quote`.
- Gmail `marcelo.terra@gmail.com`.
