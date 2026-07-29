# Security policy and accepted release risks

## Active risk acceptance

_Nenhuma aceitação de risco ativa no momento._

## Remediated

### QLMED-RISK-2026-07-POSTCSS

- **Owner:** Marcelo
- **Accepted:** 2026-07-14
- **Remediated:** 2026-07-29
- **Advisory:** `GHSA-qx2v-qp2m-jg93`
- **Severity:** moderate
- **Former affected path:** `postcss@8.4.31` bundled by older Next releases
  (documented against `next@15.5.19`).
- **Remediation:** `package.json` override `postcss@8.5.23` (resolved
  `>=8.5.10`) with `next@15.5.21`. Meets the stated remediation trigger.
- **Release decision:** acceptance closed; HIGH and CRITICAL findings remain
  release-blocking.

The `uuid` advisory previously reported through ExcelJS and NextAuth is
remediated with the package override to `uuid@11.1.1` and covered by the full
unit/integration/build gates.
