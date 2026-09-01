---
title: Notas de remediação da auditoria b177b07
status: ativo
date: 2026-09-01
---

# Remediação b177b07 — o que o dono precisa decidir ou saber

O que as folhas encontraram e que **não** se resolve dentro do código: quebras
operacionais, achados novos fora dos 77, residuais deliberados, e decisões que
são do dono e não da engenharia.

## 1. Ordem de deploy — não é opcional

| # | O que quebra se ignorar | Origem | Ação, antes de servir tráfego |
|---|---|---|---|
| 1 | Leitura de TODOS os segredos: emissão de NF-e, sync SEFAZ e sync Receita param. O `decrypt` é fail-closed agora. | L4, FILE-007 | Correr `scripts/migrate-plaintext-secrets.ts` (simula por omissão, grava com `--apply`). |
| 2 | Todo não-admin perde o painel: `allowedPages = []` deixou de significar "todas". | L2, AUTH-005 | Correr `scripts/backfill-allowed-pages.ts` (tem `--dry-run`). |
| 3 | Webhook do n8n devolve 401 em toda chamada. `N8N_WEBHOOK_SECRET` passa de opcional a obrigatório. | L3, INT-001 | Configurar o segredo nos DOIS lados. |
| 4 | Webhook recusa toda chamada por falta da tabela de nonce. | Integração, INT-003 | A migração `20260902130000_n8n_webhook_nonce` tem de estar aplicada antes do código servir. |
| 5 | `scripts/notification-outbox-worker.py`, `ops/scripts/qlmed-cte-dist-sync.js` e o que use `ops/compose/*.env.enc` deixam de autenticar. | L2, AUTH-006 | Emitir linha real em `ApiKey` por `/api/admin/api-keys`, escopo mínimo. |
| 6 | As migrações **falham de propósito** se houver órfão ou duplicata herdada. | Item 1 + L8 | Rodar as queries de pré-checagem no cabeçalho de cada migração. Exige acesso autorizado ao banco. |
| 7 | Planilhas E509 acima de 5 MiB passam a ser recusadas. | L5, FILE-002 | Confirmar que as reais cabem; se não, subir o teto. |

## 2. Achados novos, fora dos 77

Nenhum estava na auditoria original.

### N-001 — Verificação de TLS desligável por variável de ambiente (alto)
`SEFAZ_VERIFY_SSL=false` e `RECEITA_NFSE_VERIFY_SSL=false`
(`src/lib/ssl-verify.ts:14`, `src/lib/receita-nfse-sync.ts:123`,
`src/app/api/receita/nfse/config/route.ts:202`) põem `rejectUnauthorized: false`
no `https.request` que carrega o e-CNPJ A1 como certificado de cliente — e, na
Receita, o Bearer. Quem interceptar apresenta qualquer certificado e recebe os
dois. O comentário no código trata isso como remendo para cadeia ICP-Brasil
incompleta, necessidade real; mas o mecanismo é um interruptor permanente, sem
validade, sem alarme e sem linha de log dizendo que a verificação está desligada.

**Invariante quebrada:** uma credencial só é apresentada a um par cuja
identidade foi verificada criptograficamente. O INT-010 fechou a metade do
*destino* (o host tem de estar na allowlist); esta é a metade da *identidade*, e
são independentes — host fixado com verificação desligada ainda entrega o
certificado a quem atender.

**Correção mínima:** apagar o override e confiar no `sefazCaBundle()`, que já
anexa a raiz ICP-Brasil v10 às CAs do runtime e foi escrito exatamente para o
problema de cadeia que o override existia para contornar. Se a saída de
emergência tiver de sobreviver, que seja barulhenta e estreita: log em `error` a
cada request feito com verificação desligada, e escopo de um host, não do
cliente inteiro.

