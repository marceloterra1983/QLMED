# Estudo multi-modelo — importação Spica

**Feature:** `043-spica-product-import`  
**Workflow:** `specs/workflows/spica-product-import.yaml` (`/spica-import`)  
**Data base:** research.md (números medidos 2026-09-04)

| Modelo | Foco | Status |
|--------|------|--------|
| Grok | Mapa, match, checklist | feito |
| Gemini | productKey, merge, nextCodigo | feito |
| Claude | Idempotência fiscal, endpoint, PRs | feito |

## Consenso 3/3

- Endpoint **novo** `POST /api/products/import-spica`; dry-run default; entrada XLSX/CSV (não ODS no stream).
- Match 1:1: codigo → Ref→code → code==Cód.Int; description só `suggested`.
- Inserts: `CODE:{ref}::UNIT:UN` se Ref única; `SPICA:{codigo}` só Ref inválida (`_`).
- Merge: fiscal/codigo/tipo/instrumental/outOfLine overwrite; description/NCM/ANVISA fill-if-empty; never code/productKey/agg*.
- Gates: colisão `codigo`, dup refs (33+12), ANVISA 11 dígitos, nextCodigo pad 6.

## Parecer Grok

Fonte: Grok.

Colisão numerica `codigo` Spica ∩ portal; apply só 1:1; não reusar import-types/bulk-update/`upsertProductRegistry` (`outOfLine:true`); checklist pré-produção completo.

## Parecer Gemini

Fonte: Gemini — Conditional Go.

productKey agregador nos inserts; política merge campo a campo; testes NF-sobre-Spica-only + ANVISA no-clobber.

## Parecer Claude

Fonte: Claude — GO condicional.

### Três bloqueadores

1. **`extractAndStoreTaxData` sobrescreve `fiscal_*` em toda NF** após o apply Spica. Precisa `fiscal_source` (`spica|nfe|manual`) ou sentinela — senão SC-003 passa no teste e falha no dia seguinte.
2. **`nextCodigo` em 3 cópias** com `padStart(5)` → colisão visual `"07972"` vs `"007972"`; unificar pad 6.
3. **`SPICA:` em massa** nos órfãos → duplicata quando NF chegar (já rejeitado por Gemini/Grok).

### Fiscal (medido)

- `Situação Tributária` = origem(1)+CST(2); gravar raw em `fiscalSitTributaria`, derivar origem; **sem** migration CST.
- IPI Saída = 0 em 7965/7965 → não mapear.
- ~1179 linhas CST `000` com ICMS `0` / NomeTrib “040…” → warn `fiscalInconsistente`, não “corrigir”.
- Parse BR com faixa 0–100; custos fora de `agg*`.

### Quarentena

- **Dura:** dup Ref Spica/portal, keyConflict → `resolutions[]`.
- **Branda:** tipo inválido (31) → importa com tipo null + warn (ajustar FR-008 da spec).

### Endpoint

`dryRun=true` default; `dryRun=false` exige `confirmChecksum`; advisory lock do agregador; lotes ~500; response com matched/create/quarantine/warnings/suggested/portalOnly.

### 4 PRs

1. `product-codigo` unificado + `spica/parse.ts`  
2. Dry-run only (501 se apply)  
3. Migration `fiscal_source` + extrator respeita Spica (única migration)  
4. Apply + checksum + resolutions + SC-003 medido  

## Decisão consolidada (fechada)

- [x] Mapa de campos
- [x] Merge policy
- [x] productKey INSERT = chave do agregador
- [x] Gate colisão codigo
- [x] Forma do endpoint (`import-spica` + checksum)
- [x] Sequência de 4 PRs
- [x] Bloqueador fiscal_source documentado (PR3)
- [ ] Implementação — aguarda kickoff de branch / aprovação humana do plano
