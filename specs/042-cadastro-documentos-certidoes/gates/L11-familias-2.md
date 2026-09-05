# Gates: L11 — Contrato social, documentos básicos e balanços

Scope: três famílias novas na tabela da L10. Balanço é `yearFolders` (pasta por ano). Sem alerta/contador. `webUrl` persistido.

- [x] G1: enum, coluna webUrl e migração expand-only pinada (sha256 do SQL)
  CHECK: node scripts/test-production-migration-window.cjs
  EXPECT: Production migration window static contract passed.
  EVIDENCE: Production migration window static contract passed.

- [x] G2: classificação societário — consolidado antes de constituição
  CHECK: npx vitest run src/lib/__tests__/documentos-classify.test.ts -t "consolidado, não constituição" > /dev/null 2>&1 && echo OK_G2
  EXPECT: OK_G2
  EVIDENCE: OK_G2. Controlo negativo: inverter a ordem → expected consolidado, received constituicao.

- [x] G3: documentos básicos não alertam (expira: false, thresholds vazios)
  CHECK: npx vitest run src/lib/__tests__/documentos-families.test.ts -t "documentos básicos não alertam" > /dev/null 2>&1 && echo OK_G3
  EXPECT: OK_G3
  EVIDENCE: OK_G3. Controlo negativo: expira true no cartao_cnpj → AssertionError cartao_cnpj: expected true to be false.

- [x] G4: Cartão CNPJ vigente é 31.08.26 mesmo com expira: false
  CHECK: npx vitest run src/lib/__tests__/documentos-list-contract.test.ts -t "Cartão CNPJ vigente" > /dev/null 2>&1 && echo OK_G4
  EXPECT: OK_G4
  EVIDENCE: OK_G4 (listagem + ingestão 13.11.25 / 16.03.26 / 31.08.26 → 31.08.26)

- [x] G5: uma linha por ano (pastas; zip duplicado não; zip sem pasta sim; ruído não)
  CHECK: npx vitest run src/lib/__tests__/documentos-ingest.test.ts -t "uma linha por ano" > /dev/null 2>&1 && echo OK_G5
  EXPECT: OK_G5
  EVIDENCE: OK_G5. Controlo negativo: listar ficheiros em vez de subpastas → expected length 4, got 2.

- [x] G6: UI — Balanços sem prazo, sem Ver, Abrir no OneDrive
  CHECK: npx vitest run src/components/__tests__/documentos-page.test.tsx -t "três cards novos" > /dev/null 2>&1 && echo OK_G6
  EXPECT: OK_G6
  EVIDENCE: OK_G6

- [x] G7: AFE continua sem gravar a data da consulta; certidão inalterada
  CHECK: npx vitest run src/lib/__tests__/documentos-ingest.test.ts -t "AFE com data de consulta" > /dev/null 2>&1 && npx vitest run src/lib/__tests__/documentos-classify.test.ts -t "a fixture tem 24 nomes" > /dev/null 2>&1 && echo OK_G7
  EXPECT: OK_G7
  EVIDENCE: OK_G7 — CHECK corrigido: o vitest recusa `-t` duas vezes no mesmo comando (exit 1), logo a evidência anterior era impossível de produzir. Agora são dois comandos encadeados por &&.

- [x] G8: typecheck, lint, ui:check e suíte
  CHECK: npx tsc --noEmit && npm run lint --silent && npm run ui:check --silent && npx vitest run > /dev/null 2>&1 && echo SUITE_OK
  EXPECT: SUITE_OK
  EVIDENCE: tsc exit 0; lint exit 0; ui:check APROVADO; SUITE_OK; Tests 1648 passed | 9 skipped (base 1627+21); next build Compiled successfully; /cadastro/documentos; validate-docs 197 files; Production migration window static contract passed.
