# QLMED agent instructions

## Sources of truth

- Feature behavior and acceptance criteria: `specs/`
- Project principles: `.specify/memory/constitution.md`
- Current architecture: `docs/architecture/`
- Durable decisions: `docs/decisions/`
- Domain vocabulary and invariants: `docs/domain/`
- Database model and migrations: `prisma/schema.prisma` and `prisma/migrations/`
- Executable evidence: code, tests and `.github/workflows/ci.yml`

Do not copy the same requirement or decision into multiple sources. Link to the
canonical document instead.

## Required workflow

1. Read the relevant feature specification.
2. Read applicable architecture documents and accepted ADRs.
3. Resolve material ambiguity before implementation.
4. Add or update tests for behavioral changes.
5. Run checks proportional to the change.
6. Report checks actually run; never infer that a check passed.

## Validation commands

```bash
npm run docs:validate
npx tsc --noEmit
npm run lint
npm test
npm run test:integration
npm run build
```

Database changes additionally require:

```bash
npm run db:migrate:verify
npm run db:reconcile:verify
```

## Safety boundaries

- Never read, print, add or commit `.env` files or backups.
- Production has one persistent canonical PostgreSQL (`postgres`) on **vps2**
  through `DATABASE_URL`. The `dev` host must restore a dump into local Postgres
  (`postgres` or disposable `qlmed_ci` on `127.0.0.1:5433`) and must not point
  `DATABASE_URL` at vps2. Do not create `qlmed_dev` or parallel URL aliases.
  See [ADR-0019](docs/decisions/0019-dev-isolated-restore-vps2-writer.md).
- `ops/scripts/qlmed-dev-reseed.sh` still exists on disk and targets
  `qlmed_dev`, which no longer exists — do not run it.
- Do not run deploy, publish, migration deploy or production scripts unless the
  user explicitly requests that external effect.
- Schema changes use versioned Prisma migrations. Runtime DDL is legacy and
  must not be introduced.
- Preserve single-company isolation: derive company context from the
  authenticated user through the canonical helpers, not request-controlled IDs.
- Authorization is enforced server-side. UI visibility is not authorization.
- External integrations need bounded timeouts, safe logging and explicit error
  handling. Never log credentials, certificates, tokens or complete fiscal XML.
- An accepted ADR is historical. Supersede it with a new ADR instead of
  rewriting its outcome.

## AI workflow posture

- Work in task-specific isolated git worktrees on a feature branch. Do not create
  permanent sibling folders (`app-ai-governance` or similar). Exception: the
  permanent preview worktree `/home/marce/qlmed/.worktrees/preview` (:3002) —
  use it for UI smoke before merge/deploy; do not replace it with another Next.
- `governance.yaml` pins Spec Kit; GSD is disabled unless re-enabled locally with a
  pinned overlay and declared entrypoints.
- Spec Kit remains the mandatory gate for behavior, contracts, data, security,
  operations or architecture changes.

## Spec Kit

- Spec Kit owns the behavioral contract, technical feature plan and task
  traceability. Pin and validator: `governance.yaml`. Decision: [ADR-0009](docs/decisions/0009-ai-tooling-auto-refresh.md).
- Use a full specification for observable behavior, contracts, permissions,
  persistence, integrations or significant non-functional requirements.
- Use an ADR when a decision is durable, cross-feature or architecturally
  constraining. Keep local reversible choices in the feature plan.
- Cursor loads `.cursor/skills/speckit-*` (same files as `.agents/skills/speckit-*`).
- Do not force-upgrade the project pin on `main`. Host CLI updates are automatic;
  pin upgrades are a dedicated PR. See `docs/spec-kit.md`.

## graphify

When `graphify-out/graph.json` exists, the project has a knowledge graph with god nodes, community structure, and cross-file relationships.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- If this worktree has no graph, query the canonical checkout with
  `--graph ../app/graphify-out/graph.json` or `--graph ../app-dev/graphify-out/graph.json`.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
- The host refresh upgrades the Graphify CLI and rebuilds the gitignored graph daily.

## Agent kit — honest tests

Complements the rules above.

- **Always:** `npm test` (and `npx tsc --noEmit` / `npm run lint` when TS/JS changes) before claiming done.
- **Ask first:** `db:migrate:deploy`, publish, production scripts, new dependency.
- **Never:** delete or weaken a failing test; mock company isolation / auth / money to go green; import a package not in the lockfile (`npm ls <pkg>` first).

