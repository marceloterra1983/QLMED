---
id: SPEC-047
status: implemented
owner: QLMED
affected_modules:
  - nfe-item-link
  - product-registry
  - fiscal-invoices-ui
  - cadastro-produtos
  - sistema-rotinas
---

# Feature Specification: Vínculo de itens de NF-e recebida ao produto Spica

**Feature Branch**: `feat/047-nfe-item-product-link`

**Created**: 2026-09-05

**Status**: Implemented

**Input**: "Temos notas importadas desde 2021. Todos os produtos das notas
fiscais RECEBIDAS devem ser relacionados a um produto cadastrado. Fazer esta
varredura e adicionar uma tag com o número do cód. de produto identificado,
para ter certeza que todos os produtos estão identificados, e permitir
relacionar manualmente caso não consiga."

**Depende de**: [SPEC-043 Importação de produtos Spica](../043-spica-product-import/spec.md)
(catálogo `product_registry` com `codigo`, `code`, `product_refs`, `ean`,
`anvisa_code`) e [SPEC-044 Página de Rotinas](../044-pagina-rotinas/spec.md)
(catálogo `SYSTEM_ROUTINES`).

## Contexto

O item de uma NF-e recebida chega com o código **do fornecedor** (`cProd`),
que costuma coincidir com a Referência Spica (`product_registry.code` /
`product_refs`), mas não sempre: prefixos numéricos (`001MOZ25014` →
`MOZ25014`), códigos internos do fornecedor (`10302.00` da LABCOR) e itens que
não são produto (manutenção de veículo, telefonia). Hoje nada persiste esse
vínculo: `nfe_entry_item`/`stock_entry` estão vazios (fluxo de entrada de
estoque nunca usado) e `invoice_item_tax` só guarda o item fiscal. O histórico
de compras do produto (`/api/products/history`) procura `<cProd>ref</cProd>`
no XML, ou seja, só enxerga o caso feliz.

Diagnóstico medido em 2026-09-05 (banco `postgres`, empresa única):

| Ano | Itens NF-e recebidas | Notas | `cProd` distintos | CNPJs emitentes |
|-----|----------------------|-------|-------------------|-----------------|
| 2021 | 1288 | 307 | 522 | 54 |
| 2022 | 1882 | 313 | 1169 | 65 |
| 2023 | 1261 | 306 | 753 | 51 |
| 2024 | 881 | 259 | 422 | 53 |
| 2025 | 632 | 181 | 294 | 42 |
| 2026 | 361 | 111 | 193 | 34 |
| **Total** | **6305** | **1477** | | |

Vínculo persistido antes desta feature: **0**. Por SQL, `cProd` == `codigo`
casa 189 itens; `cProd` normalizado == `code`/`product_refs` casa 5090
(80,7 %); prefixo numérico de 1-3 dígitos removido casa mais 49; 15 códigos
normalizados são ambíguos (mais de um produto) e ficam pendentes.

Resultado da cascata implementada (varredura em cópia do banco, 2026-09-05):
6305 itens em 1477 notas → **5346 vinculados (84,8 %)** e 959 pendentes em
530 `cProd` distintos (521 grupos fornecedor+cProd). Por estratégia: S2 5102,
S1 189, S5 20, S4 18, S6 13, S3 4. Segunda execução: 0 escritas.

## User Scenarios & Testing

### US1 — Ver o código Spica em cada item da nota recebida (P1)

Como operador fiscal, ao abrir uma NF-e recebida em `/fiscal/invoices`, quero
ver ao lado de cada item a tag verde com o código Spica identificado, ou uma
tag âmbar "Sem vínculo" quando o sistema não conseguiu identificar.

**Acceptance**:

- **AC-001**: Given item vinculado, When abro a aba Produtos, Then a linha
  mostra badge `font-mono text-emerald-800` com `matched_codigo` e tooltip com
  a descrição Spica e a estratégia.
- **AC-002**: Given item sem vínculo, When abro a aba Produtos, Then a linha
  mostra badge âmbar "Sem vínculo" e botão "Relacionar" (só com permissão de
  escrita em `/cadastro/produtos`).

### US2 — Relacionar manualmente (P1)

