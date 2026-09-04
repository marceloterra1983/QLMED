# Gates: L3 — Funções puras

Scope: src/lib/documentos/{constants,classify,validity}.ts e src/lib/__tests__/documentos-{classify,validity}.test.ts. Sem banco, sem rede.

- [x] G1: fixture com os 24 nomes reais do PLAN — classificação 24/24 e validade 23/24 (o "05.04" sem ano → null)
  CHECK: npx vitest run src/lib/__tests__/documentos-classify.test.ts 2>&1 | tail -4
  EXPECT: /Tests\s+\d+ passed/
  EVIDENCE: Start at  18:06:03 | Duration  136ms (transform 35ms, setup 16ms, import 30ms, tests 6ms, environment 0ms)

- [x] G2: nome em NFD ("certidão" decomposto) classifica igual ao NFC
  CHECK: grep -n "normalize('NFC')\|normalize(\"NFC\")" src/lib/documentos/classify.ts src/lib/documentos/validity.ts
  EXPECT: /normalize/
  EVIDENCE: src/lib/documentos/classify.ts:7:    .normalize('NFC') | src/lib/documentos/validity.ts:25:  const normalized = fileName.normalize('NFC');

- [x] G3: daysRemaining por data civil: (2026-09-04, 2026-09-29)=25; (=)=0; (2026-09-04, 2026-08-13)=-22; virada de dia SP≠UTC coberta
  CHECK: npx vitest run src/lib/__tests__/documentos-validity.test.ts 2>&1 | tail -4
  EXPECT: /Tests\s+\d+ passed/
  EVIDENCE: Start at  18:06:04 | Duration  146ms (transform 37ms, setup 19ms, import 29ms, tests 12ms, environment 0ms)

- [x] G4: statusFor cobre as 6 chaves (ok, atencao, urgente, hoje, vencida, sem_data) e thresholdDue devolve 30 uma vez e null na repetição; -7/-14 após vencer
  CHECK: grep -c "sem_data\|'hoje'\|thresholdDue" src/lib/__tests__/documentos-validity.test.ts
  EXPECT: /[3-9]|[1-9][0-9]/
  EVIDENCE: 12

- [x] G5: teste protege o defeito — reverter a extração da ÚLTIMA data (usar a primeira) faz G1 falhar
  EVIDENCE: matches[0] → FAIL "extrai a última data quando o nome tem duas" AssertionError: expected { date: '2025-12-12' } to deeply equal { date: '2026-12-12' }; revertido → Tests 34 passed

- [x] G6: typecheck e lint limpos
  CHECK: npx tsc --noEmit && npm run lint --silent && echo TL_OK
  EXPECT: TL_OK
  EVIDENCE: (node:3348263) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set. | (Use `node --trace-warnings ...` to show where the warning was created)
