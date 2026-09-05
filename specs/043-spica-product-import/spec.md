---
id: SPEC-043
status: implemented
owner: QLMED
affected_modules:
  - product-registry
  - product-aggregation
  - cadastro-produtos
---

# Feature Specification: Importação de produtos Spica

**Feature Branch**: `043-spica-product-import`  
**Status**: Implemented (UI + API em `/cadastro/produtos`; apply exige dry-run + `confirmChecksum`; sync produção continua bloqueado até dry-run operacional aprovado)  
**Input**: Exports Spica `Rel_Produtos_*.ods` + `List_Produtos_Cad_*.ods`  
**Research**: [research.md](./research.md)

## User Scenarios & Testing

### User Story 1 — Dry-run do cadastro Spica (Priority: P1)

Como editor, quero enviar a planilha Spica e ver quantos produtos seriam
atualizados, criados ou ficariam ambíguos, sem gravar no banco.

**Why this priority**: Evita corromper o registry (2462 linhas NF) antes de
validar o mapa.

**Independent Test**: Upload ODS/CSV → resposta JSON com matched/create/ambiguous/skip.

**Acceptance Scenarios**:

1. **Given** Rel_Produtos com 7965 códigos únicos, **When** dry-run, **Then**
   `parsed=7965` e totais matched+create+ambiguous+skip = 7965.
2. **Given** produto portal com `code` = Referência Spica, **When** dry-run,
   **Then** aparece em `matched` com `codigo` proposto = Cód. Int. Spica.
3. **Given** Referência duplicada (ex. PROCAT), **When** dry-run, **Then**
   linhas vão para `ambiguous`, não para update automático.

### User Story 2 — Aplicar sync por código interno (Priority: P1)

Como editor, quero confirmar o dry-run e gravar: `codigo` Spica, fiscal,
ANVISA (se ausente), tipo/subtipo, instrumental, fora de linha, refs e
fabricante; e criar órfãos Spica-only.

**Independent Test**: apply com fixture pequena → assert Prisma rows.

**Acceptance Scenarios**:

1. **Given** dry-run aprovado, **When** apply, **Then** `ProductRegistry.codigo`
   = código Spica nos matched e create é idempotente na 2ª execução.
2. **Given** tipo contendo `FORA DE LINHA`, **When** apply, **Then**
   `outOfLine=true`.
3. **Given** ANVISA já preenchida com source manual/xml, **When** apply,
   **Then** não sobrescreve ANVISA Spica sem flag explícita.

### User Story 3 — Validação cruzada das duas planilhas (Priority: P2)

Como sistema, quero rejeitar ou alertar se Rel e List divergirem no mesmo
código interno.

## Requirements

### Functional

- **FR-001**: Chave canônica de identidade Spica = código interno (6 dígitos).
- **FR-002**: Match primário portal = `upper(trim(code)) == upper(trim(Referência))`.
- **FR-003**: Endpoint dedicado (não reutilizar `import-types` sem adaptação).
- **FR-004**: Modo `dryRun` default true.
- **FR-005**: Não alterar `productKey` de linhas já existentes.
- **FR-006**: Não apagar produtos portal-only (NF sem Spica).
- **FR-007**: Custos Spica não gravam em `agg*`.
- **FR-008**: Tipos inválidos (sem prefixo `N -`) → quarentena **branda**: importa linha com `productType/Subtype` null + warning (não perde fiscal/ANVISA). Quarentena **dura** só para Ref 1:N e keyConflict.
- **FR-009**: Após apply, `fiscal_*` com origem Spica não pode ser apagado por `extractAndStoreTaxData` (dono via `fiscal_source` ou sentinela documentada).
- **FR-010**: Apply (`dryRun=false`) exige `confirmChecksum` do arquivo previsto no dry-run.
- **FR-011**: Entrada XLSX/CSV; ODS convertido fora (sem pacote ODS novo neste fluxo).
- **FR-012**: Listagem `/cadastro/produtos` na ordenação hierárquica (Linha > Grupo > Subgrupo, default) carrega o catálogo filtrado **inteiro** via `GET /api/products/list?exportAll=true` (teto `EXPORT_ALL_LIMIT`=10000, flag `exportLimited` quando truncado) e monta a árvore no cliente, renderizando só filhos de nós expandidos; tudo recolhido ao carregar, badges com `hierarchyCounts`. Ordenações flat (`codigo`, `description`, `ncm`...) continuam paginadas em 50. "Expandir" e busca abrem até Subgrupo quando o conjunto passa de 1000 produtos.

### Key Entities

- **SpicaProductRow** — linha normalizada do export
- **ProductRegistry** — destino
- **ImportSpicaReport** — matched/create/ambiguous/skip + samples

## Success Criteria

- **SC-001**: Dry-run processa 7965 linhas em < 60s em ambiente local.
- **SC-002**: ≥95% dos matched por Referência recebem `codigo` Spica após apply.
- **SC-003**: Segunda apply = 0 creates, 0 mudanças fiscais se input idêntico.
- **SC-004**: Zero escrita com `dryRun=true`.