Como editor, quero escolher o produto Spica para um item pendente, buscando
por código, referência ou descrição, e que essa escolha valha para todas as
notas do mesmo fornecedor com o mesmo `cProd`, agora e no futuro.

**Acceptance**:

- **AC-003**: Given seletor aberto, When digito `MOZ250`, Then vejo resultados
  de `GET /api/products/list?search=` com código, referência e descrição.
- **AC-004**: Given produto escolhido, When confirmo, Then todos os itens do
  mesmo (CNPJ emitente, `cProd` normalizado) ficam `match_strategy=MANUAL`,
  `match_confidence=1`, `matched_by=<userId>`.
- **AC-005**: Given vínculo MANUAL existente para (CNPJ, `cProd`), When chega
  uma nota nova com o mesmo par, Then o item nasce vinculado com estratégia
  `S6` e a varredura nunca sobrescreve um vínculo MANUAL.

### US3 — Fila de pendências (P1)

Como editor, quero uma lista dos itens sem vínculo agrupados por fornecedor +
`cProd` + descrição, com contagem de notas, e um botão "Relacionar" que
resolve o grupo inteiro.

**Acceptance**:

- **AC-006**: `GET /api/products/nfe-item-links/pending` devolve grupos
  ordenados por quantidade de itens desc, com `supplierCnpj`, `supplierName`,
  `supplierCode`, `description`, `ncm`, `itemCount`, `invoiceCount`,
  `lastIssueDate`.
- **AC-007**: A página `/cadastro/produtos/vinculos-nfe` lista os grupos e o
  cabeçalho de `/cadastro/produtos` mostra o atalho com a contagem.

### US4 — Varredura automática (P1)

Como sistema, quero preencher o vínculo de todos os itens de NF-e recebidas
desde 2021 e de cada nota nova, de forma idempotente e determinística.

**Acceptance**:

- **AC-008**: Cascata pára na primeira estratégia que casa de forma **única**:
  `S6` (memória MANUAL do par CNPJ+`cProd`) → `S1` (`cProd` == `codigo`) →
  `S2` (`cProd` normalizado == `code`/`product_refs`; variantes: sem zeros à
  esquerda, OCR letra O→0, sem prefixo numérico 1-3 dígitos) → `S3` (EAN
  válido == `ean`) → `S4` (registro ANVISA do item == `anvisa_code`) → `S5`
  (ref Spica embutida no xProd: DOKIMOS/P-2010/INSTAR/TIV; ou leading ref;
  ou mesmo fornecedor + NCM + trigram ≥ 0,85) → `S7` (descrição NF contida
  na descrição Spica após strip do prefixo de catálogo, ratio ≥ 0,85 e NCM
  igual; sem fuzzy frouxo / sem contenção de cProd puro) → `S6` (memória
  automática com confiança ≥ 0,9). Ambíguo ou abaixo do limiar = pendente.
- **AC-009**: Segunda execução sem mudanças = 0 escritas de vínculo.
- **AC-010**: Nova nota recebida ingerida por qualquer canal (SEFAZ, NSDocs,
  upload, XML local) tenta vincular os itens no mesmo fluxo de pós-ingestão
  (`updateProductAggregatesForInvoice`), com falha contida (log, sem abortar
  a ingestão).
- **AC-011**: A rotina aparece em `/sistema/rotinas` (seção Estoque) e pode
  ser disparada por `POST /api/products/nfe-item-links/sweep` (admin).

### US5 — Histórico do produto usa o vínculo (P2)

- **AC-012**: `GET /api/products/history?direction=received&registryId=`
  inclui as notas vinculadas por `product_registry_id` além do fallback por
  `<cProd>`.

## Requirements

### Functional

- **FR-001**: Tabela `nfe_item_product_link` (1 linha por item de NF-e
  recebida, chave `(company_id, invoice_id, item_number)`), com os sinais do
  item (`supplier_cnpj`, `supplier_code`, `supplier_code_norm`,
  `supplier_description`, `ean`, `anvisa`, `ncm`, `unit`) e o resultado
  (`product_registry_id`, `matched_codigo`, `match_strategy`,
  `match_confidence`, `matched_at`, `matched_by`).
