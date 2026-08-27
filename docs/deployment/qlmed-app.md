---
spec: qlmed-app
sumario: Sistema de gestão fiscal e notas fiscais (NF-e, CT-e, NFS-e) da empresa QL MED Materiais Hospitalares LTDA (CNPJ 07.832.309/0001-97).
versao: 1.16
atualizado: 2026-08-07
status: producao
maquina: server
dependencias: [infra/networking]
arquivos_config:
  - /srv/qlmed/docker-compose.yml
  - /srv/qlmed/.env
  - /srv/qlmed/env/app.env
---

# QLMED App

## O que é

> Sistema de gestão fiscal e notas fiscais (NF-e, CT-e, NFS-e) da empresa QL MED Materiais Hospitalares LTDA (CNPJ 07.832.309/0001-97). Construído com Next.js 15 (App Router, standalone output), PostgreSQL 18 e Prisma 7. Acessível em https://app.qlmed.com.br.

## Como funciona

A aplicação roda como container Docker (`qlmed-app`) construído localmente a partir
do código em `/srv/qlmed/app`. O alias `/home/marce/qlmed/production` aponta para
`/srv/qlmed`, portanto o código também aparece em
`/home/marce/qlmed/production/app`. O deploy é feito via GitHub Actions
(`deploy-production.yml`): sincroniza o código, reconstrói o container e faz health
check.

### Stack técnica

| Componente | Tecnologia |
|---|---|
| Framework | Next.js 15 (App Router, standalone) |
| Banco de dados | PostgreSQL 18 (via Prisma 7 ORM) |
| Autenticação | NextAuth v4 |
| CSS | Tailwind CSS |
| Validação | Zod schemas |
| PDF | Puppeteer + Chromium |
| Ícones | Material Symbols Outlined |

### Integrações externas

| Integração | Lib/Client | Descrição |
|---|---|---|
| Sefaz | sefaz-client | Emissão/consulta NF-e, CT-e |
| NSDocs | nsdocs-client | Consulta de documentos fiscais |
| Receita Federal | API direta | NFS-e |
| ANVISA | anvisa-api | Consulta produtos regulados |
| OneDrive | onedrive-client | Sync de XMLs de notas fiscais |
| Microsoft Graph | OAuth | Autenticação OneDrive |

### Rotas da API

`/api/` — anvisa, auth, certificate, cnpj, companies, contacts, cte, customers, dashboard, estoque, financeiro, fiscal, health, invoices, ncm, nsdocs, onedrive, products, receita, register, reports, suppliers, users, webhooks

### Módulos do painel

`/(painel)/` — cadastro, estoque, financeiro, fiscal, relatorios, sistema, visaogeral


### Sync CT-e (DistDFe SEFAZ)

O código para `CTeDistribuicaoDFe` (mTLS A1) está versionado, mas a unidade
não está instalada no host após a consolidação de 31/07/2026:

- Script: `/home/marce/qlmed/ops/scripts/qlmed-cte-dist-sync.js` (+ wrapper `.sh`)
- Unidade e timer: arquivos declarativos em
  `/home/marce/qlmed/ops/systemd`, ambos ausentes do systemd ativo.
- Estado, cooldown e logs: não existem enquanto o timer permanecer ausente.
- Ingest: `POST /api/invoices/upload` (multipart `files`)

NSDocs continua sincronizando NF-e; webhook `sync-cte` delega a `nsdocs/sync`
como alias (não há `/api/cte/sync`).

SEFAZ NFe DistDFe (auto-sync in-app): intervalo/cooldown anti-656 via
`SEFAZ_AUTO_SYNC_INTERVAL_MINUTES` / `SEFAZ_RATE_LIMIT_COOLDOWN_*` em
`env/app.env` (piso 360 min; 656 dobra até 1440).

## Dados e onde ficam

(verificado no runtime em 2026-07-16)

- **Banco principal**: database **`postgres`** (schema `public`) no PostgreSQL 18
  do container Compose `qlmed-db`, via `DATABASE_URL` em
  `/srv/qlmed/env/app.env`. Dados no volume **`qlmed_pgdata`** →
  `/var/lib/postgresql`. Contém todo o
  domínio Prisma: `Invoice` (incluindo `xmlContent` inline — ver risco 2),
  usuários, estoque, financeiro, e o **outbox de notificações**
  (`NotificationOutboxEvent`/`NotificationDelivery`) consumido pelo worker do
  host (ver `integrations/whatsapp.spec.md`).
- **XMLs e PDFs de notas**: volume `qlmed_app_storage` → `/app/storage`, em
  `xml_backup/YYYY_MM/` e `pdf_backup/YYYY_MM/` (paths controlados por
  `LOCAL_XML_BACKUP_DIR`/`LOCAL_PDF_BACKUP_DIR`; escritos por
  `src/lib/xml-file-store.ts`).
