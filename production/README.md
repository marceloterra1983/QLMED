# QLMED Production

Fonte de verdade dos manifests de producao do QLMED.

## Host

- producao principal: `server`
- app: `https://app.qlmed.com.br`
- n8n: `https://n8n.qlmed.com.br`
- evolution: `https://evolution.qlmed.com.br`
- publicacao: GitHub Actions `QLMED Production Deploy` (manual)

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

1. push/merge em `main`;
2. `QLMED CI` (`ci.yml`) do **mesmo** SHA em `main` com `conclusion=success` (evento `push`);
3. dispatch manual de `QLMED Production Deploy` em `main` com:
   - `confirm_production` exatamente `DEPLOY`;
   - `revision` = SHA completo (40 hex minusculos) de `origin/main`;
4. gates internos (confirmacao, ref, SHA, CI do SHA, re-check de main) **antes** de qualquer mutacao;
5. sync/build/migrate/health no runner `qlmed-prod`.

Notas:

- **CI bem-sucedida nao dispara deploy.** O environment `production` so tem politica **main-only** (sem required reviewers); a autorizacao e o `workflow_dispatch` + inputs.
- o workflow falha fechado se faltar CI do SHA, se main avancou, ou se a confirmacao/ref forem invalidas; ele mesmo valida health e revisao implantada.
- `npm run publish:server` **somente** faz o push e imprime o comando de dispatch; **nao** dispara nem aguarda o deploy.
- apos CI verde e dispatch manual, acompanhe o workflow no GitHub; depois do sucesso, `npm run check:deploy`.
- `scripts/deploy-server.sh --legacy` permanece apenas como recuperacao operacional manual.
- rollback da producao publica:
  - falha no meio do workflow: rollback automatico de imagem daquela execucao;
  - opcao manual no host: recovery com a imagem preservada `qlmed-app:previous` (nao e o `scripts/rollback-server.sh`);
  - codigo anterior via Actions: commit de revert/recovery em `main` (novo tip), CI desse SHA, depois dispatch do `origin/main` atual (o gate so aceita o tip atual).
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
