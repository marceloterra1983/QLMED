# Gates: 065 NF-e emissão lote CD + layout

Scope: Corrigir dropdown de lote CD vazio (match code/codigo) e relayout dos campos de lote em linha própria na Nova NF-e.

- [x] G1: Helper puro casa TP00971 (code) com ledger cujo productCodigo é codigo interno distinto
  CHECK: npm test -- --run src/lib/__tests__/nfe-emission-stock-lot-match.test.ts
  EXPECT: Test Files  1 passed
  EVIDENCE: Start at  15:11:31 | Duration  123ms (transform 28ms, setup 16ms, import 23ms, tests 3ms, environment 0ms)

- [x] G2: tsc --noEmit sem erro
  CHECK: npx tsc --noEmit && echo TSC_OK
  EXPECT: TSC_OK
  EVIDENCE: TSC_OK

- [x] G3: API filtra lotes por identidade ampla (code OR codigo OR productCodigo, case-insensitive)
  CHECK: rg -n "filterStockLotsForProduct|expandStockLotProductKeys" src/lib/nfe-emission/stock-lot-match.ts src/app/api/nfe-emissions/stock-lots/route.ts
  EXPECT: filterStockLotsForProduct
  EVIDENCE: src/lib/nfe-emission/stock-lot-match.ts:47:export function filterStockLotsForProduct<T extends { productCodigo: string; quantity?: number }>( | src/lib/nfe-emission/stock-lot-match.ts:53:  const keys 

- [x] G4: Empty state do dropdown é "Nenhum lote no CD" (não select em branco)
  CHECK: rg -n "Nenhum lote no CD" src/app/\(painel\)/fiscal/issued/nova/EmissionLotFields.tsx
  EXPECT: Nenhum lote no CD
  EVIDENCE: 36:      ? 'Nenhum lote no CD'

- [x] G5: Campos de lote em segunda <tr> com colSpan, fora da célula Produto
  CHECK: rg -n "colSpan|EmissionLotFields" src/app/\(painel\)/fiscal/issued/nova/page-client.tsx
  EXPECT: colSpan={8}
  EVIDENCE: 777:                            <EmissionLotFields | 790:                            <td colSpan={8} className="px-3 py-3">

- [x] G6: Spec 065 com IDs de requisito para match + layout
  CHECK: test -f specs/065-nfe-emissao-lote-layout/spec.md && rg -n "FR-0|AC-0" specs/065-nfe-emissao-lote-layout/spec.md
  EXPECT: FR-0
  EVIDENCE: 41:- **AC-003**: `EmissionLotFields` contém `Nenhum lote no CD`; `page-client` renderiza `EmissionLotFields` numa `<tr>` com `colSpan`. | 42:- **AC-004**: `npx tsc --noEmit` passa.

- [x] G7: Preview smoke da linha de itens Nova NF-e (layout + rota stock-lots)
  EVIDENCE: preview cwd=065-nfe-emissao-lote-layout; GET :3002/fiscal/issued/nova=307 login; GET stock-lots unauth=401; Next Ready 1.7s. DB: TP00971 code≠codigo 002626; ledger productCodigo=002626; lotes 25G15,18J33,25K27.
