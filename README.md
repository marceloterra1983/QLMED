# QLMED

Modelo operacional do projeto:

- `prod` fica no computador `server`
- o checkout canônico com Git fica em `~/qlmed/app`
- o runtime implantado do app, sem Git, fica em `/srv/qlmed/app`
- o runtime da stack (Compose, envs e volumes) fica em `/srv/qlmed`
  (`~/qlmed/production` é o alias operacional)
- scripts/ops do host ficam em `~/server-ops/qlmed/ops` (e shared em `~/server-ops/shared/ops`)
- `n8n` existe em `dev` e em `prod`
- `Evolution` fica somente em `prod`
- um host `dev` dedicado permanece o alvo preferido para desenvolvimento isolado, quando disponível

## Desenvolvimento

- `n8n dev`: `http://100.83.11.58:5678/`
- `app dev` via `npm run dev`: `http://100.83.11.58:3000/`
- `app dev` via Docker: `http://100.83.11.58:3001/`
- `Evolution usado pelo dev`: `https://evolution.qlmed.com.br`

## Fonte de verdade

- todo desenvolvimento do app deve acontecer no checkout canônico `~/qlmed/app`
- os manifests de producao versionados ficam em `~/qlmed/app/production`
- `/srv/qlmed/app/production` não é fonte de verdade: esse diretório é excluído
  do rsync de deploy e pode conter artefatos antigos
- `/home/marce/qlmed/production` aponta para o runtime canônico `/srv/qlmed`; o workflow sincroniza o app em `/srv/qlmed/app` e o compose no diretório pai
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
- `npm run deploy:server` e apenas deploy manual/legado do compose; nao e o caminho normal da producao publica
- `npm run rollback:server -- latest` faz rollback apenas da stack manual/legada
- producao publica: rollback automatico de imagem na falha do workflow; `qlmed-app:previous` so no host (manual); codigo anterior via Actions exige revert/recovery em `main` (novo tip), CI desse SHA e dispatch do `origin/main` atual

## Regras

- o `n8n dev` nao deve ter cron ou webhook real ativo
- o `n8n prod` e o unico dono dos gatilhos reais
- o `n8n dev` deve testar integracoes com `Manual Trigger`
- a chave do `Evolution` de producao nao deve ficar versionada no repositorio
- o ideal e cadastrar a credencial do `Evolution` direto no `n8n dev`

## Variaveis uteis no n8n dev

- `QLMED_DEV_MODE=true`
- `QLMED_ALLOW_REAL_EXECUTIONS=false`
- `QLMED_EVOLUTION_BASE_URL=https://evolution.qlmed.com.br`
