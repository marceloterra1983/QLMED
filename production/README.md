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

## Deploy

- o workflow `.github/workflows/deploy-production.yml` roda em um runner self-hosted no proprio `server`
- o workflow sincroniza `production/docker-compose.yml` e o codigo da aplicacao para `/home/marce/QLMED/production`
- os segredos continuam apenas no host remoto
