# Gates: R3 — segredos, scripts de migração e egresso n8n

Escopo: fechar REAUD-B-08, B-07, B-10 e B-11 da re-auditoria adversarial.
Superfície: `scripts/migrate-plaintext-secrets.ts`, `scripts/backfill-allowed-pages.ts`,
`src/lib/crypto.ts` (só `isEncryptedText`), `src/lib/n8n-client.ts`, e testes.

Base: `audit/remediacao-b177b07` @ 1ad4007 · branch `fix/reaudit-r3`

Regra de controlo positivo: em cada correção, reverter a linha que corrige,
confirmar VERMELHO, restaurar por cópia de backup (nunca `git checkout`), e
registar a saída exata. Runner: `scratchpad/run-controls.sh` (perl in-place →
vitest → `cp` do backup → `cmp`).

---

- [x] **G0 — Base verde antes de tocar em código**
  CHECK: npx vitest run
  EXPECT: exit 0
  EVIDENCE: `Test Files 141 passed | 4 skipped (145)` · `Tests 1191 passed | 9 skipped (1200)` · exit=0 (log em scratchpad/baseline-test.log).

- [x] **G1 — REAUD-B-08: `looksEncrypted` exige a forma exata, não conta `:`**
  `isEncryptedText` exportado de `src/lib/crypto.ts`: `(hex32:){3}hex*` (novo) ou
  `(hex32:){2}hex*` (legado) — a forma que `encrypt()` produz e `decrypt()` lê.
  Larguras confirmadas no produtor original (`git show f62bc7d:src/lib/crypto.ts`:
  `randomBytes(16)` para o iv, tag GCM de 16 bytes). Um segredo em claro
  `part:part:part` não é "já cifrado": é recifrado. Um valor NA forma mas que
  `decrypt()` não abre vai para `failed`, nunca é pulado em silêncio.
  CHECK: npx vitest run src/lib/__tests__/crypto.test.ts src/lib/__tests__/migrate-plaintext-secrets.test.ts
  EXPECT: /Tests\s+\d+ passed/
  EVIDENCE: dentro da corrida dos 4 ficheiros: `Test Files 4 passed (4)` · `Tests 55 passed (55)` (crypto 14, migrate 10, n8n-client 22, backfill 9).

- [x] **G1-CP — Controlo positivo de G1**
  Reverter `isEncryptedText` para a contagem de partes (`parts.length === 4 || 3`).
  CHECK (manual): mesmo comando de G1 com a reversão aplicada
  EXPECT: VERMELHO no teste `part:part:part`
  EVIDENCE: `Tests 4 failed | 20 passed (24)` — `× recusa texto claro com dois ou três dois-pontos` (`expected true to be false`), `× recifra um segredo em claro com dois-pontos (part:part:part) — nunca o pula`, `× idem com quatro partes em claro`, `× recusa hex na largura errada`. `RESTAURADO por cópia: src/lib/crypto.ts (cmp igual)`.

- [x] **G2 — REAUD-B-07: `TEXT_SECRETS` cobre `N8nIntegrationConfig.apiToken`**
  Entrada `{ model: 'n8nIntegrationConfig', fields: ['apiToken'] }`. Teste cruza
  CADA entrada com `prisma/schema.prisma` (modelo existe, campo existe e é
  `String`). Modelo ausente no cliente agora LANÇA em vez de "pulado".
  CHECK: npx vitest run src/lib/__tests__/migrate-plaintext-secrets.test.ts -t "TEXT_SECRETS"
  EXPECT: /Tests\s+\d+ passed/
  EVIDENCE: os 3 testes do bloco `TEXT_SECRETS — REAUD-B-07` passam na corrida de G1 (10/10 no ficheiro).

