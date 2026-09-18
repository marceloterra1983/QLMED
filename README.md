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
- a publicacao do app em `https://app.qlmed.com.br` **nao** e automatica no push: exige CI verde no SHA de `main` e um `workflow_dispatch` manual do `QLMED Production Deploy` (sem required reviewers no environment; so politica main-only)

## Publicacao

Sequencia real:

1. push/merge em `main` (checkout canônico `~/qlmed/app`);
2. `QLMED CI` para esse SHA em `main` conclui com sucesso;
3. dispatch manual de `QLMED Production Deploy` com `confirm_production=DEPLOY` e `revision=<SHA_COMPLETO>`;
4. gates internos (confirmacao, ref, SHA == origin/main, CI do mesmo SHA, re-check antes de mutar);
5. deploy no runner self-hosted `qlmed-prod`.

- execute os comandos somente no checkout canônico `~/qlmed/app`, nunca no runtime `/srv/qlmed/app`
- `npm run publish:server` **somente** faz `git push origin main` e imprime o SHA + o comando de dispatch; **nao** dispara deploy e **nao** aguarda health
- apos o push: aguarde CI verde do SHA, faca o `workflow_dispatch` manual, acompanhe o workflow no GitHub (o workflow valida health e revisao)
- depois que o workflow concluir com sucesso, execute `npm run check:deploy`
- `npm run deploy:server` e `npm run rollback:server` foram REMOVIDOS na auditoria b177b07: pre-passavam `--legacy` e tinham a raiz de producao publica como padrao, entao publicavam `app.qlmed.com.br` sem nenhum dos gates acima
- `scripts/deploy-server.sh` e `scripts/rollback-server.sh` sobrevivem so para a stack legada e agora recusam destino publico; exigem `DEPLOY_DIR` nao publico, `DEPLOY_HEALTHCHECK_URL` nao publico e `DEPLOY_CONFIRM=DEPLOY-LEGACY`
- producao publica: rollback automatico de imagem na falha do workflow; `qlmed-app:previous` so no host (manual); codigo anterior via Actions exige revert/recovery em `main` (novo tip), CI desse SHA e dispatch do `origin/main` atual

## Regras

- n8n foi aposentado; não instalar nem reativar
- a chave do `Evolution` de producao nao deve ficar versionada no repositorio
- `npm run dev` não deve iniciar sincronizadores de fundo; use
  `QLMED_DISABLE_BACKGROUND_SERVICES=true`