## Infraestrutura e ambiente

Host de desenvolvimento: Omarchy `dev`, checkout `~/qlmed/app`.
Writer de produção: **vps2**. O host `server` não tem papel QLMED (será destruído).
n8n não existe mais. Ver [ADR-0019](docs/decisions/0019-dev-isolated-restore-vps2-writer.md).

### Diretórios

- `/home/marce/qlmed/app/` — checkout canônico com Git
  - `DATABASE_URL` no `dev` = Postgres isolado em `127.0.0.1:5434` (nome
    `postgres`) ou sidecar `qlmed_ci` em `127.0.0.1:5433`. Nunca a vps2.
  - `npm run dev` na porta **3000**. Preview: `~/qlmed/.worktrees/preview` **:3002**.
  - `ops/` versionado no checkout.
- `/home/marce/qlmed/production/` — staging do builder `qlmed-prod` neste `dev`
- `/srv/qlmed/` **na vps2** — runtime (`app/` sem Git, compose, env, volumes)
- `/srv/qlmed/actions-runner-qlmed-prod/` neste `dev` — listener do deploy

### Integrações externas

Sefaz (NF-e), NSDocs, Receita Federal (NFS-e), ANVISA, OneDrive (sync de XML),
Evolution API (WhatsApp). n8n aposentado.

### Comandos comuns

```bash
# Produção: somente na vps2, via workflow_dispatch — não compose up neste host
curl http://127.0.0.1:13000/api/health   # na vps2
```

Scripts de app (`dev`, `build`, `lint`, `db:*`) estão em `package.json`.
`npm run dev` sobe o Next em `0.0.0.0:3000` (não `localhost`); no `dev` o
Postgres isolado publica `127.0.0.1:5434`.

### Deploy e migração de schema

Deploy **não** roda no push. Push para `main` roda o `QLMED CI` e para aí;
publicar exige `workflow_dispatch` de `deploy-production.yml`, com
  `confirm_production=DEPLOY` e o SHA de 40 caracteres do tip de `origin/main`
  que já tem CI verde. Cloud Agents: `bash scripts/deploy-production.sh <SHA>`
  (requer secret `QLMED_DEPLOY_GH_TOKEN`; o token Cursor App não tem
  `actions:write`). Migrações seguem expand/contract — rollback de imagem
**não** desfaz migração aplicada, por isso migração nova é expand-only
(portão em `src/lib/__tests__/deploy-manifests.test.ts`). Procedimento completo
na skill `qlmed-deploy` (`.claude/skills/qlmed-deploy/SKILL.md`) e em
`docs/deployment/qlmed-app.md`.

`npm run deploy:server` e `npm run rollback:server` **não existem mais**
(auditoria b177b07): pré-passavam `--legacy` e tinham a raiz de produção
pública como padrão, então publicavam `app.qlmed.com.br` sem nenhum dos portões
acima. Os scripts em `scripts/` sobrevivem para a stack legada e recusam
destino público.

### Endpoints públicos e portas

- App: `https://app.qlmed.com.br/` (local: 13000 produção `127.0.0.1` only, 3000
  dev no checkout main; preview canônico **só** `:3002` →
  `.worktrees/preview`)
- n8n: `https://n8n.qlmed.com.br/` (local: 5678)
- Evolution API: `https://evolution.qlmed.com.br/` (local: 8085)
- PostgreSQL: `127.0.0.1:5432`, publicado por `qlmed-db` do compose canônico

### Preview DEV canônico (Tailscale) — obrigatório antes de merge/deploy de UI

Worktree permanente: `/home/marce/qlmed/.worktrees/preview`  
URL: `http://100.68.84.119:3002`  
Unit: `systemctl --user start qlmed-dev-preview`  
Starter: `ops/scripts/qlmed-dev-preview-starter.mjs`  
(`QLMED_PREVIEW_CWD` opcional para apontar a uma worktree de feature.)

`npm run dev` no bash do Cursor morre com o agente. **Não** suba outro Next.
**Única porta de preview = 3002.** Proibido 3003/3004. Feature com UI:
checkout/rebase do tip **nessa** worktree (ou override do `cwd` do starter),
smoke em `:3002`, **depois** PR/merge/deploy.

