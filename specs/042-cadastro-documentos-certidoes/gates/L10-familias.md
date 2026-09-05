# Gates: L10 — Famílias de documento (sanitária + carta)

Scope: generalizar o motor de documentos sobre `DOCUMENTOS_FAMILIES`. Três cards na mesma página. AFE não vence. Sem duplicar o motor.

- [x] G1: enum e migração expand-only pinada (sha256 do SQL)
  CHECK: node scripts/test-production-migration-window.cjs
  EXPECT: Production migration window static contract passed.
  EVIDENCE: Production migration window static contract passed. | OK_G1

- [x] G2: classificação sanitária pelos nomes reais; protocolo/publicação ≠ AFE; carta sem data
  CHECK: npx vitest run src/lib/__tests__/documentos-classify.test.ts > /dev/null 2>&1 && echo OK_G2
  EXPECT: OK_G2
  EVIDENCE: OK_G2

- [x] G3: AFE nunca alerta (expira: false na tabela, não um if espalhado)
  CHECK: npx vitest run src/lib/__tests__/documentos-alert-tick.test.ts -t "AFE nunca alerta" > /dev/null 2>&1 && echo OK_G3
  EXPECT: OK_G3
  EVIDENCE: OK_G3

- [x] G4: limiares sanitária 90/60 distintos da certidão
  CHECK: npx vitest run src/lib/__tests__/documentos-alert-tick.test.ts -t "sanitária alerta no limiar 90" > /dev/null 2>&1 && echo OK_G4
  EXPECT: OK_G4
  EVIDENCE: OK_G4

- [x] G5: carta sem data não alerta
  CHECK: npx vitest run src/lib/__tests__/documentos-alert-tick.test.ts -t "carta sem data não alerta" > /dev/null 2>&1 && echo OK_G5
  EXPECT: OK_G5
  EVIDENCE: OK_G5

- [x] G6: listagem devolve 7 certidões + 6 sanitárias; AFE mostra não vence
  CHECK: npx vitest run src/lib/__tests__/documentos-list-contract.test.ts > /dev/null 2>&1 && echo OK_G6
  EXPECT: OK_G6
  EVIDENCE: OK_G6

- [x] G7: motor itera DOCUMENTOS_FAMILIES; AFE não é um if de kind no alerta
  CHECK: npx vitest run src/lib/__tests__/documentos-families.test.ts > /dev/null 2>&1 && echo OK_G7
  EXPECT: OK_G7
  EVIDENCE: OK_G7

- [x] G8: UI — três cards, AFE "não vence", certidões inalteradas
  CHECK: npx vitest run src/components/__tests__/documentos-page.test.tsx > /dev/null 2>&1 && echo OK_G8
  EXPECT: OK_G8
  EVIDENCE: OK_G8

- [x] G9: ingestão AFE não grava a data da consulta; carta sem data fica null
  CHECK: npx vitest run src/lib/__tests__/documentos-ingest.test.ts > /dev/null 2>&1 && echo OK_G9
  EXPECT: OK_G9
  EVIDENCE: OK_G9

- [x] G10: typecheck, lint, ui:check e suíte
  CHECK: npx tsc --noEmit && npm run lint --silent && npm run ui:check --silent && npx vitest run > /dev/null 2>&1 && echo SUITE_OK
  EXPECT: SUITE_OK
  EVIDENCE: tsc exit 0; lint exit 0; UI_OK; Tests 1627 passed | 9 skipped; next build Compiled successfully; /cadastro/documentos; SUITE_OK
