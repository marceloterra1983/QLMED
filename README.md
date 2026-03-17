# QLMED

Modelo operacional do projeto:

- `dev` fica no computador `dev`
- `prod` fica no computador `server`
- `n8n` existe em `dev` e em `prod`
- `Evolution` fica somente em `prod`

## Desenvolvimento

- `n8n dev`: `http://100.123.233.116:5678/`
- `app dev` via `npm run dev`: `http://100.123.233.116:3000/`
- `app dev` via Docker: `http://100.123.233.116:3001/`
- `Evolution usado pelo dev`: `https://evolution.qlmed.com.br`

## Fonte de verdade

- todo desenvolvimento do app deve acontecer em `QLMED`
- os manifests de producao ficam em `QLMED/production`
- `/home/marce/qlmed-server-deploy` e apenas um snapshot legado e nao deve receber novas mudancas
- a publicacao do app em `https://app.qlmed.com.br` acontece por `git push` em `main` seguido do auto deploy do Coolify

## Publicacao

- antes de publicar, validar o alinhamento com `npm run check:deploy`
- para publicar o estado atual de `main`, usar `npm run publish:server`; o script faz `git push origin main` e espera o `https://app.qlmed.com.br/api/health` refletir o commit
- `npm run deploy:server` e apenas um deploy manual/legado do compose em `/home/marce/QLMED/production`; nao e o caminho normal da producao publica
- `npm run rollback:server -- latest` faz rollback apenas da stack manual/legada; para a producao publica o rollback correto continua sendo via Git + Coolify
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