- `NEXTAUTH_URL` (obrigatória em `src/lib/env.ts`): preview HTTP exige
  `http://100.68.84.119:3002`. Herdar `https://app.qlmed.com.br` → cookie
  `Secure`/`__Host-` → CSRF drop → catch do `signIn` = “Erro ao fazer login”.
  Senha errada é outra mensagem (“Senha inválida”).
- Diagnóstico refused: `ss` sem listen = processo morto (`systemctl --user
  restart qlmed-dev-preview`). Curl local 200/307 + Windows refused =
  Tailscale/browser (IPv6: Next pode não ouvir `[::]`).
- Policy Cursor: `.cursor/rules/dev-preview-persistente.mdc` e
  `always-deploy-production.mdc` (alwaysApply).

### CI, runners e merge

- `main` tem ruleset ativo (`main: CI verde antes do merge`, sem bypass):
  só entra por PR, exige o check `quality` de `ci.yml`, sem push direto,
  sem force-push, sem apagar. Push direto devolve `GH013`.
- Mesclar: `gh pr merge --auto --squash <N>` logo após abrir a PR. Fica na
  fila e mescla sozinho no verde. `gh pr merge` sem `--auto` com check
  pendente é recusado.
- CI corre nos runners self-hosted `qlmed-ci-linux-01..03` (containers,
  2 CPU / 3 GB, profile `validation-linux-qlmed` no repo
  `GitHub-Runners-Platform`). Saída à internet só pelo proxy squid com
  allowlist (github.com, githubusercontent, ghcr, registry.npmjs.org,
  binaries.prisma.sh, nodejs.org…). Não há `gh` no runner: script que
  precisa da API usa `fetch` + `GITHUB_TOKEN`; `fetch` nativo do Node só
  honra o proxy com `NODE_USE_ENV_PROXY=1` no `env` do job.
- Não use `cache: npm` no `setup-node`: o runner limpa `/home/runner` a
  cada job, o cache nunca restaura e só consome a cota de 10 GB. O cache
  de `.next/cache` funciona e fica.
- Deploy corre só no `qlmed-prod-runner` (label `qlmed-prod`, serviço
  systemd no host). O `auto-update-packages.timer` do host está impedido de
  reiniciá-lo (needrestart override em
  `/etc/needrestart/conf.d/99-auto-update-safe.conf`).

### Infra notes específicas do host atual

- Runner self-hosted com label `qlmed-prod`, roda como serviço systemd.
- Container entrypoint (`start.sh`): valida `DATABASE_URL`, roda
  `prisma migrate deploy`, depois inicia `node server.js`.
- Node 22 via nvm no host (dev); imagem Alpine (produção). Puppeteer com
  Chromium do sistema para geração de PDF.
- Acesso de dev via Tailscale: `http://100.68.84.119:3000` (main); preview
  canônico **só** `http://100.68.84.119:3002` (`.worktrees/preview`) —
  ver Preview DEV canônico.
- `nvm` obrigatório: `export NVM_DIR="$HOME/.nvm" && . "$NVM_DIR/nvm.sh" && nvm use 22`
- `n8n` `$env` expressions (`{{ $env.QLMED_API_URL }}` etc.): versões recentes do
  n8n têm `N8N_BLOCK_ENV_ACCESS_IN_NODE=true` por padrão, o que falha toda
  execução com `ExpressionError: access to env vars denied` sem aviso claro.
  `env/n8n.env` de produção seta `N8N_BLOCK_ENV_ACCESS_IN_NODE=false`.
- `qlmed-app`, `qlmed-db`, `qlmed-n8n`, `qlmed-n8n-db` compartilham o projeto
  `qlmed` de `/srv/qlmed/docker-compose.yml`. A Evolution do QLMED é um projeto
  separado em `/srv/qlmed/evolution/`.
- Acesso Postgres via host (`127.0.0.1:5432`): se a porta falhar, diagnóstico
  não-mutante apenas (não recriar proxies legados):
  ```bash
  docker compose --project-name qlmed -f /srv/qlmed/docker-compose.yml ps qlmed-db
  docker logs qlmed-db --tail 50
  ```

### Code Style

- UI em português (pt-BR); validação com Zod; ícones Material Symbols Outlined
  (`<span className="material-symbols-outlined">`); sem biblioteca de
  componentes (tudo custom, sem shadcn/ui, Radix, Material UI); alias de path
  `@/*` → `./src/*`; formatação via ESLint (`eslint-config-next`).
