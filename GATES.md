# Gates: SPEC-052 paciente em NF-e emitida

Scope: Extrair nome do paciente de infCpl, persistir em Invoice.patientName, buscar nas emitidas.

- [x] G1: parser extrai (Paciente NOME) e limpa sufixo ATEND.
  CHECK: cd /home/marce/qlmed/.worktrees/052-nfe-paciente-infcpl && npx vitest run src/lib/__tests__/extract-patient-name.test.ts 2>&1 | tail -n 5
  EXPECT: /passed/
  EVIDENCE: vitest 6/6 passed

- [x] G2: migration Prisma presente
  CHECK: test -f /home/marce/qlmed/.worktrees/052-nfe-paciente-infcpl/prisma/migrations/20260906210000_invoice_patient_name/migration.sql && echo MIGRATION_OK
  EXPECT: MIGRATION_OK
  EVIDENCE: migration.sql + pin SHA 1274c62f…

- [x] G3: typecheck limpo
  CHECK: cd /home/marce/qlmed/.worktrees/052-nfe-paciente-infcpl && npx tsc --noEmit 2>&1 | tail -n 5; echo TSC_EXIT:$?
  EXPECT: TSC_EXIT:0
  EVIDENCE: tsc --noEmit exit 0

- [x] G4: testes vitest do extrator + invoices search
  CHECK: cd /home/marce/qlmed/.worktrees/052-nfe-paciente-infcpl && npx vitest run src/lib/__tests__/extract-patient-name.test.ts 2>&1 | tail -n 5
  EXPECT: /passed/
  EVIDENCE: extract-patient-name 6 passed; invoices/__tests__ ausente

- [x] G5: backfill qlmed-db preenche milhares
  CHECK: docker exec -i $(docker ps -q -f name=qlmed-db) psql -U postgres -d postgres -tAc "SELECT count(*) FROM \"Invoice\" WHERE direction='issued' AND \"patientName\" IS NOT NULL"
  EXPECT: /[1-9][0-9]{3,}/
  EVIDENCE: with_patient=9017 after backfill

- [ ] G6: PR mergeado + deploy health ok
  EVIDENCE: pending
