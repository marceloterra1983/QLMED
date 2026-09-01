# Gates — L9 (operação, CI, docs e UI)

Auditoria QLMED b177b07, folha L9. Uma caixa por resultado. `[x]` só com
evidência medida e colada. Todo portão que eu mexer leva controlo positivo:
prova de que ainda reprova o que existe para reprovar.

Contratos herdados do PLAN.md: `.github/workflows/**` é meu; não toco em
`src/lib/auth.ts`, `prisma/schema.prisma`, `prisma/migrations/`,
`src/lib/logger.ts`; não implanto, não reinicio serviço, não toco no host.

## Linha de base medida

- [x] `npm test` antes de qualquer edição: **94 ficheiros / 725 testes passados,
  3 ficheiros e 4 testes skipped (97 / 729)**. `0` ficheiros `.test.tsx`.
- [x] `npm audit --omit=dev --audit-level=high` reprova na base por
  `GHSA-3f6p-5ww8-9rcr` (mysql2 via prisma). O step `Dependency audit` do
  `ci.yml` **não é meu** nesta rodada (o pai trocou-o por
  `scripts/verify-dependency-audit.mjs`); as linhas ficaram intactas.

---

## OPS-001 — path filter do CI omite ops/production/compose/dependabot

- [x] CHECK: `filters.app` em `.github/workflows/ci.yml` inclui `ops/**`,
  `production/**`, `docker-compose.yml`, `.github/dependabot.yml` e
  `.github/workflows/**`.
- [x] CHECK (glob real, não leitura): padrões do filtro avaliados com
  `picomatch`, o matcher que a `dorny/paths-filter` usa.

  ANTES (19 padrões):
  ```
  NOMATCH  ops/scripts/qlmed-pg-backup.sh
  NOMATCH  production/docker-compose.yml
  NOMATCH  docker-compose.yml
  NOMATCH  .github/dependabot.yml
  NOMATCH  .github/workflows/ai-tooling-drift.yml
  MATCH    src/lib/utils.ts   <- src/**
  ```
  DEPOIS (22 padrões):
  ```
  MATCH    ops/scripts/qlmed-pg-backup.sh          <- ops/**
  MATCH    ops/systemd/qlmed-cte-dist-sync.timer   <- ops/**
  MATCH    production/docker-compose.yml           <- production/**
  MATCH    production/README.md                    <- production/**
  MATCH    docker-compose.yml                      <- docker-compose.yml
  MATCH    .github/dependabot.yml                  <- .github/dependabot.yml
  MATCH    .github/workflows/ai-tooling-drift.yml  <- .github/workflows/**
  MATCH    src/lib/utils.ts                        <- src/**
  NOMATCH  docs/deployment/qlmed-app.md
  NOMATCH  README.md
  ```
  Docs-only continua a cair no job `docs` — o filtro ficou mais largo onde
  precisava e não em todo o lado.
- [x] CONTROLO POSITIVO: 5 casos novos em `scripts/test-ci-hardening.sh`, um por
  padrão. Cada um apaga a linha do `ci.yml` e exige REPROVA do guarda:
  ```
  ok  filtro app sem ops/** reprova
  ok  filtro app sem production/** reprova
  ok  filtro app sem docker-compose.yml reprova
  ok  filtro app sem .github/dependabot.yml reprova
  ok  filtro app sem .github/workflows/** reprova
  ```
