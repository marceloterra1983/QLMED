# Gates: P3 — RowActions dirigido por dados

Scope: `src/components/ui/RowActions.tsx` e `src/components/__tests__/row-actions.test.tsx`. Default `RowActions` mantém o contrato de nota fiscal das 5 páginas; `RowActionsBase` é o genérico. Sem mudar callers.

- [x] G1: teste de contrato passa (ícones inline, menu, Base dirigido por dados, clique-fora, Escape)
  CHECK: npx vitest run src/components/__tests__/row-actions.test.tsx && echo ROW_ACTIONS_OK
  EXPECT: ROW_ACTIONS_OK
  EVIDENCE: Test Files 1 passed (1); Tests 8 passed (8); Start at 23:16:12; Duration 2.13s; ROW_ACTIONS_OK

- [x] G2: prova (i) — remover o botão print do invólucro faz (a) falhar nomeando print
  EVIDENCE: AssertionError: expected [ 'receipt_long' ] to deeply equal [ 'receipt_long', 'print' ]; FAIL ícones inline: receipt_long e print; search só com onViewProducts; revertido

- [x] G3: prova (ii) — Copiar Chave sem accessKey faz (a) falhar
  EVIDENCE: AssertionError: expected [ 'Detalhes', 'Copiar Chave', …(3) ] to not include 'Copiar Chave'; FAIL Copiar Chave só aparece com accessKey (e menu mínimo); revertido

- [x] G4: prova (iii) — remover o listener de clique-fora faz (c) falhar
  EVIDENCE: FAIL fecho do menu > clicar fora fecha o menu; AssertionError: expected <button title="Detalhes" …> to be null; revertido

- [x] G5: typecheck limpo
  CHECK: npx tsc --noEmit && echo TSC_OK
  EXPECT: TSC_OK
  EVIDENCE: npx tsc --noEmit exit 0; TSC_OK

- [x] G6: lint limpo
  CHECK: npm run lint --silent && echo LINT_OK
  EXPECT: LINT_OK
  EVIDENCE: npm run lint exit 0; LINT_OK

- [x] G7: verificadores de UI do repo passam
  CHECK: npm run ui:check --silent && echo UI_OK
  EXPECT: UI_OK
  EVIDENCE: APROVADO: 32 violações reprovadas, fixture limpo aprovado; APROVADO: 8 violações reprovadas, fixture limpo aprovado; APROVADO: 4 adulterações reprovadas, componente íntegro aprovado; UI_OK

- [x] G8: suíte completa verde (base 1593 passed / 9 skipped + 8 testes desta folha)
  CHECK: npx vitest run > /dev/null 2>&1 && echo SUITE_OK
  EXPECT: SUITE_OK
  EVIDENCE: SUITE_OK; Test Files 203 passed | 4 skipped (207); Tests 1601 passed | 9 skipped (1610)

- [x] G9: as 5 páginas fiscais continuam a importar o default e a passar invoiceId (ficheiro não editado)
  CHECK: grep -c "import RowActions from '@/components/ui/RowActions'" src/components/contact-details/InvoiceListSection.tsx "src/app/(painel)/fiscal/issued/page-client.tsx" "src/app/(painel)/fiscal/invoices/page-client.tsx" "src/app/(painel)/fiscal/cte/page-client.tsx" "src/app/(painel)/fiscal/nfse-recebidas/page-client.tsx"
  EXPECT: 5
  EVIDENCE: 1\n1\n1\n1\n1 (5 ficheiros, 1 import cada)
