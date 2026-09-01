# Gates: R5 — infra, Chromium, portões de teste e outbox

Base: `origin/audit/remediacao-b177b07` @ ab006dc (1ad4007 é ancestral) ·
branch `fix/reaudit-r5`.

Baseline medido antes de qualquer edição (`npm test`, 2026-09-01 20:25):

```
Test Files  141 passed | 4 skipped (145)
     Tests  1191 passed | 9 skipped (1200)
```

Regra desta folha: cada correção tem controlo positivo — reverter a correção
por cópia de backup (nunca `git checkout`), confirmar VERMELHO, restaurar,
registar a saída exata. `EVIDENCE:` só com saída medida.

---

- [x] **G1 — Gate do UI-003 vira teste de comportamento**
  O portão em `deploy-manifests.test.ts:232-247` lia o fonte com regex e
  ficava verde com `FIXED_STOCK[p.code] !== undefined ? … : 0` (ternário
  escapa ao `??`, identificador diferente escapa ao `REAL_STOCK`, linha
  comentada satisfaz o positivo, e o "controlo positivo" comparava um literal
  do próprio teste). A linha que calcula `netQty` saiu do `route.ts` para
  `src/lib/valvulas-importadas-row.ts` (`toProductRow`), e o teste prova com
  dados que `netQty === purchased − sold` para `'005032'`, `'005033'` e
  `'005029'` — três códigos do mapa antigo, com os valores que ele devolvia.
  CHECK: npx vitest run src/lib/__tests__/valvulas-importadas-row.test.ts 2>&1 | grep -E "Tests|FAIL" | tail -2
  EXPECT: `Tests N passed`, 0 failed; o bloco regex do UI-003 saiu de `deploy-manifests.test.ts`
  EVIDENCE: `Tests 6 passed (6)`; `grep -c "QLMED-UI-003 — relatório de válvulas sem estoque cravado" deploy-manifests.test.ts` = 0 (o bloco foi substituído por um comentário de encaminhamento).
  CTRL+: repor um mapa cravado `{ '005032': 17, … }` na função → VERMELHO.
  EVIDENCE-CTRL+: com `FIXED_STOCK[p.code] !== undefined ? FIXED_STOCK[p.code] : round2(…)` reposto por sed:
  `× 005032: saldo vem da conta, não da contagem de fev/2026 (17)` — `AssertionError: expected 17 to be 44`;
  `× 005033 … (20)` — `expected 20 to be 47`; `× 005029 … (21)` — `expected 21 to be 48`;
  `Tests 3 failed | 3 passed (6)`; restaurado por `cp`, `cmp` = `RESTORED-OK`.

- [x] **G2 — L5/G14c: teto do anexo do Graph exercitado por teste**
  `graph-mail-client.ts:245-247` recusa pelo comprimento do base64 antes de
  `Buffer.from`. Nenhum teste chegava lá. `graph-mail-attachment-cap.test.ts`
  espia `Buffer.from` e prova que um anexo cujo base64 implica > `MAX_PDF_BYTES`
  é descartado sem NENHUMA chamada `Buffer.from(_, 'base64')`, que o anexo
  pequeno é decodificado (controlo do próprio teste), e que o grande não
  contamina o pequeno na mesma mensagem.
  CHECK: npx vitest run src/lib/__tests__/graph-mail-attachment-cap.test.ts 2>&1 | grep -E "Tests|FAIL" | tail -2
  EXPECT: `Tests N passed`, 0 failed
  EVIDENCE: `Tests 3 passed (3)`; `warn` recebeu `{ name: 'grande.pdf', approxBytes > 10485760, limit: 10485760 }, 'attachment_too_large'`.
  CTRL+: neutralizar o `if (approxBytes > MAX_PDF_BYTES)` → VERMELHO.
  EVIDENCE-CTRL+: com `if (approxBytes > Number.MAX_SAFE_INTEGER)`:
  `× anexo acima do teto é descartado sem nenhum Buffer.from(_, "base64") 22759ms` — `expected [ { name: 'grande.pdf', …(1) } ] to deeply equal []`;
  `× o grande não contamina o pequeno` — `expected [ 'grande.pdf', 'pequeno.pdf' ] to deeply equal [ 'pequeno.pdf' ]`;
  `Tests 2 failed | 1 passed (3)`. (Os 22,7 s são o `Buffer.from` de 14 MB a correr — o custo que o teto evita.) Restaurado, `RESTORED-OK`.

