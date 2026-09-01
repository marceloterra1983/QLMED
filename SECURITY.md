# Security policy and accepted release risks

## Active risk acceptance

### QLMED-RISK-2026-09-RATELIMIT-INPROC

- **Owner:** Marcelo
- **Accepted:** 2026-09-01
- **Finding:** QLMED-AUTH-008
- **Severity:** medium
- **Affected path:** `src/lib/rate-limit.ts` — o contador de tentativas vive num
  `Map` do processo, não num store partilhado.
- **Suposição que sustenta o controlo:** o QLMED corre numa **única instância**.
  Com N processos o limite efectivo passa a ser N x `maxRequests`, e todo
  contador zera a cada deploy ou restart.
- **Por que não foi corrigido agora:** um store partilhado precisa de tabela em
  Postgres, logo de migração de schema — fora do contrato desta correção.
- **Remediation trigger:** no momento em que a app passar a correr com mais de
  um processo (réplicas, PM2 cluster, autoscaling), o store tem de migrar para
  Postgres antes do cutover.
- **Nota de desenho (ADR-0012):** o limite de login é por IP e global, nunca por
  identidade — travar a conta a partir de tentativas falhadas permitiria a
  terceiros trancar o operador de fora. Isso é deliberado e não muda com a
  migração do store.

## Remediated

### QLMED-RISK-2026-07-POSTCSS

- **Owner:** Marcelo
- **Accepted:** 2026-07-14
- **Remediated:** 2026-07-30
- **Advisory:** `GHSA-qx2v-qp2m-jg93`
- **Severity:** moderate
- **Former affected path:** `postcss@8.4.31` bundled by older Next releases
  (documented against `next@15.5.19`).
- **Remediation:** `package.json` override `postcss@8.5.26` (resolved
  `>=8.5.10`) with `next@15.5.23`. Meets the stated remediation trigger.
- **Release decision:** acceptance closed; HIGH and CRITICAL findings remain
  release-blocking.

The `uuid` advisory previously reported through ExcelJS and NextAuth is
remediated with the package override to `uuid@11.1.1` and covered by the full
unit/integration/build gates.
