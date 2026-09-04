# Gates: L5 — Rotas API

Scope: src/app/api/documentos/{route.ts,sync/route.ts,upload/route.ts,[id]/route.ts,[id]/arquivo/route.ts} + src/lib/documentos/access.ts. Rotas autenticam, validam (zod) e delegam.

- [ ] G1: scan automático de guardas aceita as 5 rotas novas
  CHECK: npx vitest run src/lib/__tests__/api-route-guards.test.ts 2>&1 | tail -3
  EXPECT: /passed/
  EVIDENCE: pending

- [ ] G2: GET /api/documentos devolve exatamente 6 linhas em `certidoes` na ordem CERTIDAO_KINDS_ORDER, com daysRemaining/status vindos do servidor
  CHECK: npx vitest run src/lib/__tests__/documentos-list-contract.test.ts 2>&1 | tail -3
  EXPECT: /passed/
  EVIDENCE: pending

- [ ] G3: arquivo: 401 sem sessão; 403 sem página; 200 application/pdf; ?download=1 → attachment; conexão nomeada sem fallback
  CHECK: npx vitest run src/lib/__tests__/documentos-arquivo-route.test.ts 2>&1 | tail -3
  EXPECT: /passed/
  EVIDENCE: pending

- [ ] G4: upload: >5 MiB recusado antes de tocar OneDrive; kind inválido 400; sucesso grava no OneDrive (porta mock) com nome padronizado e cria linha manual
  CHECK: npx vitest run src/lib/__tests__/documentos-upload-route.test.ts 2>&1 | tail -3
  EXPECT: /passed/
  EVIDENCE: pending

- [ ] G5: sync/upload/PATCH exigem editor; viewer recebe 403
  CHECK: grep -c "requireEditor" src/app/api/documentos/sync/route.ts src/app/api/documentos/upload/route.ts "src/app/api/documentos/[id]/route.ts"
  EXPECT: /route.ts:1[\s\S]*route.ts:1[\s\S]*route.ts:1/
  EVIDENCE: pending

- [ ] G6: companyId nunca vem do request
  CHECK: grep -n "companyId" src/app/api/documentos -r | grep -i "searchParams\|body\.\|params\." ; echo "rc=$?"
  EXPECT: rc=1
  EVIDENCE: pending

- [ ] G7: typecheck, lint e suíte inteira verdes
  CHECK: npx tsc --noEmit && npm run lint --silent && npx vitest run 2>&1 | tail -3
  EXPECT: /passed/
  EVIDENCE: pending
