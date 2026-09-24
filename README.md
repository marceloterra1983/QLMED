# QLMED

Modelo operacional do projeto:

- `prod` fica na **vps2** (único writer)
- o checkout canônico com Git fica em `~/qlmed/app` no host **dev**
- o runtime implantado do app, sem Git, fica em `/srv/qlmed/app` **na vps2**
- o runtime da stack (Compose, envs e volumes) fica em `/srv/qlmed` na vps2
- neste `dev`, `~/qlmed/production` é staging do builder (`qlmed-prod`), não o
  runtime da vps2
- scripts/ops do QLMED ficam em `~/qlmed/app/ops`
- **n8n não existe mais** (nem em dev nem em prod)
- `Evolution` fica somente em prod (vps2)
- produção: um PostgreSQL canônico `postgres` na vps2, só via `DATABASE_URL`;
  não existe `qlmed_dev`
- o host `dev` alcança o writer via túnel SSH `127.0.0.1:5435` (Next/preview);
  replay/CI usa `qlmed_ci` em `127.0.0.1:5433` —
  [ADR-0020](docs/decisions/0020-omarchy-next-canonical-writer-tunnel.md)
- o CI usa `qlmed_ci` apenas como banco efêmero de testes

## Desenvolvimento

- `app dev` via `npm run dev`: porta **3000** neste host `dev`
- Preview canônico: worktree `~/qlmed/.worktrees/preview` na porta **3002**
- **não** subir n8n
- `Evolution usado pelo prod`: `https://evolution.qlmed.com.br`
- `DATABASE_URL` no `dev` aponta só para o Postgres isolado local (`127.0.0.1`).
  Não crie aliases `*_DEV`/`*_PROD` nem o nome de banco `qlmed_dev`.
- Serviços de fundo desligados no `dev`: `QLMED_DISABLE_BACKGROUND_SERVICES=true`
- Antes de uma operação que possa alterar dados **na vps2**, confirme o receipt
  recente do conjunto `qlmed` no backup. O código não lê `.env` nem backups.

## Fonte de verdade

- todo desenvolvimento do app deve acontecer no checkout canônico `~/qlmed/app`
- os manifests de producao versionados ficam em `~/qlmed/app/production`
- `/srv/qlmed/app/production` não é fonte de verdade: esse diretório é excluído
  do rsync de deploy e pode conter artefatos antigos
- `/home/marce/qlmed/production` neste `dev` é staging do builder; o runtime
  canônico `/srv/qlmed` fica na **vps2**
- a publicacao do app em `https://app.qlmed.com.br` **nao** parte do push. O `main` local e a fonte. `git push origin main` e so backup. Os workflows de CI e de deploy estao desligados. `npm run verify:release <SHA>` corre no container isolado. `npm run deploy:local` para antes de publicar.

## Publicacao

Sequencia real:

1. merge no `main` local (checkout canônico `~/qlmed/app`);
2. `git push origin main` (backup, fast-forward);
3. quando for autorizar uma revisao, `npm run verify:release <SHA>` e o recibo em `/home/marce/qlmed/var/release-receipts/<SHA>.json`;
4. `npm run deploy:local DEPLOY <SHA>` so imprime `DRY_RUN_OK` — nao publica.

- execute os comandos somente no checkout canônico `~/qlmed/app`, nunca no runtime `/srv/qlmed/app`
- `npm run publish:server` faz `git push origin main` e imprime um comando de dispatch antigo; nao use esse dispatch
- `npm run deploy:server` e `npm run rollback:server` foram REMOVIDOS na auditoria b177b07
- `scripts/deploy-server.sh` e `scripts/rollback-server.sh` recusam destino publico

## Regras

- n8n foi aposentado; não instalar nem reativar
- a chave do `Evolution` de producao nao deve ficar versionada no repositorio
- `npm run dev` não deve iniciar sincronizadores de fundo; use
  `QLMED_DISABLE_BACKGROUND_SERVICES=true`
