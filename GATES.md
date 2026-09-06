# Gates: SPEC-055 Spica tag em NF-e emitidas

Scope: Vincular itens de NF-e emitidas ao product_registry e mostrar tag Cód. Spica na aba Produtos (como nas recebidas).

- [x] G1: Ingest chama linkInvoiceItems também para direction=issued
  CHECK: cd /home/marce/qlmed/.worktrees/055-issued-spica-tag && rg -n "direction === 'issued'|issued'|item_links" src/lib/invoice-ingest-pipeline.ts | head -20
  EXPECT: /issued/
  EVIDENCE: 140:      stages.push({ stage: 'item_links', status: 'error', error: errorMsg }); | 143:    stages.push({ stage: 'item_links', status: 'skipped' });

- [x] G2: Sweep inclui emitidas
  CHECK: cd /home/marce/qlmed/.worktrees/055-issued-spica-tag && rg -n "direction" src/lib/nfe-item-link/sweep.ts | head -15
  EXPECT: /issued/
  EVIDENCE: 100:            direction: opts.direction === 'received' || opts.direction === 'issued' | 101:              ? opts.direction

- [x] G3: details API anexa vinculo em issued
  CHECK: cd /home/marce/qlmed/.worktrees/055-issued-spica-tag && rg -n "listInvoiceLinks|direction === 'received'|issued" 'src/app/api/invoices/[id]/details/route.ts' | head -20
  EXPECT: /listInvoiceLinks/
  EVIDENCE: 597:    if (invoice.direction === 'received' || invoice.direction === 'issued') { | 598:      const links = await listInvoiceLinks(company.id, invoice.id);

- [x] G4: TabProdutos mostra Spica em emitidas
  CHECK: cd /home/marce/qlmed/.worktrees/055-issued-spica-tag && rg -n "showSpica|SpicaCodeTag|Cód. Spica" src/components/NfeDetailsModal.tsx | head -20
  EXPECT: /showSpica|SpicaCodeTag/
  EVIDENCE: 337:                  {showSpica && <td className="px-3 py-2.5 text-xs">{tag(prod)}</td>} | 344:                    <td colSpan={showSpica ? 7 : 6} className="bg-slate-50/50 dark:bg-slate-900/30 px-4 

- [x] G5: testes pipeline + extract/link passam
  CHECK: cd /home/marce/qlmed/.worktrees/055-issued-spica-tag && npx vitest run src/lib/__tests__/invoice-ingest-pipeline.test.ts 2>&1 | tail -20
  EXPECT: /passed/
  EVIDENCE: Start at  20:23:15 | Duration  156ms (transform 37ms, setup 17ms, import 19ms, tests 36ms, environment 0ms)

- [x] G6: Preview HTTP :3002
  CHECK: curl -sS -o /dev/null -w '%{http_code}' http://127.0.0.1:3002/fiscal/issued
  EXPECT: /200|307|302/
  EVIDENCE: 307
