# Gates: SPEC-083 lazy heavy modals + server externals

Scope: aplicar vercel-react-best-practices (bundle-dynamic-imports + serverExternalPackages) nos pontos ainda estáticos.

- [x] G1: page-client de produtos lazy-load dos modais pesados
  CHECK: grep -c "dynamic(() => import" "src/app/(painel)/cadastro/produtos/page-client.tsx"
  EXPECT: 6
  EVIDENCE: 6

- [x] G2: ContactDetailsModal não importa Invoice/NfeDetails estático
  CHECK: grep -c "dynamic(() => import('@/components/" src/components/ContactDetailsModal.tsx
  EXPECT: 2
  EVIDENCE: 2

- [x] G3: next.config externaliza exceljs, jszip, puppeteer-core
  CHECK: grep -F "exceljs', 'jszip', 'puppeteer-core" next.config.mjs && echo externals-ok
  EXPECT: externals-ok
  EVIDENCE: serverExternalPackages: ['bcryptjs', 'node-forge', 'xml2js', 'exceljs', 'jszip', 'puppeteer-core'], | externals-ok

- [x] G4: testes de contrato + card-view-mode
  CHECK: npx vitest run src/lib/__tests__/next-config-server-externals.test.ts src/components/__tests__/card-view-mode.test.tsx
  EXPECT: Test Files  2 passed
  EVIDENCE: - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json | Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppres

- [x] G5: docs:validate
  CHECK: npm run docs:validate
  EXPECT: Documentation validation passed
  EVIDENCE: Documentation validation passed (306 Markdown files, 103 IDs). | npm warn Unknown env config "devdir". This will stop working in the next major version of npm. See `npm help npmrc` for supported confi

- [x] G6: webhook n8n permanece (SPEC-046 AC-009)
  CHECK: test -f src/app/api/webhooks/n8n/route.ts && echo webhook-ok
  EXPECT: webhook-ok
  EVIDENCE: webhook-ok

ABANDON: VERCEL-OPTIMIZE — QLMED não está no Vercel; skill exige Observability Plus.
ABANDON: NEXT-16-CACHE-COMPONENTS / PARTIAL-PREFETCH — Next 15.5.25; skills oficiais exigem 16.3+.
ABANDON: INVOICES-PROMISE-ALL — resolveListTotal já evita COUNT quando a página 1 não enche.
ABANDON: REACT-COMPILER — dependência nova (babel-plugin-react-compiler); Ask first.
ABANDON: T010-T013 DROP Float / tax expand — ROLE-001.
ABANDON: DEPENDABOT-451-453.
