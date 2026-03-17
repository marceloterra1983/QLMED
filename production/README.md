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

- a producao publica do app e publicada por `git push origin main`; o Coolify detecta o novo commit e recria o servico publico
- `npm run publish:server` e o caminho operacional padrao porque faz o push e espera o `https://app.qlmed.com.br/api/health` refletir o commit publicado
- `scripts/deploy-server.sh` e `.github/workflows/deploy-production.yml` continuam apenas como trilha manual/legada para sincronizar `/home/marce/QLMED/production` em recuperacao operacional
- os segredos continuam apenas no host remoto
- `https://app.qlmed.com.br/api/health` deve expor o `build.commitSha` do release ativo; em ambiente Coolify o valor pode vir de `SOURCE_COMMIT`
