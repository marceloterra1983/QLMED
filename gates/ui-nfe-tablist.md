# Gates: faixa de abas do NfeDetailsModal vira tablist

Base: `origin/main` @ e6eba6f · branch `feat/nfe-modal-tablist`

Hoje as 8 abas são `button[aria-pressed]` soltos: leitor de tela anuncia
"botão pressionado", não "aba 4 de 8", e o teclado exige Tab por cada aba.

- [x] G1 Marcação: 1 `role="tablist"` nomeado, 8 `role="tab"` com `aria-selected`
      e `aria-controls`, 1 `role="tabpanel"` com `aria-labelledby` da aba ativa,
      zero `aria-pressed` no modal.
      CHECK: npx vitest run src/components/__tests__/NfeDetailsModal.tabs.test.tsx 2>&1 | grep -E "Tests "
      EXPECT: passed, 0 failed
      EVIDENCE: `Tests  4 passed (4)` (tabs + teclado); 1 tablist, 8 tabs, 1 aria-selected, 7 tabindex=-1, tabpanel labelledby, sem aria-pressed
- [x] G2 Teclado: setas ←/→ circulam, Home/End vão às pontas, outras teclas não
      interferem — decisão pura em `lib/tabs-keyboard.ts`, com teste.
      CHECK: npx vitest run src/lib/__tests__/tabs-keyboard.test.ts 2>&1 | grep -E "Tests "
      EXPECT: passed, 0 failed
      EVIDENCE: `Tests  4 passed (4)`; setas circulam (7→0, 0→7), Home/End, Tab/Enter/vazio → null
- [x] G3 Controlo positivo: o teste de marcação falha contra o componente antigo
      (stash do NfeDetailsModal.tsx).
      EVIDENCE: com `git stash` do NfeDetailsModal.tsx: `× é um tablist nomeado…` — `Tests 1 failed (1)`
- [x] G4 tsc, eslint e `ui:check` limpos.
      CHECK: npx tsc --noEmit >/dev/null && npx eslint src/components/NfeDetailsModal.tsx src/lib/tabs-keyboard.ts && npm run -s ui:check 2>&1 | tail -1
      EXPECT: APROVADO
      EVIDENCE: tsc ok · eslint ok · `APROVADO: 4 adulterações reprovadas, componente íntegro aprovado`
- [x] G5 PR aberto, CI verde, squash-merge no main.
      EVIDENCE: PR #280 — quality/app/changes success — squash-merge em origin/main 060f253
