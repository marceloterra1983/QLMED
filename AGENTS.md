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
  through `DATABASE_URL`. On Omarchy, Next (`:3000` / preview `:3002`) reaches
  that writer via SSH tunnel `127.0.0.1:5435` ([ADR-0020](docs/decisions/0020-omarchy-next-canonical-writer-tunnel.md)).
  CI and `db:migrate:verify` use disposable `qlmed_ci` on `127.0.0.1:5433`.
  Do not create `qlmed_dev` or parallel URL aliases. `migrate deploy` on the
  writer is ROLE-001 (production workflow only).
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
  `--graph /home/marce/qlmed/app/graphify-out/graph.json`.
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
n8n não existe mais. Ver [ADR-0020](docs/decisions/0020-omarchy-next-canonical-writer-tunnel.md).

### Diretórios

- `/home/marce/qlmed/app/` — checkout canônico com Git
  - `DATABASE_URL` do Next neste `dev` = túnel `127.0.0.1:5435` → vps2
    `postgres` (ADR-0020). Replay/CI = `qlmed_ci` em `127.0.0.1:5433`.
    Dump isolado `:5434` não alimenta o preview.
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
# Produção: health na vps2. Não há deploy por GitHub Actions.
curl http://127.0.0.1:13000/api/health   # na vps2, via SSH
```

Scripts de app (`dev`, `build`, `lint`, `db:*`) estão em `package.json`.
`npm run dev` sobe o Next em `0.0.0.0:3000` (não `localhost`); no `dev` o
túnel do writer publica `127.0.0.1:5435`.

### Deploy e migração de schema

O `main` local é a fonte. `git push origin main` é só espelho (fast-forward).
Não abra pull request e não despache workflow.

Verificação, em três tempos:

1. Enquanto edita, no host: `npm test`, `npm run lint`, `npm run typecheck` no que mudou. Isto é feedback. Não autoriza publish.
2. Antes de merge no `main` local: `npm run verify:release <SHA>`. Corre dentro do container `qlmed-ci-linux-01` (rede internal, sidecar `qlmed-ci-db:5432`), a mesma lista que o CI corria. Sucesso grava `/home/marce/qlmed/var/release-receipts/<SHA>.json`. Sem recibo, não há publish.
3. Publish, só quando for subir a vps2: `npm run deploy:local -- DEPLOY <SHA> --publish`. Recusa sem recibo, se o recibo tiver mais de 24 h, ou se o SHA não for o tip do `main` local.

`scripts/deploy-production.sh` recusa: o Actions não publica mais.
Migrações seguem expand/contract — rollback de imagem
**não** desfaz migração aplicada, por isso migração nova é expand-only
(portão em `src/lib/__tests__/deploy-manifests.test.ts`).

`npm run deploy:server` e `npm run rollback:server` **não existem mais**
(auditoria b177b07): pré-passavam `--legacy` e tinham a raiz de produção
pública como padrão, então publicavam `app.qlmed.com.br` sem nenhum dos portões
acima. Os scripts em `scripts/` sobrevivem para a stack legada e recusam
destino público.

### Endpoints públicos e portas

- App: `https://app.qlmed.com.br/` (local: 13000 produção `127.0.0.1` only, 3000
  dev no checkout main; preview canônico **só** `:3002` →
  `.worktrees/preview`)
- Evolution API: `https://evolution.qlmed.com.br/` (local: 8085)
- n8n QLMED: aposentado (SPEC-046 / SPEC-081). Webhook inbound
  `/api/webhooks/n8n` permanece; `/api/integrations/n8n/*` responde 410.
- PostgreSQL: `127.0.0.1:5432`, publicado por `qlmed-db` do compose canônico

### Preview DEV canônico (Tailscale) — obrigatório antes de merge/deploy de UI

Worktree `/home/marce/qlmed/.worktrees/preview`, porta **3002**; smoke de UI obrigatório antes de merge/deploy.
Use a unit persistente para servir o preview.
Detalhes do starter, URL, ambiente e diagnóstico: [docs/ops/preview-dev.md](docs/ops/preview-dev.md).

### CI, runners e merge

- `main` tem ruleset `main: sem force-push nem delete` (sem bypass):
  push direto fast-forward é o espelho. Force-push e apagar `main` continuam
  proibidos. Não há check `quality` nem pull request obrigatório.
- Não abra PR. Trabalhe em branch local, faça merge no `main` local, depois
  `git push origin main`.
- A verificação de release usa o container `qlmed-ci-linux-01` (rede internal,
  sidecar `qlmed-ci-db:5432`), não o host. Os workflows `QLMED CI`,
  `QLMED Production Deploy` e `AI tooling drift` estão desligados.
- Os containers `qlmed-ci-linux-01..03` continuam de pé (2 CPU / 3 GB, profile `validation-linux-qlmed` no repo `GitHub-Runners-Platform`). A saída à internet deles passa pelo proxy squid com allowlist. Não são mais agendados pelo Actions.
- O listener `qlmed-prod-runner` continua instalado, mas nenhum workflow o chama.

### Infra notes específicas do host atual

Omarchy `dev` hospeda o runner self-hosted `qlmed-prod` e o Node de desenvolvimento.
Runtime e Compose da aplicação ficam em `/srv/qlmed` na vps2.
Detalhes de serviços e diagnóstico: [docs/ops/infra-host.md](docs/ops/infra-host.md).

### Code Style

- UI em português (pt-BR); validação com Zod; ícones Material Symbols Outlined
  (`<span className="material-symbols-outlined">`); sem biblioteca de
  componentes (tudo custom, sem shadcn/ui, Radix, Material UI); alias de path
  `@/*` → `./src/*`; formatação via ESLint (`eslint-config-next`).