- [x] **G3 — Codex P2: purge do outbox com heartbeat de 24 h**
  `startNotificationOutboxPurge` arrancava sem `heartbeatIntervalMs`; o health
  usava 60 s e declarava `stale` após 2 min enquanto o próximo tick era em
  24 h. Agora passa `OUTBOX_PURGE_INTERVAL_MS` (exportado) como intervalo do
  serviço; `bootstrap.ts` não precisou de mudar.
  CHECK: npx vitest run src/lib/__tests__/notification-outbox-purge-heartbeat.test.ts 2>&1 | grep -E "Tests|FAIL" | tail -2
  EXPECT: com retenção configurada, health é `running` a +2 min e a +(2×24h − 1 ms); `stale` só depois de 2×24h
  EVIDENCE: `Tests 2 passed (2)` — `running` a +120 001 ms e a +172 799 999 ms; `stale` a +172 800 001 ms; `staleAfterMs` = 172 800 000; sem retenção continua `disabled`.
  CTRL+: remover o `heartbeatIntervalMs` do arranque → VERMELHO.
  EVIDENCE-CTRL+: com a linha apagada (`grep -c heartbeatIntervalMs` = 0):
  `× com retenção configurada, não fica stale antes de 2× o intervalo do purge` — `AssertionError: expected 'stale' to be 'running'`; `Tests 1 failed | 1 passed (2)`. Restaurado, `RESTORED-OK`.

- [x] **G4 — REAUD-B-13: interceptor aborta `data:`**
  `grep -n "data:image\|data:font\|data:application\|<img\|url("` em
  `src/lib/pdf/*.ts`, `src/app/api/invoices/[id]/pdf/route.ts` e
  `src/app/api/reports/valvulas-importadas/pdf/route.ts` só devolve
  `render.ts:58: const url = request.url();` — nenhum HTML emite `data:` nem
  `<img>`. A permissão só reabria os decodificadores de imagem num Chromium
  `--no-sandbox`. Agora só `about:` passa.
  CHECK: npx vitest run src/lib/__tests__/pdf-render.test.ts 2>&1 | grep -E "Tests|FAIL" | tail -2
  EXPECT: request `data:image/png;base64,…` → `abort()` chamado, `continue()` não; `about:blank` continua a passar
  EVIDENCE: `Tests 9 passed (9)` — `data:image/png` e `data:image/svg+xml` abortados; `about:blank` com `continue()`.
  CTRL+: repor `url.startsWith('data:') ||` → VERMELHO.
  EVIDENCE-CTRL+: `× aborta \`data:\` — não há uso legítimo e é o que reabre os decodificadores de imagem` — `AssertionError: expected "vi.fn()" to be called at least once`; `Tests 1 failed | 8 passed (9)`. Restaurado, `RESTORED-OK`.

- [x] **G5 — REAUD-B-18: interruptor de TLS grita e a Receita ganha a raiz ICP-Brasil**
  (a) `sefazRequestTls(host)` é chamado por request nos três clientes SEFAZ e
  loga `error { host } 'tls_verification_disabled'` quando
  `SEFAZ_VERIFY_SSL=false`; `ReceitaNfseClient.request()` faz o mesmo por
  request quando `rejectUnauthorized` é false. (b) `receitaRequestTls()`
  devolve `sefazCaBundle()` (Mozilla + ICP-Brasil v10) e o client passa `ca`
  ao `https.request`. (c) `.env.example` deixou de sugerir desligar.
  `SEFAZ_VERIFY_SSL` e `RECEITA_NFSE_VERIFY_SSL` mantidos.
  CHECK: npx vitest run src/lib/__tests__/ssl-verify.test.ts src/lib/__tests__/receita-nfse-tls.test.ts 2>&1 | grep -E "Tests|FAIL" | tail -2
  EXPECT: com `=false`, `log.error` recebe `{ host }`; sem a variável, nenhum `error`; `ReceitaNfseClient` passa `ca` com a raiz v10 ao `https.request`
  EVIDENCE: `ssl-verify.test.ts` 9 passed, `receita-nfse-tls.test.ts` 3 passed — SEFAZ: 2 requests com `=false` → `logError` ×2 com `{ host: 'nfe.sefaz.ms.gov.br' }`; Receita: 2 `fetchDfeByNsu` → `logError` ×2 com `{ host: 'adn.nfse.gov.br' }` e `rejectUnauthorized: [false, false]`; ligado: `ca` contém `ICP_BRASIL_V10_PEM`, `rejectUnauthorized: true`, 0 `error`.
  CTRL+: remover a linha do `log.error` → VERMELHO; remover o `ca` do client → VERMELHO.
  EVIDENCE-CTRL+: (SEFAZ, linha `if (!reject) noteTlsVerificationDisabled(host)` apagada) `× SEFAZ_VERIFY_SSL=false: cada request loga error com o host` — `expected "vi.fn()" to be called 2 times, but got 0 times`; `1 failed | 8 passed (9)`.
  (Receita, linha `if (!this.rejectUnauthorized) noteTlsVerificationDisabled(url.host)` apagada) `× RECEITA_NFSE_VERIFY_SSL=false: … em CADA request` — `called 2 times, but got 0 times`; `1 failed | 2 passed (3)`.
  (`ca: this.ca` apagado) `× apresenta ao https.request o bundle Mozilla + raiz ICP-Brasil v10` — `the given combination of arguments (undefined and string) is invalid`; `1 failed | 2 passed (3)`. Todos restaurados, `RESTORED-OK` ×3, `cmp` = same.

