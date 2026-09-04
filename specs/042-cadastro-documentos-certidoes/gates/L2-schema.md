# Gates: L2 — Schema + migração

Scope: enum CompanyDocumentKind, modelos CompanyDocument e CompanyDocumentIngestState, relações em Company, migração versionada. Nenhum runtime DDL.

- [ ] G1: schema contém os dois modelos e o enum exatamente como no contrato do PLAN
  CHECK: grep -c "^model CompanyDocument \|^model CompanyDocumentIngestState \|^enum CompanyDocumentKind " prisma/schema.prisma
  EXPECT: 3
  EVIDENCE: pending

- [ ] G2: migração criada com nome datado e SQL contém CREATE TABLE dos dois modelos
  CHECK: ls prisma/migrations | grep -E "^[0-9]{14}_company_document$" && grep -l "CompanyDocumentIngestState" prisma/migrations/*_company_document/migration.sql
  EXPECT: migration.sql
  EVIDENCE: pending

- [ ] G3: prisma generate e typecheck ok
  CHECK: npx prisma generate >/dev/null && npx tsc --noEmit && echo GEN_OK
  EXPECT: GEN_OK
  EVIDENCE: pending

- [ ] G4: verificadores de migração/reconciliação do repo passam (exigem DATABASE_URL de CI descartável — ver README do script)
  CHECK: npm run db:migrate:verify --silent && npm run db:reconcile:verify --silent && echo MIG_OK
  EXPECT: MIG_OK
  EVIDENCE: pending

- [ ] G5: teste de schema existente continua verde (cascade/FK)
  CHECK: npx vitest run src/lib/__tests__/audit-l8-schema.test.ts 2>&1 | tail -3
  EXPECT: /passed/
  EVIDENCE: pending
