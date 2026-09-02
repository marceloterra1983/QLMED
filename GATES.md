# Gates: estreitar a chave do sync de CT-e (admin → invoices:write)

Scope: `/api/invoices/upload` exige `editor`; por chave de API, `requireRole`
só mapeia `admin` → admin, o resto → viewer. O sync de CT-e ficou com uma
chave `{admin}` por isso. Correção no guarda, uma vez, para todos os callers:
`requireRole`/`requireEditor` aceitam `apiKeyScope`; a rota pede
`invoices:write`.

Invariante: **uma chave com `invoices:write` passa no upload; uma chave com
qualquer outro escopo não-admin leva 403; sessão continua igual.**

- [x] G1: `requireRole` aceita `{ apiKeyScope }` e trata a chave que o tem como
  cumprindo `minRole`; sem a opção, comportamento antigo (só admin).
  CHECK: grep -nE "apiKeyScope" src/lib/auth.ts | grep -c "requireRole\|effectiveRole\|options"
  EXPECT: /[1-9]/
  EVIDENCE: `grep -c` = 4 (options.apiKeyScope, scoped, effectiveRole, usedScope) em src/lib/auth.ts

- [x] G2: a rota de upload pede `invoices:write`.
  CHECK: grep -nE "requireEditor\(\{ apiKeyScope: 'invoices:write' \}\)" src/app/api/invoices/upload/route.ts
  EXPECT: /invoices:write/
  EVIDENCE: linha `const auth = await requireEditor({ apiKeyScope: 'invoices:write' });` em upload/route.ts

- [x] G3: teste de comportamento na rota real: chave `invoices:write` passa da
  auth; chave `notifications:dispatch` → 403; chave `admin` passa; sem chave e
  sem sessão → 401.
  CHECK: npx vitest run src/lib/__tests__/cte-key-invoices-write.test.ts 2>&1 | grep -E "^ +Tests +[0-9]+ passed"
  EXPECT: /passed/
  EVIDENCE: `Tests 5 passed (5)` — invoices:write passa; notifications:dispatch 403; admin passa; sem chave 401; AccessLog com scope

- [x] G4: controlo positivo — revertendo o guarda (ignorar `apiKeyScope`), o
  caso `invoices:write` fica vermelho com 403.
  EVIDENCE: com `const scoped = false;` → `AssertionError: expected [ 401, 403 ] to not include 403`; restaurado por cp, `cmp` igual, 5/5 de volta

- [x] G5: o AccessLog regista o escopo usado (`scope=invoices:write`), como o
  `requireAuth` já faz — não só `keyId`.
  CHECK: npx vitest run src/lib/__tests__/cte-key-invoices-write.test.ts -t "AccessLog" 2>&1 | grep -E "^ +Tests +[0-9]+ passed"
  EXPECT: /passed/
  EVIDENCE: caso 'AccessLog regista o escopo usado' verde: path contém `keyId=ak1` e `scope=invoices:write`

- [x] G6: suíte inteira, typecheck e lint verdes; `middleware-acl` e
  `reaudit-r4-route-negatives` continuam verdes (nenhum negativo afrouxou).
  CHECK: npm run typecheck >/dev/null 2>&1 && npm run lint >/dev/null 2>&1 && npm test 2>&1 | grep -E "^ +Tests +[0-9]+ passed"
  EXPECT: /passed/
  EVIDENCE: typecheck exit 0; lint exit 0; `Tests 1339 passed | 9 skipped (1348)`; middleware-acl + reaudit-r4-route-negatives + upload-route-limits: 36 passed

- [x] G7: PR aberto com a ordem pós-deploy: gerar chave `invoices:write` em
  `env/app.env`, recriar o container no próximo deploy, revogar a `admin`.
  EVIDENCE: https://github.com/marceloterra1983/QLMED/pull/269 aberto com a ordem pós-deploy (gerar invoices:write em env/app.env → deploy recria → confirmar AccessLog → revogar admin)
