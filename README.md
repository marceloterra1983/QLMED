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
- a publicacao do app em `https://app.qlmed.com.br` acontece por `git push` em `main` a partir do checkout canônico `~/qlmed/app`, seguido do workflow GitHub Actions `deploy-production.yml` (aprovacao no environment `production`)

## Publicacao

- execute os comandos abaixo somente no checkout canônico `~/qlmed/app`,
  nunca no runtime `/srv/qlmed/app`
- antes de publicar, validar o alinhamento com `npm run check:deploy`
- para publicar o estado atual de `main`, usar `npm run publish:server`; o script faz `git push origin main` e espera o `https://app.qlmed.com.br/api/health` refletir o commit
- `npm run deploy:server` e apenas um deploy manual/legado do compose; nao e o caminho normal da producao publica
- `npm run rollback:server -- latest` faz rollback apenas da stack manual/legada; para a producao publica o rollback e via imagem `qlmed-app:rollback-*` / `qlmed-app:previous` no workflow (ou re-deploy de um commit anterior)
- depois de publicar, confirmar o `build.commitSha` em `https://app.qlmed.com.br/api/health`

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
