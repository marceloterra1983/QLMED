# Gates: L4 — Ingestão OneDrive + scheduler + health

Scope: src/lib/documentos/ingest.ts, lock key, BackgroundServiceName, wiring no bootstrap. Porta de OneDrive injetável; teste com porta falsa.

- [x] G1: runDocumentosIngest com porta falsa: 24 itens → 24 linhas; segunda passada → 0 upserts novos; item ausente → removedAt; renomeado → mesma linha, nome novo
  CHECK: npx vitest run src/lib/__tests__/documentos-ingest.test.ts 2>&1 | tail -4
  EXPECT: /Tests\s+\d+ passed/
  EVIDENCE: Start at  18:30:05 | Duration  210ms (transform 82ms, setup 16ms, import 35ms, tests 79ms, environment 0ms)

- [x] G2: validUntilSource='manual' nunca é sobrescrito pela ingestão (caso no mesmo teste)
  CHECK: grep -n "manual" src/lib/__tests__/documentos-ingest.test.ts
  EXPECT: manual
  EVIDENCE: 328:    expect(row!.validUntilSource).toBe('manual'); | 329:    expect(row!.validUntil).toEqual(manualDate);

- [x] G3: conexão resolvida SÓ por accountEmail nomeado — sem fallback "qualquer conexão"
  CHECK: grep -n "orderBy: { updatedAt: 'desc' }" src/lib/documentos/ingest.ts; echo "rc=$?"
  EXPECT: rc=1
  EVIDENCE: rc=1

- [x] G4: lock advisory e health registrados
  CHECK: grep -n "documentosIngestLockKey" src/lib/postgres-advisory-lock.ts src/lib/documentos/ingest.ts | wc -l; grep -c "'documentos-ingest'\|'documentos-alert'" src/lib/background-service-health.ts
  EXPECT: /[2-9]\n2/
  EVIDENCE: 3 | 2

- [x] G5: bootstrap inicia o serviço e respeita QLMED_DISABLE_BACKGROUND_SERVICES
  CHECK: grep -n "startDocumentosIngest" src/lib/bootstrap.ts src/lib/documentos/ingest.ts | wc -l
  EXPECT: /[2-9]/
  EVIDENCE: 2

- [x] G6: nenhum log recebe buffer/nome de token (spy em logger como whatsapp-evolution-egress.test.ts)
  CHECK: npx vitest run src/lib/__tests__/documentos-ingest-logs.test.ts 2>&1 | tail -4
  EXPECT: /passed/
  EVIDENCE: Start at  18:30:47 | Duration  181ms (transform 73ms, setup 16ms, import 17ms, tests 67ms, environment 0ms)

- [ ] G7: smoke real no preview :3002 com a conexão de faturamento@ — POST /api/documentos/sync responde 200 e a tabela CompanyDocument tem ≥ 20 linhas
  EVIDENCE: pending

ABANDON: G7 smoke real fica com o driver após o merge

- [x] G8: typecheck e lint limpos
  CHECK: npx tsc --noEmit && npm run lint --silent && echo TL_OK
  EXPECT: TL_OK
  EVIDENCE: (node:3721791) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set. | (Use `node --trace-warnings ...` to show where the warning was created)
