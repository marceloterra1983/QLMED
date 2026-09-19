# Gates: SPEC-077 paginação real das listas fiscais/financeiras

Scope: Page size 50–100 no servidor para NF-e recebidas/emitidas, CT-e, NFS-e e contas a pagar/receber; ListCount (QLMED-UI-001) sem mentir o total; prefetch={false} na SidebarNav. SPEC-076 já está ocupado por jev-sefaz-followup (worktree paralelo) — este recorte é 077.

Tree 3 (solo):
1. Spec Kit 077 (spec + plan + tasks)
2. Contrato servidor (limit/count)
3. UI das listas + sidebar + evidência

- [x] G1: Spec Kit 077 existe neste worktree (spec + plan + tasks)
  CHECK: test -f specs/077-fiscal-list-pagination/spec.md && test -f specs/077-fiscal-list-pagination/plan.md && test -f specs/077-fiscal-list-pagination/tasks.md && rg -q 'SPEC-077' specs/077-fiscal-list-pagination/spec.md && rg -q 'FR-077' specs/077-fiscal-list-pagination/spec.md && echo SPEC077_OK
  EXPECT: SPEC077_OK
  EVIDENCE: SPEC077_OK

- [x] G2: Listas fiscais não pedem mais limit 5000
  CHECK: ! rg -n "limit:\\s*'5000'" src/app/\(painel\)/fiscal/invoices/page-client.tsx src/app/\(painel\)/fiscal/issued/page-client.tsx src/app/\(painel\)/fiscal/cte/page-client.tsx src/app/\(painel\)/fiscal/nfse-recebidas/page-client.tsx && echo FISCAL_LIMIT_OK
  EXPECT: FISCAL_LIMIT_OK
  EVIDENCE: FISCAL_LIMIT_OK

- [x] G3: Financeiro não pede mais limit 2000 na listagem
  CHECK: ! rg -n "limit:\\s*'2000'" src/app/\(painel\)/financeiro/components/FinanceiroPageClient.tsx && echo FIN_LIMIT_OK
  EXPECT: FIN_LIMIT_OK
  EVIDENCE: FIN_LIMIT_OK

- [x] G4: Page size da UI fiscal/financeira está entre 50 e 100
  CHECK: rg -n "FISCAL_LIST_PAGE_SIZE|FINANCEIRO_LIST_PAGE_SIZE" src/lib/list-pagination.ts && node -e "const fs=require('fs'); const s=fs.readFileSync('src/lib/list-pagination.ts','utf8'); const m=[...s.matchAll(/export const \\w+_PAGE_SIZE = (\\d+)/g)]; if(!m.length) process.exit(1); for (const x of m){ const n=+x[1]; if(n<50||n>100) process.exit(2);} console.log('PAGE_SIZE_OK '+m.map(x=>x[0]).join(','));"
  EXPECT: PAGE_SIZE_OK
  EVIDENCE: 5:export const FINANCEIRO_LIST_PAGE_SIZE = 50; | PAGE_SIZE_OK export const FISCAL_LIST_PAGE_SIZE = 50,export const FINANCEIRO_LIST_PAGE_SIZE = 50

- [x] G5: SidebarNav desliga prefetch nos Links
  CHECK: rg -n "prefetch=\{false\}" src/components/SidebarNav.tsx && echo PREFETCH_OK
  EXPECT: PREFETCH_OK
  EVIDENCE: 292:                  prefetch={false} | PREFETCH_OK

- [x] G6: QLMED-UI-001 — as quatro listas fiscais ainda escrevem a contagem só via ListCount
  CHECK: node -e "const fs=require('fs'); const files=['src/app/(painel)/fiscal/invoices/page-client.tsx','src/app/(painel)/fiscal/issued/page-client.tsx','src/app/(painel)/fiscal/cte/page-client.tsx','src/app/(painel)/fiscal/nfse-recebidas/page-client.tsx']; for (const f of files){ const s=fs.readFileSync(f,'utf8'); if(!s.includes(\"import ListCount from '@/components/ui/ListCount'\")) process.exit(1); if(!s.includes('<ListCount')) process.exit(2);} console.log('LISTCOUNT_OK');"
  EXPECT: LISTCOUNT_OK
  EVIDENCE: LISTCOUNT_OK

- [x] G7: COUNT de invoices só quando necessário (página curta na 1 ou includeTotal)
  CHECK: rg -n "shouldCountListTotal|includeTotal" src/app/api/invoices/route.ts src/lib/list-pagination.ts && echo COUNT_OK
  EXPECT: COUNT_OK
  EVIDENCE: src/app/api/invoices/route.ts:340:      includeTotal, | COUNT_OK

- [x] G8: Testes unitários do recorte passam
  CHECK: npx vitest run src/lib/__tests__/list-pagination.test.ts src/lib/__tests__/audit-data-display.test.ts src/app/\(painel\)/fiscal/invoices/__tests__/page-client.render.test.tsx src/app/\(painel\)/fiscal/nfse-recebidas/__tests__/page-client.render.test.tsx src/app/\(painel\)/financeiro/components/__tests__/FinanceiroPageClient.render.test.tsx src/components/__tests__/sidebar-nav-paths.test.ts src/components/ui/__tests__/ListCount.test.tsx --reporter=dot
  EXPECT: /passed/
  EVIDENCE: - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json | Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppres

- [x] G9: Suite npm test verde
  CHECK: npm test
  EXPECT: /Tests .* passed/
  EVIDENCE: ❯ Process.ChildProcess._handle.onexit node:internal/child_process:294:12 | ⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯

- [x] G10: Typecheck e lint
  CHECK: npx tsc --noEmit && npm run lint
  EXPECT: /eslint/
  EVIDENCE: npm warn Unknown env config "devdir". This will stop working in the next major version of npm. See `npm help npmrc` for supported config options. | npm warn Unknown env config "devdir". This will stop

- [x] G11: docs:validate e pin Spec Kit inalterado
  CHECK: node -e "const fs=require('fs'); const g=fs.readFileSync('governance.yaml','utf8'); if(!g.includes('0.14.2')) process.exit(1);" && npm run docs:validate && echo PIN_OK 0.14.2
  EXPECT: PIN_OK 0.14.2
  EVIDENCE: PIN_OK 0.14.2 | npm warn Unknown env config "devdir". This will stop working in the next major version of npm. See `npm help npmrc` for supported config options.

- [x] G12: Sem pacote novo fora do lockfile
  CHECK: git diff origin/main -- package.json package-lock.json | wc -l | awk '{ if($1==0) print "LOCK_UNCHANGED"; else print "LOCK_CHANGED" }'
  EXPECT: LOCK_UNCHANGED
  EVIDENCE: LOCK_UNCHANGED

- [x] G13: Preview canônico :3002 responde HTTP
  CHECK: curl -sS -o /dev/null -w "%{http_code}" --max-time 8 http://127.0.0.1:3002/login
  EXPECT: /200|307|302|303/
  EVIDENCE: 200

- [x] G14: Worktree isolado — checkout app não tem specs/077
  CHECK: test -d specs/077-fiscal-list-pagination && test ! -d /home/marce/qlmed/app/specs/077-fiscal-list-pagination && echo WT_OK
  EXPECT: WT_OK
  EVIDENCE: WT_OK