**Alcançabilidade NÃO verificada.** `docker-compose.yml:12` alimenta a app por
`env_file: .env`, então a variável chegaria ao processo. Se está definida como
`false` em produção, não foi determinado — ler `.env` estava fora do escopo das
folhas. **É a primeira coisa a checar.**

### N-002 — PDF clínico pode ir para o grupo de WhatsApp FISCAL (alto)
O destino resolve por
`IMPCG_WHATSAPP_GROUP_JID ?? NOTIFICATION_WHATSAPP_GROUP ?? QLMED_WHATSAPP_GROUP_JID`.
Com a variável específica ausente e o canal ligado, o ofício com nome de
paciente, matrícula, CRM e procedimento vai para o grupo fiscal. Nada no repo
registra quem está em qualquer um dos grupos.

### N-003 — DELETE no OneDrive é lixeira, não expurgo (médio)
A compensação de órfão do JOB-001 tira o PDF da pasta, mas o OneDrive retém na
lixeira por ~30 dias. Para PHI, retenção não declarada.

## 3. Correções à própria auditoria

| Alegação do relatório | O que é verdade |
|---|---|
| FILE-003: `pdftoppm` sem `-l` | O `-l` **já existia** em `src/lib/cassems/extract-pdf-text.ts:47` em b177b07. O resto do finding (cap de bytes, deadline partilhado) sustenta-se. |

## 4. Armadilhas que a remediação revelou

- **DATA-007 quase criou laço infinito.** Fazer `remaining` contar
  `invoice_item_tax` direto tornaria a métrica honesta e travaria
  `fiscal/dashboard/page-client.tsx:170`, que roda `while (remaining > 0)`: uma
  NF-e cujo XML não produz item ficaria em `remaining` para sempre. Resolvido
  com `invoice_tax_totals.item_count` — NULL = nunca medido, 0 = medido e sem
  item. Honesto **e** terminante.
- **FISCAL-006 tinha uma divergência concreta**, não teórica: `esc()` escapava
  `"` como `&quot;` em nó de texto; C14N 1.0 §2.3 escapa só `&`, `<`, `>` e
  `#xD`. Uma aspa numa descrição de produto (`Cabo 5"`) fazia o nosso SHA-1
  divergir do que a SEFAZ recalcula.
- **Dois testes protegiam o defeito do JOB-004**: exigiam `ok === true` com as
  caixas em 403.
- **Um teste protegia o fallback de texto claro do `decrypt`**, com o nome
  `returns unencrypted text as-is (backward compatibility)`.
- **Espiar `process.stdout.write` não mede nada** com este logger: o pino
  escreve por sonic-boom direto no fd. Qualquer teste que afirme "não aparece no
  stdout" está a medir o vazio.

## 5. Residuais deliberados — 11 caixas abertas, cada uma com motivo

Nenhuma foi esquecida. Cada uma tem linha `ABANDON:` no relatório da folha em
`leaf-reports/`.

| Residual | Por que não fechou | O que quem fechar precisa |
|---|---|---|
| AUTH-008 store partilhado | Rate limit de login continua in-process; store partilhado exige tabela, e o schema era da folha L8 | Migração + testes de concorrência. Com uma réplica, o limite funciona |
| OBS-005 nonce da CSP | Matcher do middleware esbarra na lógica de auth (`/login` entra em loop) e converte 26 páginas estáticas em dinâmicas | Já medido a favor: a app não tem script inline próprio, e o beacon do Cloudflare é externo. Falta o matcher e prova em browser |
| PRIV-002 enum dedicado | `ALTER TYPE ADD VALUE` não roda em transação | O invariante (acesso atribuível) ESTÁ fechado; falta granularidade |
| FILE-005 `--no-sandbox` | Sem Chromium nem Docker para medir o arranque no Alpine | JS e rede já desligados e testados |
| FILE-008 migração do volume | Mover ficheiros gravados é operação de infra | A leitura tem fallback para o caminho antigo |
| OPS-005 imagem N-1 | Exige docker no runner, que o hardening proíbe | O portão expand-only protege a propriedade |
| SUPPLY-002 digest do postgres | Pinar o banco tornaria o próximo `up -d` uma recriação do contentor de dados | O `node:22-alpine` FOI pinado nos três estágios |
| SUPPLY-003 `USER` no Dockerfile | Mudaria posse de volume vivo sem poder medir | `start.sh` já faz `exec su-exec nextjs` |
| SUPPLY-003 `cap_drop` no db | Mudar postura do contentor de banco sem poder reiniciar e observar | — |
| UI-002 laço do backfill | Não existe job; fechar no GET é o risco que o finding aponta | A UI já diz "Cobertura incompleta: N nota(s)" |
| G11 do CASSEMS | Herdado do PR #248, fora deste escopo | Saúde de produção naquele SHA segue sem verificação |

