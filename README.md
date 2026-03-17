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

## Publicacao

- antes de publicar, validar o alinhamento com `npm run check:deploy`
- para publicar o estado atual de `main`, usar `npm run publish:server`
- para deploy manual sem `git push`, usar `npm run deploy:server`
- para rollback do ultimo release valido, usar `npm run rollback:server latest`

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