- **Backups do banco**: cobertos pelo snapshot diário do host. O
  `server-backup.service` roda às **04:30** e grava `dados/qlmed/banco.pgdump`
  dentro de `/srv/backups/daily/<stamp>/`, verificado com `pg_restore --list`;
  o `server-backup-offsite.service` às **05:10** envia o snapshot para
  `gdrive:server-backup/<stamp>`, conferido por `rclone check` (ver
  `workflows/backup-offsite.spec.md`). O cron dedicado das 03:00/19:00 UTC foi
  aposentado — `qlmed-pg-backup.sh` continua disponível apenas como fallback
  manual de restore, gravando em `/srv/backups/qlmed-pg/` (retenção 14 dias)
  com upload para `gdrive:qlmed-server-backups/qlmed-pg/`.
- **Dev**: **sem database isolado** — dev usa o mesmo database `postgres` da
  produção, na mesma instância PostgreSQL. O antigo `qlmed_dev` não existe mais
  (verificado 2026-08-07).

> Nota (atualizada 2026-07-31): o compose canônico gerencia `qlmed-db`,
> `qlmed-app`, `qlmed-n8n` e `n8n-db`. A Evolution QLMED é um projeto Compose
> separado em `/srv/qlmed/evolution`. O antigo DB proxy não participa do runtime atual.

## Agenda e gatilhos

- **Serviço contínuo**: container `qlmed-app` (`restart: unless-stopped`),
  health check em `/api/health`.
- **Deploy**: por evento — push na `main` → `QLMED CI` → `workflow_run` dispara
  `deploy-production.yml` → aprovação manual no environment `production` →
  runner self-hosted executa (ver `services/github-runner.spec.md`).
- **Consumidor de notificações**: o código está em
  `/srv/qlmed/app/scripts/notification-outbox-worker.py`; o cron root NFE/CTE
  executa-o a cada 10 minutos (detalhes em `integrations/whatsapp.spec.md`).
- **Sincronizações internas**: agendadas pelo próprio app, controladas por env
  (`SEFAZ_AUTO_SYNC_MINUTE`, watcher local de XML `LOCAL_XML_WATCH_*`).

## Configuração atual

- **URL pública**: https://app.qlmed.com.br
- **Porta**: 13000 (host) → 3000 (container)
- **Container**: `qlmed-app`
- **Imagem observada**: `qlmed-app:local` (criada em recuperação manual em
  2026-08-01; label de revisão `unknown`). O endpoint `/api/health` ainda
  reporta o build embutido `804ec333fbca1b66df8a3ac219e16db77c988c55`,
  `source=github-actions`, mas a tag Docker não é um pin imutável.
- **Banco**: PostgreSQL 18 (`qlmed-db` no projeto Compose `qlmed`; bind direto em `127.0.0.1:5432`)
- **Compose**: `/srv/qlmed/docker-compose.yml`
- **Env**: `/srv/qlmed/env/app.env`
- **Empresa**: QL MED Materiais Hospitalares LTDA (CNPJ 07.832.309/0001-97)
- **Health check**: `curl http://127.0.0.1:13000/api/health`
- **Tenant ID** (OneDrive): `613651d4-4329-4152-9d1d-c221506043db`

### Volumes

| Volume | Destino | Conteúdo |
|---|---|---|
| `qlmed_app_storage` | `/app/storage` (container `qlmed-app`) | XMLs/PDFs de notas (`xml_backup/`, `pdf_backup/`) |
| `qlmed_pgdata` | `/var/lib/postgresql` (container `qlmed-db`) | Dados do PostgreSQL 18 |

### Desenvolvimento

- **Diretório**: `/home/marce/qlmed/app/` (`app-dev` é o alias de
  compatibilidade)
- **Porta dev (npm)**: 3000 (`npm run dev` executa `next dev -p 3000`)
- **Porta dev (Compose)**: 3001 no compose de desenvolvimento; atualmente
  ocupada pelo Uptime Kuma no host, portanto não iniciar essa variante sem
  resolver o conflito de porta.
- **Comando**: `cd /home/marce/qlmed/app && npm run dev`
- **Path alias**: `@/*` → `./src/*`
- **Git state**: `main` atualizado com caminhos `/home/marce/qlmed/...`; stash antigo preservado no branch remoto `codex/preserved-stash-qlmed-20260710`
- **Banco**: mesma instância **e mesmo database** da produção (`postgres`) via bind loopback (`127.0.0.1:5432`) — não há isolamento; ver risco 1

## Dependências

