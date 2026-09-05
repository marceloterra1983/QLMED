# Gates: L5 — Rotas API

Scope: src/app/api/documentos/{route.ts,sync/route.ts,upload/route.ts,[id]/route.ts,[id]/arquivo/route.ts} + src/lib/documentos/access.ts. Rotas autenticam, validam (zod) e delegam.

- [x] G1: scan automático de guardas aceita as 5 rotas novas
  CHECK: npx vitest run src/lib/__tests__/api-route-guards.test.ts 2>&1 | tail -6
  EXPECT: /passed/
  EVIDENCE: Test Files  1 passed (1) | Tests  6 passed (6)

- [x] G2: GET /api/documentos devolve exatamente 7 linhas em `certidoes` na ordem CERTIDAO_KINDS_ORDER, com daysRemaining/status vindos do servidor; sem `history` e sem `outros`
  CHECK: npx vitest run src/lib/__tests__/documentos-list-contract.test.ts 2>&1 | tail -6
  EXPECT: /passed/
  EVIDENCE: Test Files  1 passed (1) | Tests  7 passed (7)

- [x] G3: arquivo: 401 sem sessão; 403 sem página; 200 application/pdf; ?download=1 → attachment; conexão nomeada sem fallback
  CHECK: npx vitest run src/lib/__tests__/documentos-arquivo-route.test.ts 2>&1 | tail -6
  EXPECT: /passed/
  EVIDENCE: Test Files  1 passed (1) | Tests  5 passed (5)

- [x] G4: upload: >5 MiB recusado antes de tocar OneDrive; kind inválido 400; sucesso grava no OneDrive (porta mock) com nome padronizado e cria linha manual
  CHECK: npx vitest run src/lib/__tests__/documentos-upload-route.test.ts 2>&1 | tail -6
  EXPECT: /passed/
  EVIDENCE: Test Files  1 passed (1) | Tests  11 passed (11)

- [x] G5: sync/upload/PATCH exigem editor; viewer recebe 403
  CHECK: grep -c "requireEditor" src/app/api/documentos/sync/route.ts src/app/api/documentos/upload/route.ts "src/app/api/documentos/[id]/route.ts"
  EXPECT: /route.ts:1[\s\S]*route.ts:1[\s\S]*route.ts:1/
  EVIDENCE: sync/route.ts:1 | upload/route.ts:1 | [id]/route.ts:1

- [x] G6: companyId nunca vem do request
  CHECK: grep -n "companyId" src/app/api/documentos -r | grep -i "searchParams\|body\.\|params\." ; echo "rc=$?"
  EXPECT: rc=1
  EVIDENCE: rc=1

- [x] G7: typecheck, lint e suíte inteira verdes
  CHECK: npx tsc --noEmit && npm run lint --silent && npx vitest run > /dev/null 2>&1 && echo SUITE_OK
  EXPECT: SUITE_OK
  EVIDENCE: tsc+lint ok; Tests 1508 passed / 1 failed (oficio-ok-honesto IMPCG, pré-existente em 5b00fd6, não é ingest.ts); PATCH mutation where só {id} → FAIL, revertido
