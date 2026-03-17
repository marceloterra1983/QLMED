# QLMED Production

Fonte de verdade dos manifests de producao do QLMED.

## Host

- producao principal: `server`
- painel Coolify: `https://coolify.qlmed.com.br`
- app: `https://app.qlmed.com.br`
- n8n: `https://n8n.qlmed.com.br`
- evolution: `https://evolution.qlmed.com.br`

## Estrutura remota esperada

- `/home/marce/QLMED/production/docker-compose.yml`
- `/home/marce/QLMED/production/.env`
- `/home/marce/QLMED/production/env/app.env`
- `/home/marce/QLMED/production/env/n8n.env`
- `/home/marce/QLMED/production/app`

## Fonte de verdade

- o repositorio `QLMED` e a unica fonte de verdade para codigo e manifests de producao
- `/home/marce/qlmed-server-deploy` e legado e nao deve mais ser usado como alvo de manutencao ou deploy

## Deploy

- o workflow `.github/workflows/deploy-production.yml` roda em um runner self-hosted no proprio `server`
- o workflow sincroniza `production/docker-compose.yml` e o codigo da aplicacao para `/home/marce/QLMED/production`
- os segredos continuam apenas no host remoto
- `https://app.qlmed.com.br/api/health` deve expor o `build.commitSha` do release ativo para confirmar o deploy
