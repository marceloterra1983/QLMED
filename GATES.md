# Gates: busca emitidas respeita data e ordena por emissão

Scope: Com busca ativa, aplicar dateFrom/dateTo quando preenchidos e ordenar pela coluna (emissão desc por padrão), sem relevância no topo.

- [x] G1: loadInvoices envia dateFrom/dateTo mesmo com search
  CHECK: cd /home/marce/qlmed/.worktrees/fix-issued-search-emission-sort && rg -n "dateFrom|search" 'src/app/(painel)/fiscal/issued/page-client.tsx' | rg -n "params.set\('dateFrom'|if \(search\)" | head -20
  EXPECT: /dateFrom/
  EVIDENCE: 10:177:      if (search) params.set('search', search); | 12:180:      if (dateFrom) params.set('dateFrom', dateFrom);

- [x] G2: não chama sortInvoicesByRelevance no load
  CHECK: cd /home/marce/qlmed/.worktrees/fix-issued-search-emission-sort && rg -n "sortInvoicesByRelevance" 'src/app/(painel)/fiscal/issued/page-client.tsx' || echo 'NO_RELEVANCE_SORT'
  EXPECT: /NO_RELEVANCE_SORT/
  EVIDENCE: NO_RELEVANCE_SORT

- [x] G3: banner não diz "ordenados por relevância"
  CHECK: cd /home/marce/qlmed/.worktrees/fix-issued-search-emission-sort && rg -n "ordenados por relevância|relevância" 'src/app/(painel)/fiscal/issued/page-client.tsx' || echo 'NO_RELEVANCE_BANNER'
  EXPECT: /NO_RELEVANCE_BANNER/
  EVIDENCE: NO_RELEVANCE_BANNER

- [x] G4: Highlight tests still pass
  CHECK: cd /home/marce/qlmed/.worktrees/fix-issued-search-emission-sort && npx vitest run src/components/ui/__tests__/Highlight.test.tsx src/lib/__tests__/nfe-search-engine.test.ts 2>&1 | tail -15
  EXPECT: /passed/
  EVIDENCE: Start at  21:39:51 | Duration  206ms (transform 131ms, setup 42ms, import 147ms, tests 16ms, environment 0ms)

- [x] G5: Preview HTTP
  CHECK: curl -sS -o /dev/null -w '%{http_code}' http://127.0.0.1:3002/fiscal/issued
  EXPECT: /200|307|302/
  EVIDENCE: 307
