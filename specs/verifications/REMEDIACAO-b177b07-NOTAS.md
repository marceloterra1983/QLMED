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

**CI reprovou uma vez após a segunda rodada — e a causa era um teste, não o
código.** `graph-mail-attachment-cap.test.ts` (L5/G14c, R5) afirmava "zero
`Buffer.from(_, 'base64')` em todo o processo"; sob Node 22 uma internal de
`fetch`/`Response` faz um decode que o Node 24 não faz, e o CI corre 22. O
teto em produção estava certo (o anexo grande faz `continue` antes do
`Buffer.from`). O teste passa a medir o invariante certo: `Buffer.from` nunca
recebe o `contentBytes` DESTE anexo. Controlo positivo com o teto neutralizado:
`2 failed`. Lição registada: um spy global sobre uma primitiva do runtime mede
o runtime, não o código.

---

# 10. Deploy — primeira tentativa, 2026-09-02

Pré-checagens do passo 6 **limpas** em produção (0 duplicatas de emissão; 0
duplicatas em 18.006 NF-e emitidas sob `COALESCE`; 16 contagens de órfãos a
zero). Passo 2 é no-op (0 utilizadores com `allowedPages` vazia). Passo 3: o
webhook do n8n tem **zero** chamadas em 48 h — o segredo pode ser configurado
depois sem quebrar nada vivo. Passo 5 feito **sem downtime**: duas chaves de
escopo mínimo para o outbox (hash conferido contra `ApiKey`, `smoke http=200`
no app antigo, `401` sem chave) e uma chave `admin` nomeada para o sync de
CT-e (`/api/invoices/upload` exige `editor`, que por chave só `admin` alcança —
estreitar é PR à parte).

`pg_dump -Fc` fresco (`pre-remediacao-20260902T120020Z-1cc2837.dump`, 286
objectos) e os 2 segredos cifrados às 12:00:20Z. Dispatch do workflow
fail-closed. **Falhou duas vezes, nenhuma por código:**

1. O `main` moveu-se entre dispatch e aprovação (10 min de espera humana) e o
   portão de revisão recusou — por desenho. Resolvido com dispatch+aprovação
   no mesmo script, gap de segundos.
2. `npm ci` dentro do `docker build` deu `ETIMEDOUT` no runner de produção;
   rollback automático recriou a imagem antiga. Transitório: `npm ping` de um
   container efémero passa; os 3 runners de CI tinham acabado de reiniciar.

A porta de sentido único custou **um** tick da Receita (`Unparsed DER` às
12:22Z — a imagem antiga a ler o PFX cifrado). Como o caminho para a frente
não era de minutos, **fechei a porta**: os 2 segredos foram decifrados de
volta com verificação de round-trip; a simulação oficial volta a dizer "1 a
cifrar". Produção está no estado exacto das 12:00.

O que o timeout escondia: `scripts/verify-production-migration-window.cjs`
pinava **uma** migração (`20260831230000`, SHA fixo) e recusava qualquer outra
pendente. Com 7 novas, todo deploy desta remediação morreria em `verify
before`. Reescrito para um conjunto pinado (âncora + 7, cada uma com SHA-256);
o teste ganha o caso das 7 e o controlo positivo de que uma intrusa reprova
com 78. A migração de fevereiro `20260220120000` tem uma linha falhada E uma
bem-sucedida 30 s depois: o Prisma e o verificador leem a segunda — não
bloqueia (`prisma migrate status`: exactamente as 7 pendentes).

# 11. Deploy — segunda tentativa: as migrações entraram, o app voltou atrás

Dispatch e aprovação no mesmo script (12:37:18Z → 12:37:22Z). O workflow passou
todos os portões, construiu, parou o app, **aplicou as 7 migrações**
(`SyncSkippedDocument` e `N8nWebhookNonce` existem; índice parcial com
`COALESCE`; `verify after` com contagens iguais), subiu o app novo saudável —
e falhou em "Verify deployed revision": o passo fazia `curl` **anónimo** ao
`/api/health` e procurava `commitSha`, que o OBS-003 (L4) deixou de expor sem
sessão. `got missing` em 30 tentativas → rollback automático para a imagem
antiga. **Causa: a remediação colidiu com o próprio workflow de deploy**, e
nenhuma folha nem a re-auditoria leu `deploy-production.yml` contra
`health/route.ts`.