- **FR-002**: Vínculo MANUAL é imutável pela varredura; só outro MANUAL o troca.
- **FR-003**: A memória S6 é derivada da própria tabela (linhas MANUAL ou com
  confiança ≥ 0,9 para o mesmo `(supplier_cnpj, supplier_code_norm)`); não há
  segunda tabela de mapeamento.
- **FR-004**: Normalização de código: `upper`, `trim`, remover tudo que não é
  `[A-Z0-9]`. Variantes S2 só valem se o resultado for único no catálogo.
- **FR-005**: EAN válido = só dígitos, 8/12/13/14 posições, ≠ `SEM GTIN`, ≠ zeros.
- **FR-006**: Escrita de vínculo exige `requireEditor` + `canAccessPage('/cadastro/produtos')`;
  a varredura por API exige admin. Leitura segue o gate da rota que a expõe.
- **FR-007**: Nenhuma escrita em `product_registry` (a feature não cria
  produto; produto inexistente é pendência para cadastro no Spica).
- **FR-008**: Backup CSV dos vínculos gerados em `tmp/` (gitignored) a cada
  varredura por script.

### Non-functional

- **NFR-001**: Varredura completa (≈1500 notas) < 3 min local; usa advisory
  lock por empresa (`nfeItemLinkLockKey`) para não correr em paralelo.
- **NFR-002**: Sem log de XML completo; log só de contagens.

### Roles & ownership

- Admin: tudo. Editor com `/cadastro/produtos`: relacionar/desfazer.
  Viewer: vê a tag, não vê "Relacionar". Company derivada de
  `getOrCreateSingleCompany(userId)`.

### Failure cases

- XML sem `det` → nota sem linhas de vínculo (não é erro).
- Produto apagado → `product_registry_id` NULL por `ON DELETE SET NULL`; item
  volta a pendente na próxima varredura.
- Nota apagada → vínculos apagados em cascata.

### Out of scope

- Criar produtos a partir de NF (SPEC-043 FR-006 continua valendo).
- Itens de notas emitidas (já usam `codigo` Spica em `cProd`).
- Marcar item como "não é produto" (fica pendente; evolução futura).

## Success Criteria

- **SC-001**: ≥ 80 % dos 6305 itens vinculados automaticamente na 1ª varredura.
- **SC-002**: 0 vínculos automáticos com ambiguidade (todo automático tem
  candidato único).
- **SC-003**: Vitest, `tsc --noEmit`, `lint`, `docs:validate` verdes.

## Evolução pós-PR #352 (pendências)

Diagnóstico em produção (2026-09-05): 959 pendentes. Regras novas medidas
sem ambiguidade: **S5b** (modelo no xProd) resolve ~303 LABCOR; **S7**
(contenção de descrição) resolve ~113 RCA + dezenas DOC MED/outros; **S2
OCR O→0** resolve ~10 DOC MED. **S8** (cProd contido em code) foi
**rejeitada**: `207.01` ⊂ `2070` vinculava bioprótese LABCOR a "CAMPO
ADESIVO". Itens sem produto Spica (Politec 04257/4322606, veículos,
telefonia, DOC MED codes internos sem catálogo) permanecem pendentes para
decisão humana / importação Spica.

## Fora de escopo (SKIPPED_*)

Decisão do operador (2026-09-05):

- **SKIPPED_NON_MEDICAL**: fornecedores não-médicos (autopeças, tintas, telecom,
  hotelaria, pneus, etc.) — lista de CNPJs em `skip.ts`. Não vinculam ao Spica
  e **saem da fila** `/cadastro/produtos/vinculos-nfe` por padrão.
- **SKIPPED_LEGACY**: RCA Saúde (`11352270000188`) — histórico antigo;
  desconsiderar da fila.
- **DOC MED** (`66877184000180`): **não** desconsiderar automaticamente —
  são **8 notas** distintas (2023-01-31 → 2025-05-09), não uma NF isolada.
- Persistência: `product_registry_id` null + `match_strategy` SKIPPED_*;
  pendência = `product_registry_id IS NULL AND strategy NOT LIKE 'SKIPPED_%'`.

