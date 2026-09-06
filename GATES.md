# Gates: Remover divisórias Esta semana / Semana passada

Scope: Listas por data não mostram mais as divisorias "Esta semana", "Semana passada" nem "Próxima semana"; itens vão para o bucket do mês (Hoje permanece). KPI Financeiro "Esta Semana" intacto.

- [x] G1: `getDateGroupLabel` nunca retorna rótulos de semana relativa
  CHECK: cd /home/marce/qlmed/.worktrees/remove-semana-dividers && npm exec -- vitest run src/lib/__tests__/utils.test.ts --reporter=dot 2>&1 | tail -20
  EXPECT: /Test Files\s+1 passed/
  EVIDENCE: Test Files  1 passed (1) | Tests  25 passed (25) | Duration 164ms

- [x] G2: `buildNfeGroups` / split / RelativeMonthGroupBody sem divisórias de semana; itens no mês
  CHECK: cd /home/marce/qlmed/.worktrees/remove-semana-dividers && npm exec -- vitest run src/lib/__tests__/nfe-groups.test.ts src/lib/__tests__/list-collapse.test.ts src/components/ui/__tests__/DateGroupHeader.test.tsx --reporter=dot 2>&1 | tail -24
  EXPECT: /Test Files\s+3 passed/
  EVIDENCE: Test Files  3 passed (3) | Tests  26 passed (26) | Duration 640ms

- [x] G3: Código de UI não renderiza labels/chaves de semana como divisória
  CHECK: cd /home/marce/qlmed/.worktrees/remove-semana-dividers && python3 -c "from pathlib import Path; r=Path('.'); bad=[]; rm=(r/'src/components/ui/RelativeMonthGroupBody.tsx').read_text();
[bad.append('RM:'+s) for s in ['Esta semana','Semana passada','esta_semana','semana_passada'] if s in rm];
u=(r/'src/lib/utils.ts').read_text();
[bad.append('U:'+s) for s in [\"return 'Esta semana'\",\"return 'Semana passada'\",\"return 'Próxima semana'\"] if s in u];
fp=(r/'src/app/(painel)/financeiro/components/FinanceiroPageClient.tsx').read_text();
bad.append('KPI') if \"label: 'Esta Semana'\" not in fp else None;
sp=(r/'specs/053-static-relative-date-groups/spec.md').read_text();
bad.append('SPEC') if 'removidas permanentemente' not in sp else None;
print('BAD:'+','.join([x for x in bad if x]) if any(bad) else 'OK surfaces')"
  EXPECT: /OK surfaces/
  EVIDENCE: OK surfaces (RelativeMonth/utils limpos; KPI Financeiro intacto; SPEC-053 amended)

- [x] G4: Preview fiscal :3002 responde (login redirect ok)
  CHECK: cd /home/marce/qlmed/.worktrees/remove-semana-dividers && code=$(curl -sS -o /tmp/prev-fiscal.html -w '%{http_code}' http://127.0.0.1:3002/fiscal/issued); echo CODE:$code; test "$code" = "200" -o "$code" = "307" -o "$code" = "302" && echo HTTP_OK
  EXPECT: /HTTP_OK/
  EVIDENCE: CODE:307 HTTP_OK (preview apontado para worktree feat/remove-semana-dividers)