- [x] **G6 — REAUD-B-12: bancos com `no-new-privileges` + `cap_drop: [ALL]`; aceitação do digest formal**
  Tag da imagem NÃO alterada. Aceitação movida para *Active risk acceptance*
  como `QLMED-RISK-2026-09-PG-DIGEST` (Owner Marcelo, Accepted 2026-09-01,
  Finding REAUD-B-12, gatilho: ler `docker inspect --format '{{index .RepoDigests 0}}' qlmed-db`
  na próxima janela e gravar no compose).
  CHECK: npx vitest run src/lib/__tests__/deploy-manifests.test.ts 2>&1 | grep -E "Tests|FAIL" | tail -2
  EXPECT: `qlmed-db` e `n8n-db` têm `security_opt: [no-new-privileges:true]` e `cap_drop: [ALL]`; SECURITY.md tem `QLMED-RISK-2026-09-PG-DIGEST` com Owner/Accepted/trigger
  EVIDENCE: `Tests 31 passed (31)`; `grep -c QLMED-RISK-2026-09-PG-DIGEST SECURITY.md` = 2 (cabeçalho + ponteiro em *Supply chain posture*).
  EVIDENCE-DOCKER (container `qlmed-r5-captest`, `postgres:18-alpine`, sem porta publicada, volume próprio, `--security-opt no-new-privileges:true --cap-drop ALL`, derrubado no fim: `containers=0 volumes=0`):
  ```
  == initdb em volume novo ==
  caps=[CHOWN,SETUID,SETGID,DAC_OVERRIDE,FOWNER] ready_after=2s select1=[1] state=running
  caps=[CHOWN,SETUID,SETGID,DAC_OVERRIDE]        ready_after=2s select1=[1] state=running
  caps=[CHOWN,SETUID,SETGID,FOWNER]              ready_after=2s select1=[1] state=running
  caps=[CHOWN,SETUID,SETGID]                     ready_after=2s select1=[1] state=running
  caps=[SETUID,SETGID]  state=exited  chmod: /var/run/postgresql: Operation not permitted / chown: /var/lib/postgresql/18/docker: Operation not permitted
  caps=[]               state=exited  (idem)
  == recriação sobre dados existentes (volume mantido) ==
  caps=[CHOWN,SETUID,SETGID,DAC_OVERRIDE,FOWNER] ready_after=1s select1=[1] state=running
  caps=[CHOWN,SETUID,SETGID,DAC_OVERRIDE]        ready_after=1s select1=[1] state=running
  caps=[CHOWN,SETUID,SETGID,FOWNER]              state=exited  find: /var/lib/postgresql/18/docker: Permission denied
  caps=[CHOWN,SETUID,SETGID]                     state=exited  chmod: … Operation not permitted / find: … Permission denied
  == docker restart do mesmo container ==
  restart: select1=[1] state=running
  CapEff: 0000000000000000   CapBnd: 00000000000000cb   (pid do servidor postgres)
  ```
  Conclusão medida: `SETUID`+`SETGID`+`CHOWN` chegam para initdb; a recriação
  sobre dados existentes exige `DAC_OVERRIDE` (o `find` do entrypoint lê o
  PGDATA 700 do `postgres` como root). `FOWNER` não foi necessário para
  arrancar em nenhum caminho; fica no conjunto porque é o que permite ao
  `chmod 00700 $PGDATA` do entrypoint não ser um no-op silencioso (`|| :`).
  Conjunto no compose: `CHOWN, DAC_OVERRIDE, FOWNER, SETGID, SETUID` = `CapBnd 0xcb`.
  `mem_limit` NÃO adicionado aos bancos: a correção pedida era (a)+(b); um
  teto errado num Postgres é OOM-kill do banco em produção, decisão do dono.
  CTRL+: remover `cap_drop`/`cap_add` de `n8n-db` → VERMELHO.
  EVIDENCE-CTRL+: `× n8n-db não ganha privilégio e larga todas as capabilities` — `AssertionError: expected undefined to deeply equal [ 'ALL' ]`; `Tests 1 failed | 30 passed (31)`. Restaurado por `cp`, `RESTORED-OK production/docker-compose.yml`.
  Controlo do SECRET_ARG velho no mesmo ficheiro (ver G8) confirmou que os dois casos do compose passavam já com o compose corrigido: `6 failed | 25 passed` — só os 6 negativos novos falharam.

