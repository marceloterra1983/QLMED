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

### QLMED-RISK-2026-09-PG-DIGEST

- **Owner:** Marcelo
- **Accepted:** 2026-09-01
- **Finding:** REAUD-B-12 (re-auditoria de b177b07)
- **Severity:** low
- **Affected path:** `production/docker-compose.yml` — `qlmed-db` e `n8n-db`
  usam `postgres:18-alpine`, tag móvel; `qlmed-app` e `qlmed-n8n` estão pinados
  por digest.
- **Suposição que sustenta o controlo:** o deploy canônico
  (`deploy-production.yml`) só constrói e sobe `qlmed-app`; nunca recria o
  banco. Um `pull` da tag móvel só acontece por acção manual do dono.
- **Por que não foi corrigido agora:** fixar o digest transformaria o próximo
  `up -d` completo numa recriação do contentor de banco, e o digest vivo do
  host não é observável a partir do repositório — pinar às cegas arrisca subir
  um binário diferente do que está a servir os dados.
- **Remediation trigger:** na próxima janela de manutenção combinada com o
  dono, ou antes de qualquer `docker compose up -d` que recrie `qlmed-db`,
  ler o digest em execução (`docker inspect --format '{{index .RepoDigests 0}}'
  qlmed-db`) e gravá-lo no compose. O portão de digest em
  `src/lib/__tests__/deploy-manifests.test.ts` passa então a cobrir os bancos.

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
  `>=8.5.10`) with `next@15.5.24`. Meets the stated remediation trigger.
- **Release decision:** acceptance closed; HIGH and CRITICAL findings remain
  release-blocking.

The `uuid` advisory previously reported through ExcelJS and NextAuth is
remediated with the package override to `uuid@11.1.1` and covered by the full
unit/integration/build gates.

## Supply chain posture

- **Imagem base do app pinada por digest** — `Dockerfile` usa
  `node:22-alpine@sha256:c610fcdf…` nos três estágios (auditoria b177b07,
  QLMED-SUPPLY-002). Tag móvel fazia dois deploys do mesmo SHA de código
  produzirem imagens diferentes, e o rollback para `qlmed-app:previous` não
  reproduzia o que tinha sido testado. `src/lib/__tests__/deploy-manifests.test.ts`
  reprova se a tag móvel voltar ou se os estágios divergirem.
- **`postgres:18-alpine` continua em tag móvel** — aceitação formal, com
  owner, data e gatilho, em `QLMED-RISK-2026-09-PG-DIGEST` acima. O
  `qlmed-n8n` já está pinado por digest.
- **Os dois Postgres correm com `no-new-privileges:true`, `cap_drop: [ALL]` e
  só `CHOWN`, `DAC_OVERRIDE`, `FOWNER`, `SETGID`, `SETUID`** (REAUD-B-12) —
  o mesmo endurecimento que `qlmed-app` e `qlmed-n8n` já tinham. O conjunto
  foi medido em container descartável nos três caminhos (initdb em volume
  novo, recriação sobre dados existentes, `docker restart`); sem
  `DAC_OVERRIDE` a recriação sobre dados existentes falha no `find` do
  entrypoint. O servidor corre como `postgres` com `CapEff=0`. O mesmo ficheiro
  de teste reprova se o endurecimento sair do compose.
- **Segredo nunca é build-arg** — `build.args` grava o valor numa camada da
  imagem e no `docker history`. Segredo entra por `env_file` no runtime. Portão
  no mesmo ficheiro de teste, sobre os três composes.
- **`node_modules` completo na imagem de runtime — risco residual aceite.**
  Prisma 7 tem uma árvore transitiva profunda (effect, c12, pathe) que o
  `migrate deploy` do arranque precisa; recortar seletivamente já se provou
  impraticável. O processo não corre como root (`su-exec nextjs` no
  `start.sh`).
