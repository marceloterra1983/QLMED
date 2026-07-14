# Security policy and accepted release risks

## Active risk acceptance

### QLMED-RISK-2026-07-POSTCSS

- **Owner:** Marcelo
- **Accepted:** 2026-07-14
- **Expires:** 2026-08-14
- **Advisory:** `GHSA-qx2v-qp2m-jg93`
- **Severity:** moderate
- **Affected path:** the exact `postcss@8.4.31` dependency bundled by
  `next@15.5.19`.
- **Exposure assessment:** QLMED does not accept or stringify
  attacker-controlled CSS at runtime. CSS compilation occurs during the
  trusted image build, which substantially limits the advisory's XSS path.
- **Compensating controls:** exact Next version, protected-main CI, immutable
  deploy revision checks, dependency audit on every PR/main build, and no
  user-supplied stylesheet feature.
- **Remediation trigger:** upgrade to the first tested Next release that ships
  `postcss>=8.5.10`, or remove this acceptance immediately if QLMED starts
  processing user-controlled CSS.
- **Release decision:** accepted temporarily; HIGH and CRITICAL findings
  remain release-blocking.

The `uuid` advisory previously reported through ExcelJS and NextAuth is
remediated with the package override to `uuid@11.1.1` and covered by the full
unit/integration/build gates.