- **Depende de**: PostgreSQL 18 (`qlmed-db`) e Cloudflare Tunnel
- **Quem depende dele**: n8n (webhooks), Evolution API (indiretamente)

## Operações comuns

### Verificar saúde

```bash
curl http://127.0.0.1:13000/api/health
docker logs qlmed-app --tail 50
```

### Rebuild produção

```bash
cd /home/marce/qlmed/production
docker compose --project-name qlmed --env-file .env up -d --build qlmed-app
```

### Dev server

```bash
cd /home/marce/qlmed/app && npm run dev
```

### Database

```bash
cd /home/marce/qlmed/app
npm run db:generate   # prisma generate
npm run db:push       # prisma db push (fluxo padrão em dev até decisão formal de liberar migrate dev)
npm run db:studio     # prisma studio
```

⚠️ Dev **não é isolado**: roda contra o mesmo database `postgres` da produção.
Qualquer `db:push` ou script apontado para `DATABASE_URL` altera o schema/dados
de produção. O script `/home/marce/qlmed/ops/scripts/qlmed-dev-reseed.sh` ainda
existe no disco mas referencia o database removido `qlmed_dev`; não rodar sem
revisar.

### Deploy via GitHub Actions

Deploy por evento: push na `main` → workflow `QLMED CI` → `workflow_run` dispara
`deploy-production.yml` → **aprovação manual** no environment `production` → o
runner self-hosted (`qlmed-prod`) sincroniza, rebuilda, faz health-check
(local + público + revisão) e reverte automaticamente em falha (trap ERR).

### Rollback

- **Automático (intra-deploy)**: em falha, o trap restaura a imagem
  `qlmed-app:rollback-<run_id>` capturada no início do deploy.
- **Manual (pós-deploy)**: a imagem estável `qlmed-app:previous` (re-tagueada a
  cada deploy) é o alvo suportado —
  `QLMED_BUILD_COMMIT_SHA=previous docker compose --project-name qlmed up -d --no-build qlmed-app`.
  Um step do workflow (`Verify manual rollback tag survived`) falha o deploy se
  a tag não sobreviver (já sumiu por prune uma vez — auditoria 2026-07-21).
- **Aposentado**: `npm run rollback:server` / snapshots em `/srv/qlmed/app/releases`
  e `/srv/qlmed/app/backups` — congelados em março/2026, podados para os 3 mais
  recentes; não são alvo de rollback viável (schema divergiu). Rollback de
  imagem não desfaz migração de banco já aplicada.

## Riscos e problemas conhecidos

1. **Dev SEM isolamento — escreve na base de produção** — Existe um único database, `postgres`, compartilhado por dev e produção na mesma instância PostgreSQL. O `qlmed_dev` criado em 2026-07-11 (Fase 2 do server-hardening) **não existe mais** — verificado 2026-08-07, `pg_database` lista apenas `postgres`; a stack migrou para database único. Consequência: não há rede de segurança — um `prisma db push`, um seed ou qualquer script de dev apontado para `DATABASE_URL` altera diretamente schema e dados de produção. Desenvolvimento local contra esse database é permitido apenas com credenciais protegidas, serviços de background desligados e recibo de backup atual (contrato em `/srv/qlmed/app/CLAUDE.md`). A CI usa o serviço PostgreSQL descartável `qlmed_ci`, fora deste host. `prisma db push` continua sendo o fluxo usado em dev; a liberação formal de `prisma migrate dev` como padrão é decisão de um workstream separado (Fase 11 "Unificação de Schema" em `qlmed/app`), ainda não tomada.
2. **xmlContent no banco** — Invoice ainda guarda `xmlContent`, mas desde 2026-07-27 o volume `qlmed_app_storage` tem backfill dos XMLs dos últimos 5 anos (~13.8k arquivos) e o app lê via `resolveInvoiceXmlContent` (arquivo primeiro, fallback DB). Remoção da coluna fica para Phase 11.
3. **UI em português (pt-BR)** — Todo o texto da interface é em português.
4. **Sem component library** — Todos os componentes UI são custom-built. Sem shadcn, Radix ou Material UI.
5. **Puppeteer para PDF** — Requer Chromium no container. A imagem Docker é baseada em Alpine com Chromium instalado.
6. **Login por PIN é padrão da empresa — decisão intencional, NÃO flagar em auditorias** — Todos os 7 usuários autenticam por PIN por decisão explícita do Marcelo ("é um padrão da empresa"). Auditorias de segurança não devem sugerir remover/substituir por senha ou TOTP — apenas proteger: PINs ficam na env var `PIN_MAP_JSON` (movidos do código na Fase 1 do hardening), rate limiting de 5 tentativas/min por IP, tentativas falhas logadas com IP e timestamp.
7. **SEFAZ 656** — Mitigado 2026-07-27 (cooldown 6h+/backoff + timer CT-e 3h). Monitorar SyncLog `sefaz` nos próximos dias.
8. **Tag Docker sem pin de release** — o container atual usa `qlmed-app:local`
   com revisão de label desconhecida (`manual-recovery-realign`), embora o
   health embuta o SHA `804ec333fbca1b66df8a3ac219e16db77c988c55`. Antes de um
   novo deploy ou rollback, reconciliar a tag com uma release aprovada e
   registrar o SHA efetivo.

