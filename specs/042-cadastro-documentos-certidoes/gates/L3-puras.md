# Gates: L3 — Funções puras

Scope: src/lib/documentos/{constants,classify,validity}.ts e src/lib/__tests__/documentos-{classify,validity}.test.ts. Sem banco, sem rede.

- [ ] G1: fixture com os 24 nomes reais do PLAN — classificação 24/24 e validade 23/24 (o "05.04" sem ano → null)
  CHECK: npx vitest run src/lib/__tests__/documentos-classify.test.ts 2>&1 | tail -4
  EXPECT: /Tests\s+\d+ passed/
  EVIDENCE: pending

- [ ] G2: nome em NFD ("certidão" decomposto) classifica igual ao NFC
  CHECK: grep -n "normalize('NFC')\|normalize(\"NFC\")" src/lib/documentos/classify.ts src/lib/documentos/validity.ts
  EXPECT: /normalize/
  EVIDENCE: pending

- [ ] G3: daysRemaining por data civil: (2026-09-04, 2026-09-29)=25; (=)=0; (2026-09-04, 2026-08-13)=-22; virada de dia SP≠UTC coberta
  CHECK: npx vitest run src/lib/__tests__/documentos-validity.test.ts 2>&1 | tail -4
  EXPECT: /Tests\s+\d+ passed/
  EVIDENCE: pending

- [ ] G4: statusFor cobre as 6 chaves (ok, atencao, urgente, hoje, vencida, sem_data) e thresholdDue devolve 30 uma vez e null na repetição; -7/-14 após vencer
  CHECK: grep -c "sem_data\|'hoje'\|thresholdDue" src/lib/__tests__/documentos-validity.test.ts
  EXPECT: /[3-9]|[1-9][0-9]/
  EVIDENCE: pending

- [ ] G5: teste protege o defeito — reverter a extração da ÚLTIMA data (usar a primeira) faz G1 falhar
  EVIDENCE: pending

- [ ] G6: typecheck e lint limpos
  CHECK: npx tsc --noEmit && npm run lint --silent && echo TL_OK
  EXPECT: TL_OK
  EVIDENCE: pending
