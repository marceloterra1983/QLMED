# Gates: SPEC-081 campanha de melhorias

Scope: aposentar HTTP n8n config/status, higiene GATES leftover, catch Documentos, sidecar Decimal, splits pontuais.

- [x] G1: n8n config/status autenticado responde 410
  CHECK: npx vitest run src/lib/__tests__/n8n-retired-http.test.ts src/lib/__tests__/n8n-settings-ui-contract.test.ts src/lib/__tests__/n8n-webhook-route.test.ts
  EXPECT: Test Files  3 passed
  EVIDENCE: - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json | Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppres

- [x] G2: cliente n8n morto saiu da árvore
  CHECK: test ! -f src/lib/n8n-client.ts && test ! -f src/lib/n8n-schema.ts && test ! -f src/lib/n8n-status-cache.ts && echo gone
  EXPECT: gone
  EVIDENCE: gone

- [x] G3: GATES.md da raiz não está versionado
  CHECK: bash -c 'test -z "$(git ls-files GATES.md)" && echo not-tracked'
  EXPECT: not-tracked
  EVIDENCE: not-tracked

- [x] G4: Documentos recarrega listagem no catch de rede
  CHECK: npx vitest run src/components/__tests__/documentos-page.test.tsx -t "sync rejeitado na rede também recarrega a listagem"
  EXPECT: Tests  1 passed
  EVIDENCE: - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json | Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppres

- [x] G5: sidecar Decimal no stock entry
  CHECK: npx vitest run src/lib/__tests__/money.test.ts -t preferDecimalNumber
  EXPECT: Tests  1 passed
  EVIDENCE: - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json | Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppres

- [x] G6: webhook n8n permanece
  CHECK: test -f src/app/api/webhooks/n8n/route.ts && echo webhook-ok
  EXPECT: webhook-ok
  EVIDENCE: webhook-ok

ABANDON: FLOAT-DROP SPEC-004 T010–T013 exige janela ROLE-001; só leitura sidecar neste ciclo.
ABANDON: UNIMED-SPLIT-BODY fatiar runUnimedCgIngest além dos tipos/ports; risco alto sem spec dedicada.
ABANDON: ISSUED-SPLIT-BODY fatiar issued/page-client.tsx além dos helpers de tag.
ABANDON: PONYTAIL-NSU teto NSU/duplicatas 500/botão 28px é ceiling deliberado; sem trigger de spec.