- [x] **G2-CP — Controlo positivo de G2**
  Remover a entrada do n8n de `TEXT_SECRETS`.
  CHECK (manual): mesmo comando de G2 com a reversão aplicada
  EXPECT: VERMELHO
  EVIDENCE: `ocorrências de n8nIntegrationConfig no script: 0` → `Tests 2 failed | 1 passed | 7 skipped (10)`: `× inclui N8nIntegrationConfig.apiToken`, `× recifra um token n8n em claro` (`expected undefined to match object { encrypted: 1, failed: [] }`). `RESTAURADO por cópia: scripts/migrate-plaintext-secrets.ts (cmp igual)`.

- [x] **G2-X — Leitura cruzada: toda coluna lida por `decrypt()` está em `TEXT_SECRETS`**
  CHECK (manual): grep -rn "decrypt(" src --include=*.ts --include=*.tsx | grep -v __tests__
  EXPECT: cada coluna do grep mapeada para uma entrada da lista; lista final no relatório
  EVIDENCE: 14 call sites, 6 colunas: `certificateConfig.pfxPassword` (certificate-secret.ts:88) · `nsdocsConfig.apiToken` (nsdocs/documents:34, import-period:54, config:35,99, sync-strategies/nsdocs.ts:29) · `receitaNfseConfig.apiToken` (receita/nfse/config:55,132,190, receita-nfse-sync.ts:114) · `oneDriveConnection.accessToken`/`refreshToken` (onedrive-connections.ts:48,54) · `n8nIntegrationConfig.apiToken` (n8n/config:50, n8n/status:55). As 6 estão em `TEXT_SECRETS`; nenhuma sobra.

- [x] **G3 — REAUD-B-10: o `fetch` do n8n não segue redirect**
  `redirect: 'error'` em `fetchPaginated`. Mock de `fetch` que emula o spec:
  com `redirect: 'error'` rejeita com TypeError; caso contrário "segue" o 302
  para um segundo host e regista a chamada. O cliente devolve `unavailable`
  e o segundo host nunca recebe `X-N8N-API-KEY`.
  CHECK: npx vitest run src/lib/__tests__/n8n-client.test.ts -t "redirect"
  EXPECT: /Tests\s+\d+ passed/
  EVIDENCE: os 2 testes do bloco `fetchN8nWorkflows — redirect` passam na corrida de G1 (22/22 no ficheiro).

- [x] **G3-CP — Controlo positivo de G3**
  Remover `redirect: 'error'` do fetch.
  CHECK (manual): mesmo comando de G3 com a reversão aplicada
  EXPECT: VERMELHO — o mock regista a chamada ao segundo host com a chave
  EVIDENCE: `ocorrências de redirect error no cliente: 0` → `Tests 2 failed | 20 skipped (22)`: `× um 302 vira unavailable e a chave nunca chega ao segundo host` (`expected 'ok' to be 'unavailable'` — sem a correção o cliente SEGUE para evil.example e devolve `ok`), `× pede redirect: "error" em TODA requisição` (`expected undefined to be 'error'`). `RESTAURADO por cópia: src/lib/n8n-client.ts (cmp igual)`.

- [x] **G4 — REAUD-B-11: backfill só toca o acervo activo anterior ao deploy, sem `/sistema/*`**
  `where` ganha `status: 'active'` e `createdAt: { lt: createdBefore }`;
  `--created-before=<ISO>` é obrigatório sem `--dry-run`; `/sistema/*` sai da
  concessão por omissão e só entra com `--include-admin-pages`. Teste com
  cliente prisma falso que interpreta o `where`: `inactive`, `pending` e
  `rejected` não são tocados (o schema não tem `disabled`); utilizador criado
  depois do corte não é tocado; admin não é tocado; a lista concedida não
  contém `/sistema/` (6 páginas de 18 ficam de fora).
  CHECK: npx vitest run src/lib/__tests__/backfill-allowed-pages.test.ts
  EXPECT: /Tests\s+\d+ passed/
  EVIDENCE: 9/9 no ficheiro, na corrida de G1.

