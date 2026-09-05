# Research: Importação Spica → ProductRegistry

**Feature:** `043-spica-product-import`  
**Data:** 2026-09-04  
**Fontes Spica (OneDrive → `tmp/spica-import/`, gitignored):**

| Arquivo | Aba | Produtos |
|---------|-----|----------|
| `Rel_Produtos_2026_180228.ods` | Produtos | 7965 |
| `List_Produtos_Cad_20260904_182240.ods` | Cadastro x Dados | 7965 |

Interseção por código interno: **7965 / 7965** (mesmos produtos; zero divergência nos campos cruzados Nome/Ref/Tipo/Sub/Fab/ANVISA/NCM). Usar **uma** fonte canônica e a outra só como validação cruzada.

## Estado atual do portal

Tabela `product_registry` (produção, medido 2026-09-04):

| Métrica | Valor |
|---------|------:|
| total | 2462 |
| com `codigo` | 2462 (sequência própria do app, 5 dígitos) |
| com `code` (cProd NF) | 2462 |
| com ANVISA | 1444 |
| com `product_type` | 51 |
| com fiscal (`fiscal_sit_tributaria`) | **0** |

Os `codigo` atuais **não** são os do Spica (`match_on_codigo=0`). Vieram de `nextCodigo()` na agregação de NF-e.

### Overlap Spica ↔ portal (`match_by_ref`)

| Estratégia | Portal hits | Spica hits |
|------------|------------:|-----------:|
| `upper(code) = upper(Referência)` | **1693** | **1681** |
| `code = Cód. Int. Spica` | 119 | — |
| `description = Nome` exato | 328 | — |
| `product_refs` contém Ref | 0 | — |
| Spica sem match por Ref | — | **6284** |
| Portal sem match por Ref | **769** | — |

Referências duplicadas no Spica: **33** grupos (ambiguidade de match).

## Colunas Spica

### Rel_Produtos (canônico para sync)

`Código`, `Referência`, `Nome do Produto`, `Tipo`, `SubTipo`, `Fabricante`, `Fornecedor`, `Instrumental`, `RVS`, `NCM`, `Situação Tributária`, `Nome da Tributação`, `%ICMS`, `%PIS`, `%COFINS`, `%IPI Entr.`, `%IPI Saída`, `Obs. Fiscal`, `Custo da Última Compra`, `Custo Médio`

Fill: RVS 93,1%; NCM 99,5%; Fornecedor 15,6%; Obs. Fiscal 54,4%; Instrumental Sim=1314 / Não=6651.

Tipos principais: ORTOPEDIA 3671, FORA DE LINHA HEMOD. 2431, HEMODINAMICA 568, FORA DE LINHA CARDIACA 480, CARDIACA 346, …  
**31** linhas com Tipo inválido (ex.: fabricante no campo Tipo: MEDTRONIC, PANAMEDICA).

### List_Produtos_Cad (validação + CST/enquadramento)

Mesmo universo; `ANVISA` ≡ `RVS` do Rel; traz `CST-ICMS` Cadastro, Obs ICMS, PIS/COFINS enquadramento. Preferir Rel para master; List para CST/obs quando Rel.Obs vazia.

## Mapa → ProductRegistry

| Spica | Destino | Notas |
|-------|---------|-------|
| Código (Cód. Int.) | ProductRegistry.codigo | **Chave canônica Spica**; único; sobrescrever sequência atual no match |
| Referência | ProductRegistry.productRefs (+ match em ProductRegistry.code) | Match primário com cProd da NF; não apagar code da NF |
| Nome do Produto | ProductRegistry.description / ProductRegistry.shortName | Só preencher description se vazia ou flag “forçar Spica” |
| Tipo (strip `N - `) | ProductRegistry.productType **e** productSubtype | Linha + Grupo (convenção: Tipo Spica = Grupo). Se contém `FORA DE LINHA` → outOfLine=true |
| SubTipo / Sub | ProductRegistry.productSubgroup | Subgrupo (convenção: Subtipo Spica = Subgrupo) |
| Fabricante | ProductRegistry.manufacturerShortName | Catálogo via rename-manufacturer |
| Fornecedor | ProductRegistry.defaultSupplier | Sparse |
| Instrumental Sim/Não | ProductRegistry.instrumental | |
| RVS / ANVISA | ProductRegistry.anvisaCode + ProductRegistry.anvisaSource='spica' | Não clobber se source=manual/xml com confiança maior |
| NCM | ProductRegistry.ncm | |
| Situação Tributária | ProductRegistry.fiscalSitTributaria | |
| Nome da Tributação | ProductRegistry.fiscalNomeTributacao | |
| %ICMS/%PIS/%COFINS/%IPI | ProductRegistry.fiscalIcms / fiscalPis / fiscalCofins / fiscalIpi | Parse BR `17,00` → float |
| Obs. Fiscal / Obs ICMS | ProductRegistry.fiscalObs / ProductRegistry.fiscalObsIcms | |
| CST-ICMS (List) | (avaliar) | Hoje não há coluna CST dedicada além de sit tributária |
| Custo última/médio | — | **Não** mapear para agregados NF (`agg*`); são custos Spica |

