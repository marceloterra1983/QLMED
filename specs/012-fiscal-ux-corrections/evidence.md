# Gates: 3 correções de UX (QLMED)

Scope: KPIs em Produtos, cor por sentido em Financeiro, período único em Impostos.
Branch `fix/ux-criticos-p1`, worktree `/home/marce/qlmed/wt-ux-criticos`.

Fora de escopo, com motivo no relatório final:
- Configurações (toggles que persistem) — exige migration Prisma + gate Spec Kit.
- Automações (status ao vivo) — exige integração nova com a API do n8n + credencial.

---

- [x] G1.1: os 4 campos de ProductsSummary chegam à tela, não ficam só no estado
  CHECK: grep -o "totalProducts\|productsWithAnvisa\|totalQuantity\|invoicesProcessed" "src/app/(painel)/cadastro/produtos/page-client.tsx" | sort -u | wc -l
  EXPECT: /^4$/m
  EVIDENCE: 4

- [x] G1.2: o componente de resumo é montado no JSX da página
  CHECK: grep -c "<ProductsSummaryCards summary={summary} />" "src/app/(painel)/cadastro/produtos/page-client.tsx"
  EXPECT: /^1$/m
  EVIDENCE: 1

- [x] G1.3: os cards têm dark mode e Material Symbols, como o resto do app
  EVIDENCE: page-client.tsx:43 card = "bg-white dark:bg-card-dark ... border-slate-200 dark:border-slate-700"; :47 <span className="material-symbols-outlined">; :50 "dark:text-slate-400"; :51 "dark:text-white"; ícones :31-34 cada um com par claro/dark (ex. "bg-teal-100 text-teal-600 dark:bg-teal-900/30 dark:text-teal-400"). Classes literais por card, sem template string — o defeito de Tailwind visto em FinanceiroPageClient.tsx:391 não foi repetido.

- [x] G1.4: a linha de KPIs não renderiza durante loading (sem zeros piscando)
  CHECK: grep -c "{!loading && <ProductsSummaryCards" "src/app/(painel)/cadastro/produtos/page-client.tsx"
  EXPECT: /^1$/m
  EVIDENCE: 1

- [x] G2.1: existe função pura que decide a cor a partir de direction
  CHECK: grep -c "export function getValorColor" "src/app/(painel)/financeiro/components/financeiro-utils.ts"
  EXPECT: /^1$/m
  EVIDENCE: 1

- [x] G2.2: teste unitário cobre os dois sentidos
  CHECK: npx vitest run src/lib/__tests__/financeiro-valor-color.test.ts 2>&1 | tail -5
  EXPECT: 6 passed
  EVIDENCE: Start at  10:20:28 | Duration  211ms (transform 71ms, setup 0ms, import 96ms, tests 3ms, environment 0ms)

- [x] G2.3: nenhuma cor de valor fixa em vermelho sobrou em FinanceiroTable
  CHECK: grep -c "text-red-500 dark:text-red-400" "src/app/(painel)/financeiro/components/FinanceiroTable.tsx"
  EXPECT: /^0$/m
  EVIDENCE: 0

- [x] G2.4: Contas a Pagar continua vermelho; só Receber muda
  EVIDENCE: asserção de igualdade exata passou nos dois sentidos — getValorColor('pagar') === "text-red-600 dark:text-red-400" e getValorColor('receber') === "text-emerald-600 dark:text-emerald-400" (2 passed). A prop chega certa: contas-pagar/page-client.tsx:6 direction="pagar", contas-receber/page-client.tsx:6 direction="receber".

- [x] G2.5: a cor do STATUS da duplicata não foi alterada
  CHECK: git diff -- "src/app/(painel)/financeiro/components/financeiro-utils.ts" | grep -c "^[-+].*classes:"
  EXPECT: /^0$/m
  EVIDENCE: 0

