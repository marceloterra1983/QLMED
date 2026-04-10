---
phase: 07-type-safety
plan: 02
subsystem: xml-parsing
tags: [typescript, xml, type-safety, any-elimination]
dependency_graph:
  requires: [07-01]
  provides: [typed-xml-parsing, typed-pdf-generation, typed-details-extraction]
  affects: [parse-invoice-xml, pdf-route, details-route, product-aggregation, xml-helpers]
tech_stack:
  added: []
  patterns: [XmlNode-cast-pattern, XmlInput-widened-type, PartyNode-interface]
key_files:
  created: []
  modified:
    - src/lib/parse-invoice-xml.ts
    - src/lib/product-aggregation.ts
    - src/app/api/invoices/[id]/pdf/route.ts
    - src/app/api/invoices/[id]/details/route.ts
    - src/lib/xml-helpers.ts
    - src/types/cte-xml.ts
decisions:
  - Widened xml-helpers val/gv/num to accept `object` type to avoid index signature requirements on typed interfaces
  - Added PartyNode interface in parse-invoice-xml.ts for getPartyInfo function
  - Added missing toma field to CTeIde and infCteNorm alias to CTeInfCte for runtime XML compatibility
  - Used XmlNode cast pattern for dynamic property access chains in pdf/route.ts
metrics:
  duration: 1139s
  completed: 2026-04-10T03:43:14Z
  tasks: 2
  files: 6
---

# Phase 07 Plan 02: Type XML Parsing Functions Summary

Eliminated ~43 uses of `any` across 4 core XML processing files by applying the type interfaces created in Plan 01, making XML property access type-checked at compile time.

## Changes Made

### Task 1: Type parse-invoice-xml.ts and product-aggregation.ts (59efb7f)

**parse-invoice-xml.ts:**
- Added imports for NFeProc, CTeProc, NFSeCompNfse, NFSeNacionalInfNFSe and related types
- Created `PartyNode` interface for `getPartyInfo` function (typed CNPJ, CPF, xNome, xFant, IE)
- Typed `extractAccessKey` with XmlNode parameters and explicit casts for nested property access
- Typed `extractCteTomador` with CTeInfCte parameter
- Typed `parseNFe`, `parseCTe`, `parseNFSe` with specific result type signatures matching each XML schema

**product-aggregation.ts:**
- Typed `extractBatches(det: NFeDet, prod: NFeProd)` and `extractAnvisa(det: NFeDet, prod: NFeProd)`
- Replaced `ensureArray<any>` with typed generics: `ensureArray<NFeRastro>`, `ensureArray<NFeMed>`, `ensureArray<NFeDet>`

### Task 2: Type pdf/route.ts and details/route.ts (761ed81)

**pdf/route.ts (16 any eliminated):**
- Typed `getParty(node: object)` to accept any interface without index signature requirements
- Typed `parseCteTomador(infCte: CTeInfCte)` with concrete CT-e interface
- Typed `normalizeCteParty(node: XmlNode, ender: XmlNode)` for party normalization
- Typed `extractCteData(parsed: XmlNode, ...)`, `extractDanfeData(parsed: XmlNode)`, `extractNfseData(parsed: XmlNode, ...)`
- Typed `extractIcmsFromImposto(imp: XmlNode)` and `extractIpiFromImposto(imp: XmlNode)`
- Typed `normalizeNfseParty(node: XmlNode, enderNode: XmlNode)`
- Typed all map callbacks: ObsCont, Comp, infQ, det, dup arrays use typed generics

**details/route.ts (19 any eliminated):**
- Typed `parseEmitDest(node: XmlNode)`, `parseProdutos(det: NFeDet | NFeDet[])`, `parseTotais(total: XmlNode)`
- Typed `parseTransporte(transp: XmlNode)`, `parseCobranca(cobr: XmlNode, pag: XmlNode)`
- Typed `parseInfAdicionais(infAdFisco: string | undefined, infCpl: string | undefined, ide: XmlNode)`
- Typed `parseCteParty(node: XmlNode)`, `parseCteDetails(invoice: ..., infCte: CTeInfCte, cteProc: XmlNode)`
- Typed `parseNfseParty(node: XmlNode)`, `parseNfseDetails(invoice: ..., nacional: NFSeNacionalInfNFSe, abrasf: NFSeInfNfse)`
- Removed all inline `(x: any)` map callback annotations via typed source arrays

**xml-helpers.ts (supporting change):**
- Widened `val()`, `gv()`, `num()` first parameter from `XmlNode` to `object | null | undefined` via `XmlInput` type alias
- Avoids requiring index signatures on typed interfaces passed to these helpers

**cte-xml.ts (interface fix):**
- Added `toma?: CTeToma` to CTeIde (used in runtime XML but missing from interface)
- Added `infCteNorm?: CTeInfCTeNorm` alias to CTeInfCte (XML uses lowercase 't' variant)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] xml-helpers val/gv/num type widening**
- **Found during:** Task 2
- **Issue:** Typed interfaces (CTeVPrest, CTeInfCarga, etc.) lack index signatures, making them incompatible with `XmlNode` (`Record<string, unknown>`) when passed to val/gv/num helpers
- **Fix:** Changed val/gv/num to accept `object | null | undefined` (XmlInput type) instead of `XmlNode`
- **Files modified:** src/lib/xml-helpers.ts
- **Commit:** 761ed81

**2. [Rule 2 - Missing] CTeIde.toma and CTeInfCte.infCteNorm fields**
- **Found during:** Task 1
- **Issue:** Runtime XML data uses `ide.toma` and `infCte.infCteNorm` (lowercase) but interfaces lacked these fields
- **Fix:** Added optional fields to CTeIde and CTeInfCte interfaces
- **Files modified:** src/types/cte-xml.ts
- **Commit:** 59efb7f

## Verification

- `grep -c ': any'` returns 0 for all 4 target files
- `npx tsc --noEmit` passes for all modified files (pre-existing errors in unrelated files only)
- Project compiles with `npm run build` (pre-existing type error in page-client.tsx unrelated to this plan)

## Known Stubs

None.

## Self-Check: PASSED

- All 6 modified files exist on disk
- Both commits (59efb7f, 761ed81) verified in git log
