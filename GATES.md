# Gates: Mês atual no topo, colapsável por inteiro

Scope: O mês calendário atual aparece como cabeçalho colapsável no topo das listas por data; recolher esse mês oculta Hoje / Esta semana / resto do mês. Relativos continuam divisorias estáticas. Outros meses nascem colapsados; o mês atual nasce expandido.

- [x] G1: `splitRelativeGroupsByCurrentMonth` coloca itens do mês atual no shell e deixa dias da semana no mês anterior fora
  CHECK: cd /home/marce/qlmed/.worktrees/fix-current-month-collapse && npx vitest run src/lib/__tests__/nfe-groups.test.ts --reporter=dot 2>&1 | tail -16
  EXPECT: /Test Files\s+1 passed/
  EVIDENCE: Start at  19:51:11 | Duration  117ms (transform 26ms, setup 17ms, import 19ms, tests 4ms, environment 0ms)

- [x] G2: `defaultNfeCollapsedKeys` não inclui `mes_YYYY-MM` do mês atual; `nfeCollapsibleMonthKeys` inclui para Recolher
  CHECK: cd /home/marce/qlmed/.worktrees/fix-current-month-collapse && npx vitest run src/lib/__tests__/list-collapse.test.ts --reporter=dot 2>&1 | tail -16
  EXPECT: /Test Files\s+1 passed/
  EVIDENCE: Start at  19:51:12 | Duration  144ms (transform 35ms, setup 17ms, import 30ms, tests 10ms, environment 0ms)

- [x] G3: Walker de listas por rótulo emite cabeçalho do mês atual e oculta filhos quando colapsado
  CHECK: cd /home/marce/qlmed/.worktrees/fix-current-month-collapse && npx vitest run src/lib/__tests__/list-collapse.test.ts --reporter=dot 2>&1 | tail -8
  EXPECT: /Tests\s+\d+ passed/
  EVIDENCE: Start at  19:51:13 | Duration  147ms (transform 37ms, setup 17ms, import 32ms, tests 10ms, environment 0ms)

- [x] G4: Listas NFe/entrada usam o shell do mês atual; walk-lists usam o walker
  CHECK: cd /home/marce/qlmed/.worktrees/fix-current-month-collapse && python3 -c "from pathlib import Path; r=Path('.'); files=[('src/app/(painel)/fiscal/issued/page-client.tsx','RelativeMonthGroupBody'),('src/app/(painel)/fiscal/invoices/page-client.tsx','RelativeMonthGroupBody'),('src/app/(painel)/estoque/entrada-nfe/page-client.tsx','RelativeMonthGroupBody'),('src/app/(painel)/fiscal/cte/page-client.tsx','createDateGroupWalker'),('src/app/(painel)/fiscal/nfse-recebidas/page-client.tsx','createDateGroupWalker'),('src/app/(painel)/financeiro/components/FinanceiroTable.tsx','createDateGroupWalker'),('src/app/(painel)/cadastro/components/ContactListPageClient.tsx','createDateGroupWalker')]; m=[p for p,n in files if n not in (r/p).read_text()]; print('MISSING:'+','.join(m) if m else 'OK 7')" 
  EXPECT: /OK 7/
  EVIDENCE: OK 7

- [x] G5: Typecheck e lint limpos nos arquivos tocados
  CHECK: cd /home/marce/qlmed/.worktrees/fix-current-month-collapse && npx tsc --noEmit > /tmp/cm-tsc.log 2>&1; echo TSC:$?; tail -5 /tmp/cm-tsc.log; npx eslint src/lib/nfe-groups.ts src/lib/list-collapse.ts src/lib/__tests__/nfe-groups.test.ts src/lib/__tests__/list-collapse.test.ts src/components/ui/RelativeMonthGroupBody.tsx src/components/ui/DateGroupHeader.tsx "src/app/(painel)/fiscal/issued/page-client.tsx" "src/app/(painel)/fiscal/invoices/page-client.tsx" "src/app/(painel)/fiscal/cte/page-client.tsx" "src/app/(painel)/fiscal/nfse-recebidas/page-client.tsx" "src/app/(painel)/estoque/entrada-nfe/page-client.tsx" "src/app/(painel)/financeiro/components/FinanceiroTable.tsx" "src/app/(painel)/financeiro/components/FinanceiroPageClient.tsx" "src/app/(painel)/cadastro/components/ContactListPageClient.tsx" > /tmp/cm-lint.log 2>&1; echo LINT:$?; tail -8 /tmp/cm-lint.log
  EXPECT: /TSC:0[\s\S]*LINT:0/
  EVIDENCE: TSC:0 | LINT:0

- [x] G6: Preview :3002 mostra mês atual no topo com chevron; recolher oculta Hoje/Esta semana desse mês
  EVIDENCE: Preview http://100.83.11.58:3002/fiscal/issued (cwd fix-current-month-collapse). Setembro/2026 no topo, aria-expanded=true, clickable. Esta semana interna 19 itens. Clique no mês e Recolher: Setembro aria-expanded=false; some Esta semana 19; restam Esta semana 13 (31/08) e Semana passada 41 fora do shell. Screenshot issued-setembro-collapsed.png.

- [x] G7: SPEC-053 + SPEC-029 atualizados; `npm run docs:validate` verde
  CHECK: cd /home/marce/qlmed/.worktrees/fix-current-month-collapse && npm run docs:validate 2>&1 | tail -8
  EXPECT: /Documentation validation passed/
  EVIDENCE: > node ./scripts/validate-docs.mjs | Documentation validation passed (229 Markdown files, 64 IDs).
