# Gates: número da NF com ponto (pt-BR)

Scope: Exibir todo número de nota fiscal (NF-e, NFS-e, CT-e) como 65.254 em vez de 65254, sem alterar persistência, CSV, chave de acesso ou DANFE oficial.

- [x] G1: Helper formata 65254 → 65.254 e cobre bordas
  CHECK: npx vitest run src/lib/__tests__/utils.test.ts --reporter=verbose
  EXPECT: formatInvoiceNumber agrupa milhar
  EVIDENCE: vitest — "formatInvoiceNumber agrupa milhar sem pad de 9 dígitos"; Test Files 1 passed

- [x] G2: Highlight encontra 65.053 a partir da busca 65053
  CHECK: npx vitest run src/components/ui/__tests__/Highlight.test.tsx --reporter=verbose
  EXPECT: thousand-separated invoice numbers
  EVIDENCE: vitest — "highlights thousand-separated invoice numbers from a digit query"; Test Files 1 passed

- [x] G3: Caption WhatsApp e push usam o mesmo formato
  CHECK: npx vitest run src/lib/__tests__/cte-whatsapp-caption.test.ts src/lib/__tests__/web-push.test.ts --reporter=dot
  EXPECT: Test Files  2 passed
  EVIDENCE: Test Files 2 passed (2); Tests 21 passed (21)

- [x] G4: Telas de lista/modal importam o helper
  CHECK: python3 -c "from pathlib import Path; roots=[Path('src/app'),Path('src/components')]; files=[]; [files.extend(p.rglob('*.tsx')) for p in roots]; need=['invoices/page-client.tsx','issued/page-client.tsx','cte/page-client.tsx','nfse-recebidas/page-client.tsx','entrada-nfe/page-client.tsx','FinanceiroTable.tsx','NfeDetailsModal.tsx','CteDetailsModal.tsx','NfseDetailsModal.tsx','InvoiceListSection.tsx']; missing=[n for n in need if not any(n in str(f) and 'formatInvoiceNumber' in f.read_text(encoding='utf-8') for f in files)]; print('OK' if not missing else 'MISSING '+','.join(missing)); raise SystemExit(1 if missing else 0)"
  EXPECT: OK
  EVIDENCE: python check printed OK

- [x] G5: Typecheck
  CHECK: npx tsc --noEmit && echo TSC_OK
  EXPECT: TSC_OK
  EVIDENCE: TSC_OK

- [x] G6: docs:validate
  CHECK: npm run docs:validate
  EXPECT: Documentation validation passed
  EVIDENCE: Documentation validation passed (262 Markdown files, 86 IDs)

- [x] G7: Preview :3002 responde após apontar o tip
  CHECK: curl -sS -o /dev/null -w '%{http_code}' http://127.0.0.1:3002/
  EXPECT: /^(200|307|308)$/
  EVIDENCE: HTTP 307; browser emitidas/recebidas e modal "NF-e 65.254"