## 6. Decisões que são do dono

1. **`NOTIFICATION_OUTBOX_RETENTION_DAYS`** — a purga existe, está ligada e
   reporta `disabled` no `/api/health` até haver número. Apagar registro de
   notificação fiscal é decisão de retenção. (L6)
2. **Os cinco prazos de retenção** propostos em ADR-0014 (`status: proposed`).
   `src/lib/data-retention.ts` tem o mecanismo, sem default numérico e sem nada
   que o chame. Prazo chutado é perda de dado. (L8)
3. **NFR-001 da SPEC-031** dizia "uma chamada Evolution por autorização, no
   máximo". Com retry durável, um 500 persistente gera várias. (L6)
4. **ADR-0009 supersedindo o ADR-0008** — a execução do sync deixou de estar
   acoplada ao processo web; o lock cobre o run inteiro entre réplicas. (L7)
5. **Retenção de PHI**: `ImpcgSourceMessage`, `CassemsSourceMessage`, as
   autorizações e os PDFs no OneDrive não têm regra no schema. (L6)
6. **Base legal** do envio de nome, matrícula, médico e PDF a um grupo de
   WhatsApp: PRIV-001 está registado como aceito, mas não há documento que a
   nomeie. (L6)
7. **Spec Kit para JOB-003/JOB-004?** `ok`/`lastSuccessAt` e o retry do aviso são
   mudança observável de contrato, tratada aqui como remediação de auditoria.

## 7. Precisa de acesso autorizado ao banco

Marcado pelas folhas como `NEEDS AUTHORIZED LIVE EVIDENCE`:

1. Contagem de órfãos nos satélites — as 16 FKs falham se houver.
2. Divergência real `Float` × `Decimal` em `invoice_duplicata`. A precedência
   corrige a leitura daqui em diante; não mede o estrago acumulado, e essa
   contagem decide se a ordem das fases de migração muda.
3. `SELECT COUNT(*) ... item_count IS NULL`, para dimensionar o reprocessamento
   do backfill no primeiro deploy.
4. Duplicatas de série/número em `Invoice` e `InvoiceEmission` — as uniques do
   item 1 falham se houver.

---

# 8. Re-auditoria adversarial — o que ela achou

Três auditores que **não escreveram nenhuma linha** destas correções. Entre os
três: 9 + 19 achados novos, dois portões de CI furados, e um crítico.

## Corrigido nesta mesma branch

