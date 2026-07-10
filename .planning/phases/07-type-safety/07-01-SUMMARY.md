---
phase: 07-type-safety
plan: 01
subsystem: types
tags: [typescript, xml, type-safety, interfaces]
dependency_graph:
  requires: []
  provides: [NFeXml, CTeXml, NFSeXml, XmlNode, typed-xml-helpers]
  affects: [parse-invoice-xml, pdf-route, details-route, product-aggregation]
tech_stack:
  added: []
  patterns: [xml-type-interfaces, XmlNode-base-type]
key_files:
  created:
    - src/types/xml-common.ts
    - src/types/nfe-xml.ts
    - src/types/cte-xml.ts
    - src/types/nfse-xml.ts
  modified:
    - src/lib/xml-helpers.ts
decisions:
  - XmlNode as Record<string, unknown> for maximum compatibility with existing code
  - All XML interface properties optional with string | undefined leaf values
  - NFeTaxGroup extends XmlNode for deeply nested tax sub-nodes
metrics:
  duration: 266s
  completed: 2026-04-10T03:21:24Z
  tasks: 2
  files: 5
---

# Phase 07 Plan 01: XML Type Interfaces Summary

Typed interfaces for all three XML document types (NF-e, CT-e, NFS-e) parsed by fast-xml-parser, plus shared XmlNode base type and typed xml-helpers.

## What Was Done

### Task 1: Create XML type interfaces and shared XmlNode type
- **xml-common.ts**: Created `XmlValue` (string | number | undefined) and `XmlNode` (Record<string, unknown>) base types
- **nfe-xml.ts**: Created 25+ interfaces covering the full NF-e parsed tree: NFeProc, NFeDoc, NFeInfNFe, NFeIde, NFeEmit, NFeDest, NFeDet, NFeProd, NFeRastro, NFeMed, NFeImposto, NFeTaxGroup, NFeICMSTot, NFeTotal, NFeTransp, NFeVol, NFeCobr, NFeDup, NFePag, NFeInfAdic, NFeEndereco, etc.
- **cte-xml.ts**: Created 20+ interfaces for CT-e: CTeProc, CTeInfCte, CTeIde, CTeEmit, CTeRem, CTeDest, CTeExped, CTeReceb, CTeToma, CTeToma3, CTeToma4, CTeVPrest, CTeInfCarga, CTeInfDoc, CTeCompl, CTeImp, CTeInfCTeNorm, etc.
- **nfse-xml.ts**: Created 15+ interfaces covering both ABRASF and Nacional ADN formats: NFSeCompNfse, NFSeInfNfse, NFSeServico, NFSeValores, NFSePrestador, NFSeTomador, NFSeNacionalInfNFSe, NFSeNacionalDPS, etc.
- **Commit:** 7ea0dd9

### Task 2: Type xml-helpers.ts with XmlNode
- Replaced 3 `any` parameter annotations with `XmlNode | null | undefined` in val(), num(), gv()
- Typed internal `cur` variable in gv() as `unknown` with explicit casts during traversal
- Full project compiles and builds without errors
- **Commit:** e4a6519

## Deviations from Plan

None - plan executed exactly as written.

## Decisions Made

1. **XmlNode = Record<string, unknown>**: Maximally compatible with existing code that passes parsed XML objects. More specific interfaces (NFeXml, etc.) are structurally compatible.
2. **All properties optional**: XML elements may be absent; this matches fast-xml-parser behavior and existing defensive access patterns (obj?.field).
3. **NFeTaxGroup extends XmlNode**: Tax sub-nodes (ICMS00, ICMS10, etc.) have unpredictable keys; extending XmlNode allows index access while providing typed common fields.

## Verification

- `grep ': any'` on all 5 files returns zero results
- `npx tsc --noEmit` passes with no errors
- `npm run build` succeeds (production build)
- All 4 type files export their interfaces
- Interfaces match actual XML structures accessed across parse-invoice-xml.ts, pdf/route.ts, details/route.ts, product-aggregation.ts

## Known Stubs

None - all interfaces are complete and derived from actual codebase usage patterns.

## Self-Check: PASSED