- [x] **G7 — REAUD-B-19: cabeçalho da L4 diz 8, lista OBS-005 como aberto**
  O ficheiro real é `specs/verifications/leaf-reports/L4-segredos.md` (não
  existe `gates/L4-segredos.md`).
  CHECK: grep -n "Fecha 8 findings" specs/verifications/leaf-reports/L4-segredos.md && grep -c "OBS-005" specs/verifications/leaf-reports/L4-segredos.md
  EXPECT: linha 4 diz 8; OBS-005 listado como aberto no cabeçalho
  EVIDENCE: linha 4 `Fecha 8 findings: FILE-007, OBS-001, OBS-003, OBS-004, PRIV-002, FISCAL-009,`; linha 5 `FISCAL-010, FISCAL-011. Aberto: OBS-005 (G8, \`ABANDON\` no fim do ficheiro).`; corpo (`## G8 — OBS-005 … ❌ NÃO FECHADO` e a linha `ABANDON:`) intocado.

- [x] **G8 — SECRET_ARG apanha valor literal e os outros nomes**
  `/^\s{4,}(\w*(?:KEY|SECRET|TOKEN|PASSWORD)\w*):\s*\$\{/im` só pegava `${…}`.
  Agora `/^[ \t]{4,}(\w*(?:KEY|SECRET|TOKEN|PASSWORD|PASSWD|SENHA|CREDENTIAL|PFX|DATABASE_URL)\w*):[ \t]*\S/im`
  — qualquer valor não-vazio, sem atravessar linha. Os três composes reais
  continuam a passar (os `args` são só `QLMED_BUILD_*`).
  CHECK: npx vitest run src/lib/__tests__/deploy-manifests.test.ts 2>&1 | grep -E "Tests|FAIL" | tail -2
  EXPECT: casos sintéticos reprovam (literal, DATABASE_URL, SENHA_*, CREDENTIAL, PFX_BASE64, PASSWD); `QLMED_BUILD_COMMIT_SHA` passa
  EVIDENCE: `Tests 31 passed (31)` — 6 negativos + 1 metadado + 3 composes reais.
  CTRL+: repor o regex antigo → VERMELHO nos casos novos.
  EVIDENCE-CTRL+: com `/^\s{4,}(\w*(?:KEY|SECRET|TOKEN|PASSWORD)\w*):\s*\$\{/im` reposto:
  `× reprova build-arg valor literal`, `× … DATABASE_URL`, `× … SENHA_*`, `× … CREDENTIAL`, `× … PFX_BASE64`, `× … PASSWD` — `AssertionError: expected '        QLMED_API_KEY: sk-live-abc123' to match /^\s{4,}(\w*(?:KEY|SECRET|TOKEN|PASS…/im` (idem para os outros 5); `Tests 6 failed | 25 passed (31)`. Restaurado por `cp` do backup, `cmp` silencioso.

- [x] **G9 — Portões do repositório**
  CHECK: npm run typecheck && npm run lint && npm test && npm run ci:verify && npm run docs:validate
  EXPECT: exit 0 em todos; contagem de testes > 1191
  EVIDENCE: typecheck `exit=0`; lint `exit=0`; test `Test Files 145 passed | 4 skipped (149)` / `Tests 1217 passed | 9 skipped (1226)` `exit=0` (+4 ficheiros, +26 testes sobre o baseline 1191/1200); ci:verify `Deploy guard tests passed.` `exit=0`; docs:validate `Documentation validation passed (172 Markdown files, 48 IDs).` `exit=0`.

- [x] **G10 — Fora da superfície, nada tocado além do declarado**
  Toques fora da lista, todos exigidos pelos achados e em ficheiros que
  nenhuma outra folha (R1–R4) lista: `valvulas-importadas/route.ts` (extrair
  `netQty`, pedido pelo próprio achado; um `route.ts` do Next não pode exportar
  função, por isso a função foi para `src/lib/valvulas-importadas-row.ts`),
  `receita-nfse-client.ts` (aceitar `ca` e logar por request, exigido por
  B-18a/b), `sefaz-client.ts` + `nfe-emission/{autorizacao,status-servico}-client.ts`
  (um token cada: passar o host ao log, exigido por B-18a).
  CHECK: git diff --name-only HEAD
  EXPECT: nenhum ficheiro em `.github/workflows/`, `sefaz.ts`, `nfe-cancellation.ts`, `backfill-tax`, `n8n-client.ts`, `auth-options.ts`, `health/route.ts`
  EVIDENCE: `git status --short` = 17 modificados + 6 novos; nenhum em `.github/`, nenhum dos ficheiros das folhas R1–R4 (`sefaz.ts` nem existe — o repo tem `sefaz-client.ts`).

- [x] **G11 — Commit e push**
  CHECK: git ls-remote origin fix/reaudit-r5
  EXPECT: SHA igual ao HEAD local
  EVIDENCE: ver relatório final (preenchido após o push).