- [x] G3.1: by-cfop usa o schema e o cálculo de período compartilhados
  CHECK: grep -c "fiscalPeriodQuerySchema\|getFiscalPeriodRange" src/app/api/fiscal/by-cfop/route.ts
  EXPECT: /^3$/m
  EVIDENCE: 3

- [x] G3.2: by-cfop passou a receber period e month, não só year
  CHECK: grep -c "const { period, year, month } = parsed.data" src/app/api/fiscal/by-cfop/route.ts
  EXPECT: /^1$/m
  EVIDENCE: 1

- [x] G3.3: dashboard e by-cfop derivam o intervalo da mesma função (não podem divergir)
  CHECK: grep -lc "getFiscalPeriodRange" src/app/api/fiscal/dashboard/route.ts src/app/api/fiscal/by-cfop/route.ts | wc -l
  EXPECT: /^2$/m
  EVIDENCE: 2

- [x] G3.4: teste cobre os 4 trimestres, bissexto e a diferença trimestre vs ano
  CHECK: npx vitest run src/lib/__tests__/fiscal-period.test.ts 2>&1 | tail -5
  EXPECT: 13 passed
  EVIDENCE: Start at  10:20:29 | Duration  259ms (transform 49ms, setup 0ms, import 108ms, tests 7ms, environment 0ms)

- [x] G3.5: o cliente manda período/mês ao by-cfop e recarrega quando o filtro muda
  CHECK: grep -c "by-cfop?\${params}" "src/app/(painel)/fiscal/dashboard/page-client.tsx"
  EXPECT: /^1$/m
  EVIDENCE: 1

- [x] G3.6: modo Trimestre tem seletor T1–T4
  CHECK: grep -c "period === 'quarter' && (" "src/app/(painel)/fiscal/dashboard/page-client.tsx"
  EXPECT: /^1$/m
  EVIDENCE: 1

- [x] G3.7: cabeçalho dos painéis nomeia o intervalo ativo
  CHECK: grep -c "<PeriodBadge label={rangeLabel} />" "src/app/(painel)/fiscal/dashboard/page-client.tsx"
  EXPECT: /^3$/m
  EVIDENCE: 3

- [x] G4.1: TypeScript compila sem erro
  CHECK: npx tsc --noEmit && echo TSC_OK
  EXPECT: TSC_OK
  EVIDENCE: TSC_OK

- [x] G4.2: lint limpo
  CHECK: npm run lint > /dev/null 2>&1 && echo LINT_OK
  EXPECT: LINT_OK
  EVIDENCE: LINT_OK

- [x] G4.3: suíte de testes passa inteira
  CHECK: npm test 2>&1 | tail -6
  EXPECT: 43 passed
  EVIDENCE: Start at  10:20:42 | Duration  5.09s (transform 4.93s, setup 0ms, import 10.92s, tests 6.36s, environment 8ms)

- [x] G4.4: build de produção passa
  CHECK: npm run build > /dev/null 2>&1 && echo BUILD_OK
  EXPECT: BUILD_OK
  EVIDENCE: BUILD_OK

- [x] G4.5: nada vazou para o checkout principal (outra sessão trabalha lá)
  CHECK: git -C /home/marce/qlmed/app status --short -- "src/app/(painel)/cadastro/produtos" "src/app/(painel)/financeiro" "src/app/(painel)/fiscal/dashboard" src/app/api/fiscal src/lib/fiscal-period.ts | wc -l
  EXPECT: /^0$/m
  EVIDENCE: 0

- [x] G4.6: os testes reprovam sem a correção (não protegem o defeito)
  EVIDENCE: dois experimentos de reversão. (1) getValorColor forçado a devolver sempre vermelho => "Tests 3 failed | 3 passed (6)", reprovando "pinta o valor a receber de verde", "distingue os dois sentidos" e "não usa vermelho para receber". (2) ramo 'quarter' removido de getFiscalPeriodRange (trimestre caindo no ano inteiro, o defeito original do CFOP) => "Tests 5 failed | 8 passed (13)". Restaurados: 6 passed e 13 passed.
