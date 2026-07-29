# QLMED Production

Fonte de verdade dos manifests de producao do QLMED.

## Host

- producao principal: `server`
- painel Coolify: `https://coolify.qlmed.com.br`
- app: `https://app.qlmed.com.br`
- n8n: `https://n8n.qlmed.com.br`
- evolution: `https://evolution.qlmed.com.br`

## Estrutura remota esperada

- `/home/marce/qlmed/production/docker-compose.yml`
- `/home/marce/qlmed/production/.env`
- `/home/marce/qlmed/production/env/app.env`
- `/home/marce/qlmed/production/env/n8n.env`
- `/home/marce/qlmed/production/app`

## Fonte de verdade

- o repositorio `QLMED` e a unica fonte de verdade para codigo e manifests de producao
- `/home/marce/qlmed/production` (→ `/srv/qlmed/app`) e o destino de sync do workflow GitHub Actions; nao editar la a mao — altere manifests no repo e publique via `main`

## Deploy

- `git push origin main` executa primeiro o workflow `QLMED CI`
- somente apos CI aprovado e aprovacao no environment `production`, `QLMED Production Deploy` (`deploy-production.yml`) publica exatamente o SHA validado
- `npm run publish:server` e o caminho operacional padrao porque faz o push e espera o `https://app.qlmed.com.br/api/health` refletir o commit publicado
- `scripts/deploy-server.sh --legacy` permanece apenas como recuperacao operacional manual
- rollback publico: imagem `qlmed-app:rollback-*` / `qlmed-app:previous` no workflow (ou re-deploy de um commit anterior)
- no Coolify, o Postgres 18 deve montar o volume em `/var/lib/postgresql` com `PGDATA=/var/lib/postgresql/18/docker`; voltar para `/var/lib/postgresql/data` recria um volume anonimo vazio a cada deploy
- os segredos continuam apenas no host remoto
- `https://app.qlmed.com.br/api/health` deve expor o `build.commitSha` completo do release ativo

## Notificacoes fiscais

- o deploy instala `/srv/qlmed/services/notification-outbox/worker.py` (via `scripts/install-notification-outbox-cron.sh`) e substitui crons antigos de NF-e/CT-e
- os arquivos `/srv/qlmed/services/nfe-notify/.env` e `/srv/qlmed/services/cte-notify/.env` devem manter `QLMED_API_URL` para a API interna e `QLMED_PUBLIC_URL=https://app.qlmed.com.br` para os links enviados aos usuarios
- o worker deve usar uma chave dedicada com escopos `notifications:dispatch` e `notifications:assets`; nunca reutilize uma chave administrativa
- cada nota recebida cria o evento e as entregas por destinatario/canal na mesma transacao
- mensagens WhatsApp usam `/r/<deliveryId>` para registrar o clique em `NotificationClick` antes de redirecionar para a tela fiscal correta
- leases expirados antes do envio voltam para retry; resultados incertos apos inicio do envio nunca sao repetidos automaticamente
- um administrador deve reconciliar entregas incertas como enviadas ou autorizar explicitamente o reenvio