- [x] **G4-CP — Controlo positivo de G4**
  Reverter o `where` para o original e a lista para `ALL_PAGES`.
  CHECK (manual): mesmo comando de G4 com a reversão aplicada
  EXPECT: VERMELHO nos testes de status e de `/sistema/`
  EVIDENCE: `Tests 4 failed | 5 passed (9)`: `× só o utilizador ativo…` (`expected [ 'ativo-antigo', 'inativo', …(3) ] to deeply equal [ 'ativo-antigo' ]` — sem a correção o inativo, o pendente, o rejeitado e o criado depois do corte são todos tocados), `× pede ao Prisma o filtro de status ativo e o corte por createdAt`, `× a lista concedida não contém /sistema/ por omissão` (`expected true to be false`), `× pagesToGrant só difere pelas páginas /sistema/*`. `RESTAURADO por cópia: scripts/backfill-allowed-pages.ts (cmp igual)`.

- [x] **G5 — Importar os scripts em teste não executa `main()` nem abre Postgres**
  Os dois scripts passam a exportar a função e só correm `main()` quando são o
  ponto de entrada (`import.meta.url === pathToFileURL(argv[1])`, provado no
  tsx com `scratchpad/probe-entry.ts`: `equal = true`). Sob vitest, `argv[1]`
  é o binário do vitest.
  CHECK: env -u DATABASE_URL npx vitest run src/lib/__tests__/migrate-plaintext-secrets.test.ts src/lib/__tests__/backfill-allowed-pages.test.ts
  EXPECT: /Tests\s+\d+ passed/
  EVIDENCE: a corrida de G1 foi com `env -u DATABASE_URL` e `printenv DATABASE_URL | wc -c` = 0 no shell: 19/19 nos dois ficheiros, sem `DATABASE_URL is required`, sem ligação.

- [x] **G6 — Os scripts continuam a arrancar pelo `tsx` (o guard não os matou)**
  Sem `DATABASE_URL` no ambiente (`env -i`), cada script tem de chegar a
  `main()` e falhar na validação — antes de qualquer ligação. Nenhum acesso a
  127.0.0.1:5432.
  CHECK: env -i PATH="$PATH" HOME="$HOME" npx tsx scripts/backfill-allowed-pages.ts --created-before=lixo; echo "exit=$?"
  EXPECT: mensagem de `--created-before` inválido e `exit=1`
  EVIDENCE: `--created-before inválido: "lixo" (esperado ISO 8601, ex.: 2026-09-01T00:00:00Z)` · `exit=1` (antes de construir o PrismaClient). `migrate-plaintext-secrets.ts`: `DATABASE_URL is required` · `exit=1`. `backfill` sem flags: `DATABASE_URL is required` · `exit=1` — com `DATABASE_URL` presente o cliente é construído (pool `pg` é preguiçoso, não liga) e `backfillAllowedPages` recusa antes do `findMany` (teste `sem --created-before fora do dry-run`: `findMany` não chamado).

- [x] **G7 — Suíte completa verde e contagem ≥ base + novos**
  CHECK: npm run typecheck && npm run lint && npm test
  EXPECT: exit 0 nos três; `Tests N passed` com N ≥ 1191 + testes novos
  EVIDENCE: `typecheck exit=0` · `lint exit=0` (ESLint ignora `scripts/**`; o typecheck cobre-os) · `Test Files 143 passed | 4 skipped (147)` · `Tests 1216 passed | 9 skipped (1225)` = 1191 + 25 novos (crypto 4, n8n-client 2, migrate 10, backfill 9), nenhum perdido.

- [x] **G8 — Commit e push confirmados no remoto**
  CHECK: git ls-remote origin refs/heads/fix/reaudit-r3
  EXPECT: SHA igual a `git rev-parse HEAD`
  EVIDENCE: `5384ea216cda938228b33731f23d75c59fc9ca40 refs/heads/fix/reaudit-r3` = `git rev-parse HEAD`. Esta linha de evidência entra num commit seguinte (só o ledger), também empurrado.