Estado depois: imagem antiga + schema novo + segredos cifrados. As migrações
são expand-only e a imagem antiga corre sobre elas sem um erro de schema
(medido: 0). Os segredos, não — porta fechada pela segunda vez com o script
de reversão; PFX de volta a 9.205 bytes DER.

Correção: o passo passa a verificar pela **imagem em execução**, localmente
(id e tag), sem depender do health público. O env `QLMED_BUILD_COMMIT_SHA` não
serve para isso: o container restaurado pelo rollback tinha o SHA novo no env
e a imagem antiga a correr.

Achado lateral: o container lê `env/app.env` (via `env_file`), não
`production/.env`. A chave do sync de CT-e tinha ido para o ficheiro errado;
movida, hash conferido, `production/.env` restaurado do backup.

# 12. Deploy — terceira tentativa: **implantado**

Run `33632646108`, 22 passos, nenhum falhou. Produção em
`qlmed-app:4de2be85`, saudável desde 12:58:19Z. Porta dos segredos aberta
das 12:55:07Z às 12:58:19Z (~3 min): cifra → dispatch (2 s) → aprovação (8 s)
→ build → parar → migrar (0 pendentes: as 7 já tinham entrado na segunda
tentativa) → subir → revisão verificada **pela imagem** → público → worker.

Verificação pós-deploy, medida: imagem com o SHA esperado; health 200 local e
público, **sem `commitSha` sem sessão** (OBS-003 em produção); 7 migrações no
banco, `SyncSkippedDocument` e `N8nWebhookNonce` existem, índice parcial com
`COALESCE`; o app novo lê o PFX cifrado (0 erros desde o arranque); chaves do
outbox `200` com chave e `401` sem; a chave do CT-e no container é a nomeada
`cte-dist-sync`; chave `Legacy env {admin}` **revogada**.

## Baixas, contadas

| Quando | O quê | Porta |
|---|---|---|
| 12:17Z | `qlmed-cte-dist-sync.timer` falhou (`Unparsed DER`) — imagem antiga a ler o PFX cifrado | 1.ª |
| 12:22Z | um tick da Receita NFS-e (`Unparsed DER`) | 1.ª |
| 12:55–12:58Z | sem evidência de custo nos logs que sobreviveram (o container antigo foi recriado) | 3.ª |

Os ticks do outbox durante a janela viram `Broken pipe`/`Connection reset`
(app parado) — transitório; o primeiro smoke depois do deploy deu `200` nas
duas chaves.

## Propriedade nova, permanente

**Rollback por imagem agora quebra os segredos.** A imagem antiga não lê
`pfxData` cifrado. Reverter exige `undo-secrets.sh` (decifra os 2 segredos
com verificação de round-trip) ou fix-forward. O `qlmed-app:previous` deixou
de ser uma saída limpa.

## O que fica para o dono

1. `N8N_WEBHOOK_SECRET` nos dois lados — o n8n está parado (0 chamadas em
   48 h), nada quebrou; o webhook devolve 401 até lá. **Continua aberto**, e
   §18 mostra por que não urge: nenhum workflow chama a rota.
2. Estreitar a chave do CT-e: `/api/invoices/upload` exige `editor`, que por
   chave só `admin` alcança. Aceitar um escopo (`invoices:write`) é um PR.
   **Feito em §14.**
3. `NOTIFICATION_OUTBOX_RETENTION_DAYS` — a purga está ligada e reporta
   `disabled` no health até haver um número. **Feito em §17: 90 dias.**
4. Planilhas E509 acima de 5 MiB passam a ser recusadas — confirmar com as
   reais. **Medido em §20**: o teto sobe para 10 MiB, e a leitura passa a ser
   em streaming porque o caminho antigo já morria aos 5.

# 13. Pós-deploy: o quinto leitor de `pfxData`