| ID | Sev | O que era |
|---|---|---|
| REAUD-B-01 | **crítico** | A ACL inteira caía com um header inventado. O ramo de passagem por `x-api-key` no middleware devolvia antes do `getToken()`, então um viewer com sessão e `x-api-key: qualquer-lixo` alcançava `/api/financeiro/*`, `/api/fiscal/dashboard`, `/api/customers`, `/api/suppliers` e os PDFs. Anulava AUTH-005, -013 e -014 na prática. |
| REAUD-B-02 | alto | **Nenhum teste invocava `middleware()`.** Dava para apagar o 403 do `canAccessApi`, repor o fail-open de página e remover o portão de `tokenVersion` — suíte verde nos quatro casos. |
| REAUD-B-05 | alto | PHI para o grupo de WhatsApp FISCAL, e **nenhuma folha reclamou o finding**: erro de escopo meu, tirei PRIV-001 inteiro por "aceito pelo dono". O aceito é enviar por WhatsApp; o grupo errado nunca foi. |
| REAUD-FISCAL-012 | alto | `csosn`, `cstIcms` e `orig` interpolados sem `esc()`. A guarda C14N da L8 só apanha escape a mais, não escape em falta. |
| REAUD-FISCAL-013 | alto | O ramo `cStat 217` apagava chave e XML assinado sem CAS — e duas consultas concorrentes produziam duas chaves. **Defeito no meu próprio item 1.** |
| REAUD-FISCAL-014 | médio | Denegada devolvia o número ao pool num caminho e não no outro. |
| Portão de dependências | alto | Lia a severidade do NÓ, não do advisory: um `critical` num nó `moderate` passava. E o teste não tinha caso para advisory novo. **Portão meu.** |
| `deploy-guard.sh` | alto | `//srv/qlmed`, `/srv//qlmed`, `/srv/./qlmed`, relativo e `APP.QLMED.COM.BR` passavam. `pwd -P` sozinho não resolve: o POSIX preserva duas barras iniciais. |

## Aberto — vale uma segunda rodada

| ID | Sev | O que é |
|---|---|---|
| REAUD-B-03 | alto | `xlsx-limits` confia no `uncompressedSize` **declarado pelo atacante**. Provado: `.xlsx` de 306 KB com campos reescritos passa o portão e o exceljs aloca **+461 MB**. |
| REAUD-B-04 | alto | O contador de profundidade do XML é enganado por um atributo legal `b="/>"`. Provado: 300 000 níveis em 4,2 MB, profundidade medida **0**, aceite, **+291 MB** de RSS. |
| REAUD-DATA-014 | alto | `while (remaining > 0)` no dashboard não termina com XML ilegível: a nota nunca grava `item_count` e volta em todos os lotes. |
| REAUD-B-09 | médio | 5 furos no `redact`: `api-error.ts` usa `e.message` como **msg** (o redact não toca a msg), 4 níveis de aninhamento, `err.*` aninhado, chave `raw`, e faltam `apiKey`/`apikey`/`senha`/`keyHash`. |
| REAUD-B-06 | médio | O detector de guardas só verifica que o nome é **citado**. Trocar o `catch` de `/api/users` por `catch {}` expõe e-mails e papéis — suíte verde. |
| REAUD-B-07/08 | médio | `migrate-plaintext-secrets.ts` não cobre `N8nIntegrationConfig.apiToken`, e `looksEncrypted` só conta `:` — um segredo em claro com 2 `:` é pulado em silêncio e fica ilegível após o fail-closed. |
| REAUD-B-10 | médio | O `fetch` do n8n segue redirect com `X-N8N-API-KEY`. A L3 corrigiu a Evolution e deixou este. |
| REAUD-B-11 | médio | O backfill de `allowedPages` concede **`ALL_PAGES`** a todo não-admin do acervo, incluindo `/sistema/usuarios`. |
| REAUD-FISCAL-015 | médio | O ramo de evento descarta o retorno de `applyNfeCancellation`; um cancelamento perdido não trava o cursor. |
| REAUD-DATA-015 | médio | O P2002 do unique novo congela o cursor de sync **para sempre**: a ingestão fiscal da empresa para até intervenção. |
| Gate do UI-003 | médio | Fica **verde com o defeito reposto**: o regex positivo é satisfeito pela própria linha comentada. |
| REAUD-FISCAL-016 | baixo | O índice parcial deixa passar `series NULL`, e a pré-checagem do cabeçalho **sobre-reporta**. |
| REAUD-B-12..19 | baixo | Postgres sem digest nem `cap_drop`/`no-new-privileges`; `data:` permitido no Chromium; latência do banco no ramo 503; `/r/[deliveryId]` fora do matcher; custo de bcrypt no login; `catch` do jwt devolve token velho; cabeçalho do gate da L4 contradiz o corpo. |

