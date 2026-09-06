# Gates: Divisórias relativas estáticas (Hoje / Esta semana / Semana passada)

Scope: Só meses ficam colapsáveis nas listas com agrupamento por data; Hoje, Esta semana e Semana passada viram linhas divisorias (sem chevron/clique) em todas as tabelas que usam essa divisão.

- [x] G1: Helper `isCollapsibleDateGroup` recusa buckets relativos e aceita meses
  CHECK: cd /home/marce/qlmed/.worktrees/042-spica-import && npx vitest run src/lib/__tests__/list-collapse.test.ts --reporter=dot 2>&1 | tail -12
  EXPECT: /Test Files\s+1 passed/
  EVIDENCE: Start at  19:03:52 | Duration  157ms (transform 42ms, setup 18ms, import 41ms, tests 10ms, environment 0ms)

- [x] G2: `defaultNfeCollapsedKeys` não inclui `semana_passada` / `hoje` / `esta_semana`
  CHECK: cd /home/marce/qlmed/.worktrees/042-spica-import && npx vitest run src/lib/__tests__/list-collapse.test.ts --reporter=dot 2>&1 | tail -8
  EXPECT: /Tests\s+\d+ passed/
  EVIDENCE: Start at  19:03:53 | Duration  352ms (transform 91ms, setup 54ms, import 65ms, tests 16ms, environment 0ms)

- [x] G3: `DateGroupHeader` não renderiza chevron nem clique em Hoje; meses continuam colapsáveis
  CHECK: cd /home/marce/qlmed/.worktrees/042-spica-import && npx vitest run src/components/ui/__tests__/DateGroupHeader.test.tsx --reporter=dot 2>&1 | tail -12
  EXPECT: /Test Files\s+1 passed/
  EVIDENCE: Start at  19:03:54 | Duration  562ms (transform 54ms, setup 23ms, import 95ms, tests 32ms, environment 312ms)

- [x] G4: Todas as listas de data usam o header/helper compartilhado
  CHECK: cd /home/marce/qlmed/.worktrees/042-spica-import && rg -l "DateGroupHeader|dateGroupItemsVisible|isCollapsibleDateGroup" "src/app/(painel)/fiscal/issued/page-client.tsx" "src/app/(painel)/fiscal/invoices/page-client.tsx" "src/app/(painel)/fiscal/cte/page-client.tsx" "src/app/(painel)/fiscal/nfse-recebidas/page-client.tsx" "src/app/(painel)/estoque/entrada-nfe/page-client.tsx" "src/app/(painel)/financeiro/components/FinanceiroTable.tsx" "src/app/(painel)/financeiro/components/FinanceiroPageClient.tsx" "src/app/(painel)/cadastro/components/ContactListPageClient.tsx" | wc -l
  EXPECT: /8/
  EVIDENCE: 8

- [x] G5: Typecheck e lint limpos nos arquivos tocados
  CHECK: cd /home/marce/qlmed/.worktrees/042-spica-import && npx tsc --noEmit > /tmp/g6-tsc.log 2>&1; echo TSC:$?; tail -3 /tmp/g6-tsc.log; npx eslint src/lib/list-collapse.ts src/lib/__tests__/list-collapse.test.ts src/components/ui/DateGroupHeader.tsx src/components/ui/__tests__/DateGroupHeader.test.tsx "src/app/(painel)/fiscal/issued/page-client.tsx" "src/app/(painel)/fiscal/invoices/page-client.tsx" "src/app/(painel)/fiscal/cte/page-client.tsx" "src/app/(painel)/fiscal/nfse-recebidas/page-client.tsx" "src/app/(painel)/estoque/entrada-nfe/page-client.tsx" "src/app/(painel)/financeiro/components/FinanceiroTable.tsx" "src/app/(painel)/financeiro/components/FinanceiroPageClient.tsx" "src/app/(painel)/cadastro/components/ContactListPageClient.tsx" > /tmp/g6-lint.log 2>&1; echo LINT:$?; tail -5 /tmp/g6-lint.log
  EXPECT: /TSC:0[\s\S]*LINT:0/
  EVIDENCE: TSC:0 | LINT:0

- [x] G6: Preview :3002 mostra Hoje/Esta semana/Semana passada sem chevron e meses com chevron
  EVIDENCE: Preview :3002 (QLMED_PREVIEW_CWD=042-spica-import) /fiscal/issued: Hoje/Esta semana/Semana passada chevron=false clickable=false; Agosto/2026 chevron=true clickable=true aria-expanded. Recolher deixa 73 linhas (32+41) visíveis. /fiscal/invoices: Hoje/Esta semana sem chevron; Agosto+ com chevron. Screenshot issued-date-groups.png.

- [x] G7: Spec 053 + SPEC-029 AC-002 atualizado; `npm run docs:validate` verde
  CHECK: cd /home/marce/qlmed/.worktrees/042-spica-import && npm run docs:validate 2>&1 | tail -5
  EXPECT: /Documentation validation passed/