O primeiro run horário do sync de CT-e no código novo (13:17Z) falhou com
`Unparsed DER bytes remain… byteCount: 9258, remaining: 9180` — 9205 de PFX +
53 de envelope `QLMEDPFX1`. `ops/scripts/qlmed-cte-dist-sync.js` corre
**dentro** do container mas é um JS fora de `src/`, lê `pfxData` cru do banco
e entrega-o ao node-forge. A folha L4 (escopo `src/`) e a leitura cruzada da
R3 (call sites de `decrypt()` em `src/`) não o viram. Foi o único leitor
externo: `git grep` no repo e `grep -r` em `ops/`, `production/`, `/srv` só
encontram este. Ingestão de CT-e parada desde 12:17Z (primeira porta) até este
fix.

Correção: port byte a byte do `decryptPfx` (mesmo layout, mesmo scrypt, AAD =
CNPJ da empresa via JOIN em `Company`), DER cru continua aceite. Teste
`scripts/test-cte-sync-pfx.cjs` cifra como o app e prova o round-trip, o AAD e
o fallback; controlo positivo com o decrypt desligado → vermelho.

O timer corre a cópia em `/home/marce/qlmed/ops/scripts/`, um checkout noutra
branch e com árvore suja: actualizar é escrever o ficheiro a partir de
`origin/main`, não trocar branch.

# 14. Chave do CT-e: de `admin` a `invoices:write` (PR #269)

Item 2 do §12, fechado. `/api/invoices/upload` exigia `editor`, papel que por
chave de API só `admin` alcança — o sync de CT-e andava com uma chave que
podia tudo, incluindo emitir. `requireRole` (e por herança `requireEditor` e
`requireAdmin`) passou a aceitar `apiKeyScope`: a chave cumpre o papel da rota
quando traz o escopo nomeado; a sessão continua a valer pelo papel.

Trocar uma chave viva **não** é um `compose up` à mão. É um segundo dispatch
do mesmo SHA, e a ordem importa:

| Passo | O quê | Evidência |
|---|---|---|
| deploy 1 | `eb99705f` (contém o #269), env intacto | run `33654558844` |
| chave | gerar `cte-dist-sync (invoices:write)` e provar no app **já a correr**; aborta e auto-revoga se der 401/403 | upload sem 401/403 |
| env | escrever em `env/app.env` — o ficheiro que o container lê | hash da chave no container |
| deploy 2 | mesmo SHA, recria o container | run `33654908907` |
| prova | run manual do sync + `AccessLog` com `scope=invoices:write` | `cert_loaded`, `done` |
| revogar | só então a `admin` | 16:28:17Z |

Regra que sai daqui: **prova antes de revogar, e a prova é o consumidor real
a autenticar**, não um `curl` meu com a chave nova.

# 15. Chave do n8n: de `admin` a `{invoices:read, contacts:read}` (PR #272)

Ao revogar a `Legacy env {admin}` no §12 enumerei consumidores por crons,
timers e scripts — **não por todos os `env_file` do compose**. O container do
n8n carregava-a em `env/n8n.env`. Reactivei-a às 16:44Z ao descobrir; não
houve dano porque o único workflow que a usa corre uma vez por dia e a janela
não o apanhou. Sorte, não método.

A sequência do §14 aplicada de novo, com uma diferença: as duas rotas que o
n8n lê (`GET /api/invoices`, `GET /api/contacts/nickname/batch`) usavam
`requireAuth()` sem escopo, o que por chave significa `admin`. Passaram a
pedir `invoices:read` e `contacts:read`. Os dois `catch` colapsavam qualquer
erro de auth em 401; agora `FORBIDDEN` devolve 403, como em
`invoices/upload`. Mesclado em `36734f59`, deploy run `33664957768`.

**O portão do audit bloqueou o PR e a causa era o próprio `overrides`.** Quatro
GHSA `high` em `fast-uri` via `ajv`, com `npm audit fix` inerte: o
`package.json` pinava `"fast-uri": "3.1.5"`, exactamente a versão vulnerável.
3.1.7 é a maior 3.x corrigida (4.x é major). Um override que pina versão exacta
é uma dispensa silenciosa que ninguém revalida — ao contrário da dispensa
nominal do `mysql2`, que tem motivo e data de validade no verificador.

# 16. Os quatro ficheiros de ambiente do n8n viraram dois (PR #274, #276)

`env/` acumulava seis ficheiros do n8n, três com cara de backup. Dois deles
eram configuração viva, carregada pelo `env_file` do `qlmed-n8n`:

| Ficheiro | O que só ele tinha | Destino |
|---|---|---|
| `n8n-restored.env` | `DB_POSTGRESDB_*`, `DB_TYPE`, `N8N_ENCRYPTION_KEY` | consolidado, PR #274, `2992711c` |
| `n8n-legacy.env` | 14 de 23 vars, entre elas `N8N_INTERNAL_API_KEY` | consolidado, PR #276, `97670ed2` |

O nome mentia sobre o conteúdo: apagar o `n8n-restored.env` teria tirado ao
n8n a ligação ao banco e a chave que decifra as suas nove credenciais. As
outras nove variáveis do `n8n-legacy.env` já eram sobrepostas pelos ficheiros
seguintes — ordem do `env_file`, o último ganha —, portanto mortas em vida.

O `n8n-legacy.env` tinha um segundo leitor fora do compose: o script e a unit
do `qlmed-daily-summary-catchup`, que lê `N8N_INTERNAL_API_KEY` dele. Ambos
passaram a apontar para `n8n.env`. A unit viva é symlink para o checkout `app`,
que está noutra branch: um drop-in em `/etc/systemd/system/…/.d/` cobre até
essa sessão rebasear.

Depois, poda: das 37 variáveis do `n8n.env` consolidado, 11 não existem no
código do n8n 2.29, não aparecem em nenhum workflow ou credencial, e ninguém
no repo as lê — `N8N_BASIC_AUTH_*` (removido no n8n 1.0), `N8N_TRUST_PROXY`,
`N8N_TRUSTED_HOSTS`, `N8N_WEBHOOK_URL`, `N8N_ALLOW_EXEC`, `EVOLUTION_API_KEY`,
e três de outros projectos (`CHARLIE_ROOT`, `HA_TOKEN`,
`HERMES_API_SERVER_KEY`). Ficaram 26. Container recriado, `/healthz` 200, dois
workflows activos e nove credenciais legíveis.

Também destruídos, depois de provar que a chave viva era outra: seis backups
`*.bak*`/`*.pre-*` de `app.env` e dos env do n8n — três deles duplicavam em
claro os segredos do app. `env/` tem hoje quatro ficheiros:
`app.env`, `n8n.env`, `n8n-automation.env`, `n8n-db.env`.

# 17. Retenção do outbox: 90 dias (item 3 do §12)

Decisão do dono, tomada: `NOTIFICATION_OUTBOX_RETENTION_DAYS=90` em
`env/app.env`, aplicado por dispatch do mesmo SHA (`e6eba6ff`, run
`33680732451`). O container confirma o valor; a purga arranca 20 s depois do
boot e corre de 24 em 24 h. O `/api/health` anónimo não expõe
`backgroundServices` — para ver `enabled` é preciso sessão.

# 18. A prova que faltava: o n8n não lê a chave do `n8n.env`

Depois de trocar o env, recriar o container e conferir o hash da chave lá
dentro, o run diário falhou. Três medidas erradas de uma vez:

1. **O fuso.** `GENERIC_TIMEZONE` é `America/Sao_Paulo`, mas o workflow tem
   fuso próprio nas suas `settings`: `America/Campo_Grande`. O cron `0 18`
   dispara às **22:00Z**, não às 21:00Z. Esperei a prova na hora errada.
2. **A chave.** Os nós HTTP autenticam com a credencial `QLMED API Key`
   (`Wcv8Zu5yGMpyzEBN`, `httpHeaderAuth`), guardada **cifrada no banco do
   n8n**. O `QLMED_API_KEY` do `n8n.env` é decorativo para esse workflow. A
   credencial continuava com a `Legacy env`, revogada às 18:08:39Z → 401.
   A minha própria tabela de uso dizia `QLMED_API_KEY  wf=0` e eu não a li.
3. **O `AccessLog` só regista sucessos.** "Zero linhas da chave nova" era
   compatível com "correu e foi recusado", e eu li como "não correu".

Rodar chave de um consumidor n8n é: `n8n export:credentials --id=… --decrypted`
dentro do container, trocar só `data.value`, `n8n import:credentials` (mesmo id
sobrescreve), reexportar e comparar hashes. Feito às 22:22Z.

Prova, enfim: execução `46169` **success** às 22:26:32Z, disparada pelo
catchup, com `scope=invoices:read` e `scope=contacts:read` no `AccessLog` pela
chave `n8n-resumo-diario`. Custo do erro: dois runs falhados (22:00Z e 22:11Z)
e os alertas que o workflow de erro mandou por WhatsApp.

Aproveitando a leitura dos workflows: **nenhum chama
`POST /api/webhooks/n8n`**. O `N8N_WEBHOOK_SECRET` do §12 fica aberto sem
custo — a rota está fail-closed e não há produtor a recusar. Quando houver,
o segredo entra nos dois lados e o produtor manda `x-qlmed-timestamp`,
`x-qlmed-nonce` e `x-qlmed-signature` (HMAC-SHA256 de
`timestamp.nonce.corpo`), como descreve `docs/architecture/integrations.md`.

Estado final das chaves — quatro activas, uma por consumidor, **nenhuma
`admin`**:

| Chave | Escopos |
|---|---|
| `outbox-worker-nfe` | `notifications:dispatch`, `notifications:assets` |
| `outbox-worker-cte` | `notifications:dispatch`, `notifications:assets` |
| `cte-dist-sync` | `invoices:write` |
| `n8n-resumo-diario` | `invoices:read`, `contacts:read` |

Revogadas hoje: `cte-dist-sync (admin)` 16:28:17Z, `notification-outbox-worker`
(parada desde 28/07, superada pelas chaves por tipo) 17:31:55Z, `Legacy env`
18:08:39Z.

# 19. Armadilhas desta sessão

**Um verificador que revoga não é um verificador.** O
`verify-post-deploy.sh` nasceu no §12 com "revogar a chave legacy" no último
passo. Reutilizei-o em quatro deploys sem reler o fim, e ele revogou a
`Legacy env` 90 s antes de o n8n receber a chave nova — desfez sozinho a ordem
"revogar só depois da prova". Verificação é leitura; revogação é script
próprio, com prova. Antes de reutilizar um script de sessão:
`grep -n "update\|delete\|shred\|rm "`.

**Um filtro no meio do pipe engole o erro.** O script de dispatch passava a
saída do migrate por `| grep -E "cifrad|…"` sob `pipefail`: o erro real não
casava, o `grep` saía 1, o `set -e` matava tudo **sem imprimir nada**. Dois
"dispatch falhou" mudos. Capturar em ficheiro, testar o código de saída,
mascarar só depois.

**`npm ci` num worktree novo não gera o cliente do Prisma.** `MODULE_NOT_FOUND`
em `@prisma/client/default.js` na primeira linha de qualquer script `tsx`.
`npx prisma generate` faz parte de preparar o worktree.

**`docker compose` corrido do symlink inventa outro projecto.**
`production/` aponta para `/srv/qlmed`; a partir de lá o compose resolve o
projecto como `production` e tenta **criar** `qlmed-db` e `qlmed-n8n-db` — falha
por conflito de nome, felizmente sem tocar em nada. Recriar um serviço é sempre
a invocação do workflow: `--project-name qlmed --env-file production/.env -f
production/docker-compose.yml`, com `.deploy-meta.env` carregado.

**Sonda sem controlo positivo mata variáveis vivas.** A primeira varredura do
`n8n.env` contra o código do n8n deu 0 para tudo, inclusive `N8N_PORT` — o
`find` não seguia os symlinks dos pacotes. Sem o controlo positivo eu teria
concluído "37 variáveis mortas". Toda sonda que responde "não existe" precisa
de um caso que **tem** de responder "existe".

**Merge no `main` cancela o CI do commit anterior.** `concurrency` com
`cancel-in-progress`: o run do meu merge apareceu `cancelled` porque outro PR
entrou 9 s depois. Esperar CI é esperar pelo `origin/main` do momento, não pelo
commit de merge do meu PR.

# 20. Planilhas E509: o teto era o menor dos problemas

Item 4 do §12. Não há planilha E509 real nesta máquina nem no banco — a tabela
`stock_entry` está vazia, nunca houve importação —, então medi por construção,
com a biblioteca da rota e o formato que ela exige: 84 colunas, cabeçalho na
linha 3, dados da 5, campos com o comprimento real (chave de 44, descrição de
produto, lote, decimais).

| Linhas (lotes) | Ficheiro | Bytes/linha | Descomprimido | Razão |
|---|---|---|---|---|
| 700 (um mês) | 0,17 MiB | 253 | 1,8 MiB | 10,7 |
| 8 400 (um ano) | 1,97 MiB | 246 | 21,7 MiB | 11,0 |
| 21 000 | 5,08 MiB | 249 | 55 MiB | 11,1 |
| 42 000 | 10,19 MiB | 249 | 110 MiB | 11,1 |

Ancorado no volume real: 21 216 notas, 3,5 itens por nota, ~200 notas/mês. Uma
exportação mensal dá ~700 linhas; a anual, ~8 400. O teto de 5 MiB equivalia a
21 000 lotes, folga de 30× para o mês.

**Mas o teto não era o portão que mordia primeiro.** O app corre com
`--max-old-space-size=512`. Medido com esse heap, `workbook.xlsx.load()`:

| Linhas | Ficheiro | Heap usado | Desfecho |
|---|---|---|---|
| 5 000 | 1,20 MiB | 209 MiB | passa |
| 8 400 | 2,01 MiB | 281 MiB | passa |
| 12 000 | 2,89 MiB | 378 MiB | passa |
| 16 000 | 3,86 MiB | 440 MiB | passa |
| 21 000 | 5,08 MiB | ~690 MiB | **OOM, processo morto** |

São ~130 MiB de heap por MiB de .xlsx. Ou seja: a rota **aceitava um ficheiro
que o runtime não conseguia abrir** — o guarda de 5 MiB deixava passar a
planilha que matava o processo, e não com um 413, com um `FATAL ERROR` do V8.
Subir o teto para 10 MiB sem mais nada teria tornado a queda mais fácil de
alcançar, não mais difícil.

Correção: a rota E509 lê por `ExcelJS.stream.xlsx.WorkbookReader`, uma linha de
cada vez. Medido no mesmo heap de 512 MiB: 95 MiB de pico para o ficheiro de
5 MiB **e** para o de 10 MiB — o custo passa a ser o da linha, não o do
ficheiro. Com isso `MAX_XLSX_BYTES` sobe para 10 MiB.

A rota `products/import-types` foi convertida no mesmo PR: o formato dela é
lido em sequência (cabeçalho `Código` nas dez primeiras linhas, depois linhas
de grupo e de produto), então o streaming só precisou de guardar essas dez
primeiras — um ficheiro sem cabeçalho continua a ser lido desde a primeira
linha, como antes. As duas rotas partilham o teto de 10 MiB.

Uma correcção sobre o próprio §20: o `assertSafeXlsx` **não** era o problema de
memória, e tirá-lo do caminho foi erro meu. Ele infla cada entrada por um
stream com orçamento — o pico é um chunk, não a entrada. Quem estourava o heap
era o `workbook.xlsx.load()`. O guarda voltou, agora antes do leitor, e o
ficheiro comprimido (no máximo 10 MiB) fica em memória para servir os dois.
Sem ele, um zip-bomb passaria a depender só do cap de linhas.

O teste guarda as duas metades: o endereçamento das células (0-based, como o
`getCell(r+1, c+1)` de antes) e o custo de memória. Controlo positivo com o
caminho antigo por baixo do mesmo teste: 332 MiB para 8 mil linhas, vermelho.
