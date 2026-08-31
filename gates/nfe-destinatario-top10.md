# Gates: Destinatário top 10 faturados

Scope: Sem busca na Nova NF-e: só até 10 clientes mais faturados (NF-e emitidas, 6 meses). Com busca: matches A–Z. Sem dump A–Z / separator. Isolamento companyId.

- [x] G1: Ranking por faturamento limita a 10 e sem busca não dumpa A–Z
  CHECK: npx vitest run src/lib/__tests__/nfe-emission-customer-search.test.ts -t "top faturados"
  EXPECT: Test Files  1 passed
  EVIDENCE: Start at  20:10:26 | Duration  215ms (transform 66ms, setup 0ms, import 83ms, tests 4ms, environment 0ms)

- [x] G2: Com busca ativa, só matches filtrados (sem topBilled)
  CHECK: npx vitest run src/lib/__tests__/nfe-emission-customer-search.test.ts -t "busca ativa"
  EXPECT: Test Files  1 passed
  EVIDENCE: Start at  20:10:27 | Duration  173ms (transform 42ms, setup 0ms, import 58ms, tests 7ms, environment 0ms)

- [x] G3: WHERE/ranking amarra companyId e janela de 6 meses
  CHECK: npx vitest run src/lib/__tests__/nfe-emission-customer-search.test.ts -t "tenant e janela"
  EXPECT: Test Files  1 passed
  EVIDENCE: Start at  20:10:28 | Duration  171ms (transform 51ms, setup 0ms, import 66ms, tests 4ms, environment 0ms)

- [x] G4: UI sem separator de destinatário; lista simples de customers
  CHECK: node -e "const fs=require('fs'); const s=fs.readFileSync('src/app/(painel)/fiscal/issued/nova/page-client.tsx','utf8'); const hasDumpSep=/data-destinatario-sep/.test(s); const hasMap=/customers\.map/.test(s); const hasHelp=/10 mais faturados/.test(s); const hasSerieLinha=/data-nfe-serie-finalidade-linha/.test(s); console.log(JSON.stringify({hasDumpSep,hasMap,hasHelp,hasSerieLinha})); if(hasDumpSep||!hasMap||!hasHelp||!hasSerieLinha) process.exit(1);"
  EXPECT: "hasDumpSep":false
  EVIDENCE: {"hasDumpSep":false,"hasMap":true,"hasHelp":true,"hasSerieLinha":true}

- [x] G5: Spec 025 FR-023 top 10 no open + busca manual
  CHECK: rg -n "FR-023|AC-024|AC-025|mais faturamento|6 meses" specs/025-emissao-nota-fiscal/spec.md
  EXPECT: FR-023
  EVIDENCE: 326:- **FR-023**: Sem texto de busca, a caixa de seleção de destinatário | 329:  `cancelledAt` nulo, `issueDate` nos últimos 6 meses) da empresa

- [x] G6: Suíte customer-search completa
  CHECK: npx vitest run src/lib/__tests__/nfe-emission-customer-search.test.ts
  EXPECT: Test Files  1 passed
  EVIDENCE: Start at  20:10:29 | Duration  159ms (transform 36ms, setup 0ms, import 50ms, tests 12ms, environment 0ms)

- [x] G7: Typecheck
  CHECK: npx tsc --noEmit
  EXPECT: 
  EVIDENCE: (no output)

- [x] G8: Lint dos arquivos tocados
  CHECK: npx eslint "src/lib/nfe-emission/customer-search.ts" "src/app/api/nfe-emissions/customers/route.ts" "src/app/(painel)/fiscal/issued/nova/page-client.tsx" "src/lib/__tests__/nfe-emission-customer-search.test.ts"
  EXPECT: 
  EVIDENCE: (no output)

- [x] G9: Preview :3002 sobe a worktree nfe-form-order
  CHECK: ss -ltnp | rg ':3002' || echo 'DEV_NOT_LISTENING'
  EXPECT: :3002
  EVIDENCE: LISTEN 0      511                        0.0.0.0:3002       0.0.0.0:*    users:(("next-server (v1",pid=918009,fd=22))
