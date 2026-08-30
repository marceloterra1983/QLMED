# Gates: tela profissional de emissão NF-e

Scope: reformar /fiscal/issued/nova no padrão Bling/Conta Azul + grupos MOC 7.0.

- [x] G1: Página de emissão tem seções Dados, Itens, Transporte, Pagamento, Complementos e painel de totais
  CHECK: rg -n "modFrete|tPag|Complementos" "src/app/(painel)/fiscal/issued/nova/page-client.tsx"
  EXPECT: /modFrete/
  EVIDENCE: 581:                  <select value={tPag} onChange={(e) => setTPag(e.target.value)} className={FILTER_INPUT_CLS}> | 587:                Valor a informar no XML: <span className="font-bold tabular-num

- [x] G2: XML de emissão inclui transp, pag e infAdic quando preenchidos
  CHECK: rg -n "modFrete|detPag|infCpl" src/lib/nfe-emission/xml-builder.ts
  EXPECT: /modFrete/
  EVIDENCE: 113:  if (!draft.infCpl && !draft.infAdFisco) return ''; | 115:  const cpl = draft.infCpl ? `<infCpl>${esc(draft.infCpl)}</infCpl>` : '';

- [x] G3: Schema Zod aceita finalidade, presença, pagamento e transporte
  CHECK: rg -n "finNFe|indPres|tPag|modFrete" src/lib/nfe-emission/schema.ts
  EXPECT: /finNFe/
  EVIDENCE: 37:  modFrete: z.enum(['0', '1', '2', '3', '4', '9']).default('9'), | 58:    tPag: z.string().regex(/^\d{2}$/),

- [x] G4: Testes de XML cobrem pagamento PIX e frete
  CHECK: npx vitest run src/lib/__tests__/nfe-emission-xml.test.ts --reporter=dot
  EXPECT: /passed/
  EVIDENCE: Start at  18:18:23 | Duration  181ms (transform 46ms, setup 0ms, import 74ms, tests 26ms, environment 0ms)

- [x] G5: Typecheck limpo
  CHECK: npx tsc --noEmit && echo TSC_OK
  EXPECT: TSC_OK
  EVIDENCE: TSC_OK

- [x] G6: Suite de testes do repo
  CHECK: npm test
  EXPECT: /513 passed/
  EVIDENCE: Start at  18:18:25 | Duration  2.27s (transform 1.95s, setup 0ms, import 3.78s, tests 4.05s, environment 4ms)
