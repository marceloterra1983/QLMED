# Gates: nfe-indpres-fixo

Scope: Remover select `indPres` da UI Nova NF-e e fixar sempre `9`
(não presencial — outros) em default/payload/XML/API.

- [x] G1: UI Nova NF-e não renderiza select/campo de presença do comprador
  CHECK: node -e "const fs=require('fs'); const s=fs.readFileSync('src/app/(painel)/fiscal/issued/nova/page-client.tsx','utf8'); const bad=/IND_PRES_OPTIONS|Presença do comprador|setIndPres/.test(s); const hasDefault=/DEFAULT_IND_PRES/.test(s); const payloadUses=/indPres:\\s*DEFAULT_IND_PRES/.test(s); console.log(JSON.stringify({bad,hasDefault,payloadUses})); if(bad||!hasDefault||!payloadUses) process.exit(1);"
  EXPECT: "bad":false
  EVIDENCE: {"bad":false,"hasDefault":true,"payloadUses":true}

- [x] G2: DEFAULT_IND_PRES canônico `9`
  CHECK: rg -n "DEFAULT_IND_PRES\s*=" src/lib/nfe-emission/issued-defaults.ts
  EXPECT: DEFAULT_IND_PRES = '9'
  EVIDENCE: 5:export const DEFAULT_IND_PRES = '9';

- [x] G3: Schema força indPres=9 (ignora valor do client)
  CHECK: rg -n "DEFAULT_IND_PRES|indPres" src/lib/nfe-emission/schema.ts
  EXPECT: DEFAULT_IND_PRES
  EVIDENCE: 2:import { DEFAULT_IND_PRES, DEFAULT_SERIES } from './issued-defaults'; | 41:  indPres: z.preprocess(() => DEFAULT_IND_PRES, z.literal(DEFAULT_IND_PRES)),

- [x] G4: Vitest indPres fixo passa
  CHECK: npx vitest run src/lib/__tests__/nfe-emission-indpres-fixo.test.ts --reporter=dot
  EXPECT: Test Files  1 passed
  EVIDENCE: Start at  20:24:37 | Duration  210ms (transform 64ms, setup 0ms, import 106ms, tests 7ms, environment 0ms)

- [x] G5: Typecheck
  CHECK: npx tsc --noEmit
  EXPECT: 
  EVIDENCE: (no output)

- [x] G6: Lint dos arquivos tocados
  CHECK: npx eslint "src/app/(painel)/fiscal/issued/nova/page-client.tsx" src/lib/nfe-emission/schema.ts src/lib/__tests__/nfe-emission-indpres-fixo.test.ts
  EXPECT: 
  EVIDENCE: (no output)

- [x] G7: SPEC-025 documenta indPres fixo 9 sem campo na UI
  CHECK: node -e "const fs=require('fs'); const s=fs.readFileSync('specs/025-emissao-nota-fiscal/spec.md','utf8'); const ok=/\*\*FR-024\*\*:/.test(s) && /DEFAULT_IND_PRES/.test(s) && /não presencial/.test(s); console.log(JSON.stringify({hasFr024:/\*\*FR-024\*\*:/.test(s),ok})); if(!ok) process.exit(1);"
  EXPECT: "hasFr024":true
  EVIDENCE: {"hasFr024":true,"ok":true}