## O que a re-auditoria confirmou que se sustenta

- 14 controlos positivos refeitos independentemente nas 8 folhas, todos vermelhos.
- 29 migrações replayadas do zero num Postgres descartável, `No difference detected`.
- `logger-redact.test.ts` usa o método certo (stream de memória com as opções
  reais), e **nenhum** teste espia `process.stdout.write`.
- Nenhum `.only`, nenhum `.todo`, nenhum teste afrouxado para acomodar defeito.
- Os 4 testes de render montam componentes de verdade.
- `/api/users/me` é exceção estreita e correta — "a parte melhor feita do lote".

## Contradição entre folhas, registada

L2 recusou o FILE-008 alegando que quebraria o leitor do `local-xml-sync`. **A
alegação é falsa**: `sync-scheduler.ts` só escreve, não lê o layout do store. A
L5 fez a mudança. Duas folhas chegaram a vereditos opostos sobre o mesmo achado
e ambas foram dadas por concluídas.

---

# 9. Segunda rodada — os achados abertos, em cinco folhas paralelas

Despachadas a partir de `1ad4007` (base já mesclada com `main`), cada uma em
ficheiros disjuntos, com gates próprios e controlo positivo obrigatório.

| Folha | Achados | Superfície |
|---|---|---|
| R1 | FISCAL-015, TEST-002, DATA-015, FISCAL-016 | `sefaz.ts`, `nfe-cancellation.ts`, migração nova |
| R2 | DATA-014 (= Codex P1 #3), TEST-001 | `backfill-tax/route.ts`, dashboard `page-client.tsx` |
| R3 | B-07, B-08 (= Codex P1 #4), B-10, B-11 | `migrate-plaintext-secrets.ts`, `n8n-client.ts`, `backfill-allowed-pages.ts` |
| R4 | B-06, B-14, B-15, B-16, B-17 | `auth-options.ts`, `health/route.ts`, `/r/[deliveryId]`, `api-route-guards.test.ts` |
| R5 | gate UI-003, L5/G14c, Codex P2 #5, B-12, B-13, B-18, B-19, SECRET_ARG | compose, `render.ts`, `ssl-verify.ts`, outbox purge, `deploy-manifests.test.ts` |

Os dois P1 do Codex no PR #252 coincidem com REAUD-DATA-014 e REAUD-B-08, que
a re-auditoria já tinha em aberto. As respostas nas threads saem depois de a
correção estar na branch, não antes.

**2026-09-01 — CI verde no PR #252** (run 33570778984, head `1ad4007` + docs):
23/23 passos do job `app`, com replay das migrações e testes de integração com
banco. Primeiro veredito de CI sobre as oito correções da re-auditoria. O
despacho de eventos `pull_request` só voltou com um PR novo; o #250 ficou sem
check suite do Actions em nove commits seguidos.

**R2 integrada** (`20988be`): DATA-014 fechado nas duas metades — nota
ilegível grava `item_count = -1` e o cliente para em 500 voltas ou sem
progresso; TEST-001 reescrito com store em memória e caso que rejeita. Sonda de
8 chamadas com nota truncada: `[1,1,1,1,1,1,1,1]` → `[0,0,0,0,0,0,0,0]`. Thread
P1 #3 do Codex respondida e resolvida.

**R3 integrada** (`3fb34e5`): B-08 — `looksEncrypted` deixou de contar `:`;
agora exige a forma hex real e prova com `decrypt()`, e o que não abre vai para
`failed`, nunca é pulado. B-07 — `n8nIntegrationConfig.apiToken` entra na lista,
e a leitura cruzada dos 14 call sites de `decrypt()` fecha em 6 colunas, todas
cobertas. B-10 — `redirect: 'error'` no fetch do n8n. B-11 — o backfill de
`allowedPages` filtra `active`, exige `--created-before`, e exclui `/sistema/*`
por omissão. Thread P1 #4 do Codex respondida e resolvida.

**R1 integrada** (`701bf76`): FISCAL-015 — `applyNfeCancellation` ganhou
tri-estado (`not-a-cancellation | applied | lost`) e só `lost` trava o cursor;
nota já cancelada conta como `applied`, senão a reentrega idempotente travava
para sempre. TEST-002 — o teste selador saiu, e a prova do auditor entrou de
ponta a ponta (`procEventoNFe` 110111/135 real): cursor `…009`, não `…010`.
DATA-015 — P2002 no upsert vai com o XML para a tabela nova
`SyncSkippedDocument` (unique por chave), e o cursor avança em `partial`; se a
escrita durável falhar, o cursor não avança. FISCAL-016 — migração nova troca o
índice parcial por `COALESCE("series",'')` e alinha a pré-checagem; medido no
Postgres descartável: com o índice antigo, série NULL + número 77 entrava duas
vezes; com o novo, `duplicate key`. 1234 testes.

**Ordem de deploy, item 8 (novo):** a migração `20260903140100_sync_skipped_document`
tem de estar aplicada antes do código novo servir — sem a tabela a escrita
durável falha e o cursor de sync não avança, por desenho.

**R4 integrada** (`d4dc2ef`): B-06 — 24 negativos HTTP reais nos 15 handlers
sob `/api/users`, `/api/admin` e `/api/integrations`, com o guarda real; o
`catch {}` vazio em `GET /api/users` passa a dar `expected 200 to be 401`.
B-17 — o `catch` do callback `jwt` devolve `{}` como no mismatch; um piscar do
banco agora expulsa as sessões de página, igual ao que a API já fazia. B-14 —
`latencyMs` só autenticado também no 503. B-15 — limite dedicado de 30/min em
`/r/[deliveryId]`, sem tocar no matcher. B-16 parcial, com número: 185 ms por
`bcrypt.compare` a custo 12; `loginGlobal` 120 → 20, o que dá 37 s de CPU/min
com 10 utilizadores e satura a partir de ~16 — acima disso é preciso baixar
outra vez ou trocar por bcrypt nativo. 1265 testes; `middleware-acl` 6/6.

**R5 integrada** (`1516e8d`): gate do UI-003 deixou de ser regex de fonte —
`netQty` saiu para `valvulas-importadas-row.ts` e o teste prova
`purchased − sold` com os códigos do mapa antigo (repondo o mapa: `expected 17
to be 44`). L5/G14c ganhou teste que espia `Buffer.from` (0 chamadas acima do
cap; sem o teto, 22,7 s a decodificar 14 MB). Codex P2 #5 — o purge passa
`heartbeatIntervalMs` de 24 h. B-13 — `data:` abortado no Chromium. B-18 — o
interruptor de TLS fica, mas loga `error` por request com o host, e a Receita
passa a usar o `sefazCaBundle()`; `.env.example` diz "não desligue". B-12 —
`no-new-privileges` e `cap_drop: [ALL]` nos dois Postgres, com o conjunto
mínimo medido em container (`DAC_OVERRIDE` é obrigatório sobre dados
existentes); `QLMED-RISK-2026-09-PG-DIGEST` em *Active risk acceptance*.
`mem_limit` não adicionado de propósito. SECRET_ARG alargado com 6 negativos.
1291 testes.

**Segunda rodada fechada.** Dos 20 achados abertos após a re-auditoria, 19
fechados e 1 parcial com número (B-16, custo de bcrypt). As três threads do
Codex respondidas e resolvidas.