## Histórico

| Data | Evento |
|---|---|
| 2026-08-07 | v1.16 — Isolamento de dev revertido na descrição: o database `qlmed_dev` (v1.6, 2026-07-11) **não existe mais** — verificado ao vivo, `pg_database` lista só `postgres`. Dev e produção compartilham o mesmo database; risco 1 reescrito para nomear a ausência de rede de segurança. `qlmed-dev-reseed.sh` marcado como quebrado (referencia o database removido). |
| 2026-08-04 | v1.15 — Backups reconciliados: o cron dedicado das 03:00/19:00 UTC não existe mais neste host; a cobertura é o snapshot `server-backup` (04:30) + `server-backup-offsite` (05:10), e `qlmed-pg-backup.sh` fica só como fallback manual. A divergência mantinha a SONDA 4 do silent-watchdog alertando diariamente. |
| 2026-08-03 | v1.14 — Desenvolvimento reconciliado: `npm run dev` usa a porta 3000; a porta 3001 do compose está ocupada pelo Uptime Kuma; removida a instrução inexistente `qldev`. |
| 2026-08-03 | v1.13 — Imagem observada reconciliada: tag `qlmed-app:local` de recuperação manual, com build embutido `804ec333…` mas sem pin Docker; consumidor do outbox continua no cron root NFE/CTE. |
| 2026-07-31 | v1.11 — Compose e raiz de produção unificados em `/srv/qlmed`; PostgreSQL gerenciado pelo projeto `qlmed` com bind loopback direto, sem DB proxy. |
| 2026-07-27 | v1.10 — Anti-656 (env + scheduler), PFX removido do home, outbox suppressed purged, XML backfill storage, CT-e timer 3h. |
| 2026-07-23 | v1.9 — CT-e DistDFe SEFAZ (timer hourly) após stall NSDocs pós-02/07. |
| 2026-07-21 | v1.9 — Auditoria QLMED: compose reduzido a `qlmed-app`+`qlmed-n8n`; rollback via `qlmed-app:previous`; CSP sem `unsafe-eval`. |
| 2026-07-16 | v1.8 — Auditoria de completude: adicionadas seções "Dados e onde ficam" (database `postgres` no qlmed-db, XMLs/PDFs em `qlmed_app_storage`, outbox de notificações, backups 03:00/19:00 UTC → `/srv/backups/qlmed-pg/` + gdrive) e "Agenda e gatilhos"; corrigido volume de pgdata (`lkwc0s0ck8kcckocc4goc0kg_pgdata`, não `qlmed_pgdata` — este não existe no host). |
| 2026-03-25 | Spec criada — QLMED App em produção com Next.js 14 + PostgreSQL 18 |
| 2026-03-25 | v1.1 — docker-compose.yml simplificado. Volumes órfãos qlmed_* removidos (4GB recuperados). |
| 2026-07-06 | v1.2 — revalidação: stack atualizada para **Next.js 15.5** e **Prisma 7.7** (antes documentava Next 14 + "Prisma ORM"); NextAuth confirmado v4. Container `qlmed-app` healthy. |
| 2026-07-10 | v1.3 — Checkout de desenvolvimento movido para `/home/marce/qlmed/app-dev`; `/home/marce/qlmed/dev` permanece como symlink de compatibilidade. |
| 2026-07-10 | v1.4 — Worktree de desenvolvimento limpo; stash antigo preservado no branch remoto `codex/preserved-stash-qlmed-20260710`. |
| 2026-07-11 | v1.5 — Caminhos de deploy e documentação atualizados para `/home/marce/qlmed/...`; container recriado e health check validado. |
| 2026-07-11 | v1.6 — Dev repontado para database isolado `qlmed_dev` (Fase 2 do server-hardening); isolamento provado ao vivo (INSERT em `qlmed_dev`, ausência confirmada em `-d postgres`). Aviso de "banco compartilhado" removido como restrição ativa. |
| 2026-07-13 | v1.7 — Documentado que login por PIN é padrão intencional da empresa (não flagar em auditorias); listadas as proteções vigentes (PIN_MAP_JSON, rate limit, log de tentativas). |
