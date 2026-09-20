# Gates: SPEC-084 CI next build sem bootstrap

Scope: o `next build` do CI não dispara rotinas de fundo; job app declara o disable.

- [x] G1: prisma.ts recusa bootstrap em phase-production-build
  CHECK: grep -F "phase-production-build" src/lib/prisma.ts
  EXPECT: phase-production-build
  EVIDENCE: // NEXT_PHASE=phase-production-build cobre o `next build` (Collecting page data). | process.env.NEXT_PHASE !== 'phase-production-build'

- [x] G2: ci.yml job app desliga background services
  CHECK: grep -F "QLMED_DISABLE_BACKGROUND_SERVICES: 'true'" .github/workflows/ci.yml
  EXPECT: QLMED_DISABLE_BACKGROUND_SERVICES: 'true'
  EVIDENCE: QLMED_DISABLE_BACKGROUND_SERVICES: 'true'

- [x] G3: teste de contrato
  CHECK: npx vitest run src/lib/__tests__/prisma-no-bootstrap-on-build.test.ts src/lib/__tests__/background-supervisor.test.ts
  EXPECT: Test Files  2 passed
  EVIDENCE: - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json | Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppres

- [x] G4: docs:validate
  CHECK: npm run docs:validate
  EXPECT: Documentation validation passed
  EVIDENCE: Documentation validation passed (310 Markdown files, 105 IDs). | npm warn Unknown env config "devdir". This will stop working in the next major version of npm. See `npm help npmrc` for supported confi

ABANDON: aumentar RAM dos runners nesta mudança.
