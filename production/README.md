# QLMED Production

Fonte de verdade dos manifests de producao do QLMED.

## Host

- producao principal: `vps2`
- app: `https://app.qlmed.com.br`
- n8n: aposentado
- evolution: `https://evolution.qlmed.com.br`
- publicacao: main local; GitHub e so backup. Workflows de CI e deploy desligados.

## Estrutura remota esperada

- `/home/marce/qlmed/production` → `/srv/qlmed`
- `/home/marce/qlmed/production/docker-compose.yml`
- `/home/marce/qlmed/production/.env`
- `/home/marce/qlmed/production/env/app.env`
- `/home/marce/qlmed/production/env/n8n.env`
- `/home/marce/qlmed/production/app`

`env/app.env` must provide the protected canonical `DATABASE_URL` for the
`qlmed-app` service. It must target the PostgreSQL instance in this Compose
stack (database `postgres`) and must not use `qlmed_dev` or a parallel URL
alias. The value is never committed; the `server-backup` project covers this
database through its `qlmed` backup set.

## Fonte de verdade

- o repositorio `QLMED` e a unica fonte de verdade para codigo e manifests de producao
- `/srv/qlmed` e o runtime canônico; `/home/marce/qlmed/production` e o alias de compatibilidade usado pelo workflow `QLMED Production Deploy`
- o codigo do app fica em `/srv/qlmed/app`; compose, envs e metadados de deploy ficam no diretorio pai
- nao editar os manifests implantados a mao no host

## Deploy

Sequencia real:

1. merge no `main` local;
2. `git push origin main` (backup);
3. recibo de `npm run verify:release` para esse SHA;
4. `npm run deploy:local` confirma o recibo e para antes de mutar a vps2.

Notas:

- Os workflows de CI e de deploy estao desligados. Push nao publica.
- `npm run publish:server` faz o push e imprime um comando de dispatch antigo; nao use esse dispatch.
- Imagem anterior na vps2, quando existir: tag `qlmed-app:previous`. Rollback de imagem nao desfaz migracao.
- o Postgres 18 deve montar o volume em `/var/lib/postgresql` com `PGDATA=/var/lib/postgresql/18/docker`; voltar para `/var/lib/postgresql/data` recria um volume anonimo vazio a cada deploy
- os segredos continuam apenas no host remoto
- `https://app.qlmed.com.br/api/health` deve expor o `build.commitSha` completo do release ativo

## Notificacoes fiscais

- o deploy copia o worker do release e instala em `/srv/qlmed/services/notification-outbox/worker.py` (via `scripts/install-notification-outbox-cron.sh`)
- envs em `/srv/qlmed/services/nfe-notify/.env` e `/srv/qlmed/services/cte-notify/.env` devem manter `QLMED_API_URL` para a API interna e `QLMED_PUBLIC_URL=https://app.qlmed.com.br` para os links enviados aos usuarios
- o worker deve usar uma chave dedicada com escopos `notifications:dispatch` e `notifications:assets`; nunca reutilize uma chave administrativa
- cada nota recebida cria o evento e as entregas por destinatario/canal na mesma transacao
- mensagens WhatsApp usam `/r/<deliveryId>` para registrar o clique em `NotificationClick` antes de redirecionar para a tela fiscal correta
- leases expirados antes do envio voltam para retry; resultados incertos apos inicio do envio nunca sao repetidos automaticamente
- um administrador deve reconciliar entregas incertas como enviadas ou autorizar explicitamente o reenvio