- [x] GATE DE MANIFESTS (pedido do coordenador: "compose inválido reprova o
  quality"): `src/lib/__tests__/deploy-manifests.test.ts` faz parse dos três
  composes e exige `services` com origem de imagem. Como `production/**` agora
  roteia para o job `app`, que roda `npm test`, compose inválido reprova o
  `quality`. Sem `docker compose config`: o pool isolado não expõe socket de
  engine (proibido por `verify-ci-hardening.sh`).

## OPS-002 — `npm run deploy:server --legacy` publica produção pública

- [x] CHECK: `deploy:server` e `rollback:server` removidos do `package.json`.
- [x] CHECK: guarda em `scripts/deploy-guard.sh`, sourced por
  `deploy-server.sh` e `rollback-server.sh` ANTES de git/ssh/curl. Recusa raiz
  pública (`/srv/qlmed`, `/home/marce/qlmed/production` e subdiretórios),
  endpoint público (`app.qlmed.com.br`, porta `:13000`) e exige
  `DEPLOY_CONFIRM=DEPLOY-LEGACY`. Os defaults públicos foram removidos.
- [x] CHECK: a verificação de revisão pública embutida saiu do script — era ela
  que provava que este caminho publicava produção.
- [x] MEDIDO no script real, sem tocar em rede:
  ```
  $ bash scripts/deploy-server.sh --legacy
  DEPLOY_DIR não definido. scripts/deploy-server.sh não tem mais destino padrão:
    o antigo padrão era a raiz de produção pública.
  exit=1

  $ DEPLOY_DIR=/home/marce/qlmed/production \
    DEPLOY_HEALTHCHECK_URL=http://127.0.0.1:13000/api/health \
    DEPLOY_CONFIRM=DEPLOY-LEGACY bash scripts/deploy-server.sh --legacy
  Recusado: DEPLOY_DIR=/home/marce/qlmed/production é a raiz de produção pública.
  exit=1
  ```
- [x] CONTROLO POSITIVO: `scripts/test-deploy-guard.sh` (entrou no
  `npm run ci:verify` e no step de hardening do `ci.yml`), 11 casos, os dois
  sentidos — 8 recusas exigidas + 1 aprovação exigida (senão a guarda poderia
  estar só a recusar tudo) + 2 asserções de não-regressão.
- [x] `rollback:server` recebeu a mesma guarda (mesmo footgun, mesmo default).

## OPS-003 — drift de compose e segredo em build-arg

- [x] CHECK: `grep QLMED_API_KEY ops/compose/qlmed-stack.yml` → só o comentário
  que explica a remoção; nenhum `build.args`.
- [x] CHECK: cabeçalho em `ops/compose/qlmed-stack.yml` declara
  `production/docker-compose.yml` como canônico e a si mesmo como cópia
  histórica.
- [x] CONTROLO POSITIVO: `deploy-manifests.test.ts` recorta os blocos
  `build.args` dos três composes e recusa chave/segredo; um bloco sintético com
  `QLMED_API_KEY: ${QLMED_API_KEY}` tem de casar o padrão de recusa. 20 testes
  verdes no ficheiro.
- [x] `node_modules` inteiro na imagem: risco residual **aceite e documentado**
  em `SECURITY.md` (Prisma 7 precisa da árvore no runner). Não é correção.

## OPS-005 — migrate no caminho de deploy com app parado

- [x] CHECK: portão expand-only para migrações com prefixo `>= 20260901`,
  recusando `DROP TABLE`, `DROP COLUMN`, `RENAME COLUMN` e
  `ALTER COLUMN … SET NOT NULL`. Corte justificado: existe um
  `DROP COLUMN "role"` de fev/2026 já aplicado em produção.
- [x] CONTROLO POSITIVO: o verificador recebe DDL destrutivo sintético e
  devolve a lista de violações; recebe um comentário com o mesmo texto e
  devolve vazio (controlo negativo, para não virar grep cego).
- [ ] "Imagem N-1 sobe contra DB N" em CI: **não fechado** — exige docker +
  Postgres no runner isolado, que não expõe socket de engine.

## DOC-001 — docs mandam `db:push` e prometem deploy automático

- [x] CHECK: `docs/deployment/qlmed-app.md` sem `npm run db:push` e sem gatilho
  encadeado de workflow; deploy documentado como despacho manual com os passos
  reais (`publish:server` → CI verde → `gh workflow run` → `check:deploy`).
- [x] CHECK: `AGENTS.md` reescrito ("Deploy **não** roda no push"); `README.md`
  atualizado sobre os atalhos removidos.
- [x] CONTROLO POSITIVO: regra nova em `scripts/validate-docs.mjs` reprova
  `db:push` em bloco de comando e gatilho encadeado em qualquer sítio de
  `docs/deployment/**`. A regra **disparou no ficheiro real** durante o
  trabalho, antes de eu terminar a reescrita:
  ```
  Documentation validation failed (1):
  - docs/deployment/qlmed-app.md: `workflow_run`: gatilho proibido pelo
    hardening de CI; o deploy é `workflow_dispatch` manual
  ```
  Fixture dedicada em `scripts/docs-fixtures/deploy-invalid/`, exercida por
  `scripts/test-docs-validator.sh`, que exige os DOIS erros — apagar metade da
  regra reprova o teste.

## DOC-003 — SECURITY.md desalinhado do lockfile

- [x] CHECK: `next@15.5.24` em `SECURITY.md` = `package.json`.
- [x] CHECK: risco 6 de `qlmed-app.md` reescrito — dizia "todos os 7 usuários
  autenticam por PIN" e "rate limiting de 5 tentativas/min por IP". O código
  (ADR-0012 / SPEC-019) faz login só por senha, sem campo de e-mail, com
  bloqueio de 3→15 min e 10→24 h. `PIN_MAP_JSON` fica descrito como caminho
  legado. Nenhum ficheiro de auth foi editado (superfície da L2).

## SUPPLY-002 — tags mutáveis de imagem

- [x] CHECK: os três estágios do `Dockerfile` usam
  `node:22-alpine@sha256:c610fcdfb1d5b4740dd70c284ed3cb16bb857e0f7166196e36a5501df7a3aa32`.
  Digest resolvido do registry (`registry-1.docker.io`, header
  `docker-content-digest`) em 2026-09-01, não inventado.
- [x] CONTROLO POSITIVO: teste exige `@sha256:` de 64 hex em todo `FROM`, exige
  digest único entre estágios, e prova que `FROM node:22-alpine AS deps`
  (tag móvel) NÃO casa o padrão.
- [ ] `postgres:18-alpine` por digest: **não fechado por decisão medida**. O
  deploy canônico (`deploy-production.yml`) só faz `build qlmed-app` e
  `up -d --no-build qlmed-app`; nunca toca `qlmed-db`. Fixar o digest do banco
  transformaria o próximo `up -d` completo numa recriação do contentor de
  banco, e o digest da imagem viva do host não é observável daqui (proibido
  tocar no host). Registado em `SECURITY.md` com o motivo.
- [x] mysql2 inalcançável: já fechado pela dispensa nominal do pai
  (`scripts/verify-dependency-audit.mjs`). Não dupliquei nem reverti.

## SUPPLY-003 — container sem `USER`

- [ ] `USER nextjs` no Dockerfile: **não fechado por decisão medida**. O
  `start.sh` arranca como root só para `chown -R nextjs:nodejs` em
  `/app/storage` e `/app/xml_backup`, que são volumes MONTADOS
  (`qlmed_app_storage`), e faz `exec su-exec nextjs` logo a seguir — o Next.js
  e o `migrate deploy` nunca correm como root. Trocar para `USER nextjs` sem
  provar a posse do volume vivo troca defesa em profundidade por
  indisponibilidade: um ficheiro de root lá dentro deixa o app sem escrita e
  sem o chown de arranque para o corrigir.
- [ ] `cap_drop` no `qlmed-db`: não aplicado. Mudar a postura de segurança do
  contentor de banco de produção sem poder medir o efeito é a mesma armadilha.
- [x] CHECK: o motivo dos dois ficou escrito no `Dockerfile`, ao lado do
  `su-exec`, para a próxima leitura não o redescobrir.

## TEST-001 — zero teste de render (P0 da folha)

- [x] CHECK: ambiente de render configurado — `jsdom` + `@testing-library/react`
  + `@testing-library/dom`, `@vitejs/plugin-react` ligado no `vitest.config.ts`,
  `vitest.setup.ts` com os buracos do jsdom (`matchMedia`,
  `URL.createObjectURL`). Ambiente `jsdom` por docblock, ficheiro a ficheiro —
  os ~97 testes de lógica pura continuam em `node`.
- [x] CHECK: **4 ficheiros `.test.tsx`** novos, 16 testes, montando componentes
  reais (nenhum `readFileSync` de fonte).
- [x] CONTROLO POSITIVO nomeado pela auditoria — quebrar `direction=received`
  na página de NFS-e recebidas:
  ```
  × pede NFS-e recebidas: type=NFSE e direction=received
  AssertionError: expected '/api/invoices?page=1&limit=5000&type=…'
    to contain 'direction=received'
  Tests  1 failed | 3 passed (4)
  ```
  Reverti a sabotagem; o ficheiro voltou a `direction: 'received'` (linha 96).
- [x] CONTROLO POSITIVO do UI-001 — desliguei o ramo de truncamento do
  `ListCount`:
  ```
  × avisa que a lista está truncada quando o total passa do que foi carregado
  Tests  1 failed | 4 passed (5)
  ```
- [x] CONTROLO POSITIVO do UI-004 — desliguei o trap de Tab no hook:
  ```
  × Tab no último elemento volta para o primeiro, dentro do diálogo
  × Shift+Tab no primeiro elemento volta para o último
  Tests  2 failed | 2 passed (4)
  ```

## UI-001 — cap silencioso de 5000

- [x] CHECK: as quatro listas fiscais (`invoices`, `issued`, `cte`,
  `nfse-recebidas`) usam `ListCount`, ponto único de escrita da contagem.
- [x] CONTROLO POSITIVO, por render: total 5001 com 2 carregadas mostra
  `role="status"` com "2 de 5001 nota(s) — lista truncada"; total igual ao
  carregado mostra "2 nota(s)" e `queryByRole('status')` é `null`. Mesmo par na
  NFS-e (6000 vs 1).

## UI-002 — cobertura histórica do financeiro

- [x] CHECK: `getFinanceiroDuplicatasCoverage` exposto e devolvido como
  `coverage` pelo `handleContasGet`; a UI mostra "Cobertura incompleta: N
  nota(s) …".
- [x] CONTROLO POSITIVO, por render: `remaining: 137` mostra o aviso com o
  número; `remaining: 0` não mostra; `coverage` ausente (API antiga) também não
  mostra — um aviso sem base seria tão errado quanto o silêncio.
- [ ] Laço até `remaining = 0` num job: **não fechado**. Não existe job; o
  backfill é preguiçoso dentro do GET, e fechar o histórico inteiro numa
  requisição HTTP é o risco que o próprio finding aponta. A cobertura passou a
  ser visível, que é o que impede a leitura errada.

## UI-003 — estoque cravado no relatório de válvulas

- [x] CHECK: `REAL_STOCK` removido; `netQty = Math.round((purchasedQty −
  soldQty) × 100) / 100`, sem override.
- [x] CONTROLO POSITIVO: o teste recusa a forma `netQty: MAPA[chave] ?? …` e
  prova que a linha antiga casa esse padrão de recusa. Instrumento é leitura de
  fonte de propósito: a ausência de uma tabela de dados cravada é propriedade
  do fonte, não de uma execução — não há entrada que faça um `const` aparecer.

## UI-004 — `ConfirmDialog` sem trap de Tab

- [x] CHECK: trap extraído para `src/hooks/useDialogKeydown.ts`; `Modal` e
  `ConfirmDialog` passaram a partilhar o mesmo código (era a duplicação que
  tinha deixado os dois divergirem).
- [x] CONTROLO POSITIVO: render real — Tab no último botão devolve o foco ao
  primeiro e NÃO ao botão fora do diálogo; Shift+Tab no primeiro vai ao último;
  Escape fecha; fechado não escuta o teclado.

## UI-005 — push mostra remetente e número

- [x] CHECK: `assertSafePushPayload` é chamada no caminho real
  (`dispatchInvoicePush`, `web-push.ts:75`) — não é guarda decorativa.
- [x] CONTROLO POSITIVO já existente em `src/lib/__tests__/web-push.test.ts`:
  payload com 44 dígitos e payload com XML têm de lançar; payload legítimo não.
  Resíduo (remetente + nº) é aceite de produto. Sem alteração.

---

## Portões finais da folha

- [x] `npm run typecheck` verde (sem saída)
- [x] `npm run lint` verde (sem saída)
- [x] `npm test` verde: **99 ficheiros / 761 testes passados, 3 ficheiros e 4
  testes skipped (102 / 765)** — antes eram 94/725. +5 ficheiros, +36 testes.
- [x] `npm run ci:verify` verde: 1 política + 15 casos de hardening + 11 de
  deploy guard
- [x] `npm run docs:validate` e `docs:validate:test` verdes
- [x] `npm run build` verde (Next 15.5.24, todas as rotas)
- [x] Commit em `fix/audit-l9-ops`, empurrado para `origin`