ProductRegistry.productKey: **não** trocar em linhas já agregadas de NF. Novos produtos Spica-only: `SPICA:{codigo}` ou `CODE:{ref}::UNIT:UN` alinhado ao agregador.

## O que já existe no portal

- UI cadastro `/cadastro/produtos` + `ProductDetailModal` (codigo readonly, fiscal, ANVISA, tipo, instrumental, refs)
- `POST /api/products/import-types` — XLSX tipo/subtipo matching por **`code`**, não por `codigo`
- `POST /api/products/anvisa/bulk-import` — codigo+anvisa+fabricante
- `PATCH /api/products/bulk-update` — campos cadastrais + create com `nextCodigo()`
- Agregação NF → `product_registry` (`product-aggregate-updater`)

Gap: **não há** import master Spica (codigo interno + fiscal completo + create órfãos).

## Estratégia recomendada (rascunho)

1. **Dry-run** report: matched / create / ambiguous (dup ref) / skip
2. Match order: (a) `code`=Ref, (b) `code`=Cód.Int, (c) description exact, (d) manual queue
3. Update matched: set `codigo` Spica, fiscal*, ANVISA se ausente, tipo/subtipo, instrumental, outOfLine, productRefs∪{Ref}, manufacturerShortName, defaultSupplier
4. Insert Spica-only (~6,2k) com `productKey` estável e `codigo` Spica
5. Não apagar 769 portal-only (vêm de NF sem cadastro Spica)
6. Reusar streaming XLSX/ODS (`exceljs`/`streamXlsxRows` + conversão ODS) no padrão de `import-types`
7. Spec Kit obrigatório antes de código; sync produção só após dry-run aprovado

## Índice único de codigo (parcial)

Já existe no Postgres (migration `20260609190000`):

`CREATE UNIQUE INDEX … product_registry_company_codigo_idx ON product_registry (company_id, codigo) WHERE codigo IS NOT NULL`

É **partial unique** — Prisma `@@unique([companyId, codigo])` geraria DDL diferente (não equivalente a `WHERE codigo IS NOT NULL`). **PR1 não altera o schema.prisma**; o índice SQL permanece a fonte de verdade. Violação chega como erro de unique no apply.

## Riscos

- **Colisão de `codigo`:** Spica (até 007971) intersecta a sequência atual do portal (~5 dígitos). Dry-run deve reportar interseção com portal-only (Grok).
- **Dois escritores fiscais (resolvido):** `extractAndStoreTaxData` só preenche `fiscalIcms/Pis/Cofins/Ipi` e `fiscalCfopEntrada` quando `fiscalSitTributaria IS NULL` (sentinela de tributação mestre Spica/cadastro; FR-009).
- Sobrescrever `codigo` exige `nextCodigo` unificado com pad 6 (3 call sites hoje).
- Dup refs (33) + folga portal 12 → match só 1:1.
- Tipos inválidos (31) → quarentena branda (importa sem tipo).
- ~1179 Spica com CST `000` + ICMS 0 / NomeTrib 040 → warn, não auto-corrigir.
- Float fiscal vs decimal (ADR 004) — dívida.
- FORA DE LINHA → `outOfLine=true`; INSERT ativo **não** herdar `outOfLine:true` do `upsertProductRegistry`.
- productKey INSERT = `CODE:REF::UNIT:UN` (Gemini / Claude), não `SPICA:` em massa.
- Sem parser ODS no lockfile — entrada XLSX/CSV.
## Artefatos locais

- `tmp/spica-import/*.ods` + `rel_produtos.csv` + `list_produtos.csv` + `spica-summary.json`
