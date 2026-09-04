# Gates: L4 — Ingestão OneDrive + scheduler + health

Scope: src/lib/documentos/ingest.ts, lock key, BackgroundServiceName, wiring no bootstrap. Porta de OneDrive injetável; teste com porta falsa.

- [ ] G1: runDocumentosIngest com porta falsa: 24 itens → 24 linhas; segunda passada → 0 upserts novos; item ausente → removedAt; renomeado → mesma linha, nome novo
  CHECK: npx vitest run src/lib/__tests__/documentos-ingest.test.ts 2>&1 | tail -4
  EXPECT: /Tests\s+\d+ passed/
  EVIDENCE: pending

- [ ] G2: validUntilSource='manual' nunca é sobrescrito pela ingestão (caso no mesmo teste)
  CHECK: grep -n "manual" src/lib/__tests__/documentos-ingest.test.ts
  EXPECT: manual
  EVIDENCE: pending

- [ ] G3: conexão resolvida SÓ por accountEmail nomeado — sem fallback "qualquer conexão"
  CHECK: grep -n "orderBy: { updatedAt: 'desc' }" src/lib/documentos/ingest.ts; echo "rc=$?"
  EXPECT: rc=1
  EVIDENCE: pending

- [ ] G4: lock advisory e health registrados
  CHECK: grep -n "documentosIngestLockKey" src/lib/postgres-advisory-lock.ts src/lib/documentos/ingest.ts | wc -l; grep -c "'documentos-ingest'\|'documentos-alert'" src/lib/background-service-health.ts
  EXPECT: /[2-9]\n2/
  EVIDENCE: pending

- [ ] G5: bootstrap inicia o serviço e respeita QLMED_DISABLE_BACKGROUND_SERVICES
  CHECK: grep -n "startDocumentosIngest" src/lib/bootstrap.ts src/lib/documentos/ingest.ts | wc -l
  EXPECT: /[2-9]/
  EVIDENCE: pending

- [ ] G6: nenhum log recebe buffer/nome de token (spy em logger como whatsapp-evolution-egress.test.ts)
  CHECK: npx vitest run src/lib/__tests__/documentos-ingest-logs.test.ts 2>&1 | tail -3
  EXPECT: /passed/
  EVIDENCE: pending

- [ ] G7: smoke real no preview :3002 com a conexão de faturamento@ — POST /api/documentos/sync responde 200 e a tabela CompanyDocument tem ≥ 20 linhas
  EVIDENCE: pending

- [ ] G8: typecheck e lint limpos
  CHECK: npx tsc --noEmit && npm run lint --silent && echo TL_OK
  EXPECT: TL_OK
  EVIDENCE: pending
