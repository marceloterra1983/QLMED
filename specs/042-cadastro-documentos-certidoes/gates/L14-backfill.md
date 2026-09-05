# Gates: L14 — Backfill de emitidoEm em lote

Scope: `backfill-emissao.ts` (novo), `POST /api/documentos/backfill-emissao`
(novo), testes, `constants.ts` (limites), `page-client.tsx` (botão),
`documentos-page.test.tsx`, `spec.md` FR-041/AC-031. Sem dependência nova.
Não toca `ingest.ts`, `list.ts`, `families.ts`, `alerts.ts`, `upload.ts`,
`share-email.ts`, `pdf-validity.ts`, `RowActions.tsx`. Sem coluna nova.

Contagem de `it()`: documentos-backfill-emissao 0→16; documentos-page 22→24.
Nenhum `it()` dentro de `afterAll`/`beforeEach`.

- [x] G1: ficheiro grande ignorado sem materializar
  CHECK: npx vitest run src/lib/__tests__/documentos-backfill-emissao.test.ts -t "ficheiro grande é ignorado sem materializar" 2>&1 | grep -qE "Tests +[1-9][0-9]* passed" && echo OK_G1
  EXPECT: OK_G1
  EVIDENCE: OK_G1

- [x] G2: PDF sem emissão não grava lastModifiedAt
  CHECK: npx vitest run src/lib/__tests__/documentos-backfill-emissao.test.ts -t "PDF sem emissão não grava lastModifiedAt em emitidoEm" 2>&1 | grep -qE "Tests +[1-9][0-9]* passed" && echo OK_G2
  EXPECT: OK_G2
  EVIDENCE: OK_G2

- [x] G3: update só envia emitidoEm
  CHECK: npx vitest run src/lib/__tests__/documentos-backfill-emissao.test.ts -t "só toca em emitidoEm" 2>&1 | grep -qE "Tests +[1-9][0-9]* passed" && echo OK_G3
  EXPECT: OK_G3
  EVIDENCE: OK_G3

- [x] G4: downloads em série
  CHECK: npx vitest run src/lib/__tests__/documentos-backfill-emissao.test.ts -t "não dispara downloads em paralelo" 2>&1 | grep -qE "Tests +[1-9][0-9]* passed" && echo OK_G4
  EXPECT: OK_G4
  EVIDENCE: OK_G4

- [x] G5: um lote na UI, toast, sem laço
  CHECK: npx vitest run src/components/__tests__/documentos-page.test.tsx -t "um lote, toast com resumo" 2>&1 | grep -qE "Tests +[1-9][0-9]* passed" && echo OK_G5
  EXPECT: OK_G5
  EVIDENCE: OK_G5

- [x] G6: ficheiro de backfill inteiro
  CHECK: npx vitest run src/lib/__tests__/documentos-backfill-emissao.test.ts 2>&1 | grep -qE "Tests +[1-9][0-9]* passed" && echo OK_G6
  EXPECT: OK_G6
  EVIDENCE: OK_G6 (16 tests passed)

- [x] G7: prova negativa (i) — remover o teto de tamanho
  EVIDENCE: removi `exceedsUploadCap(row.fileSize)` da guarda. Vitest: `expected "vi.fn()" to not be called with arguments: [ 'od-a-large' ]` em "ficheiro grande é ignorado sem materializar" (`downloadPdf` chamado 2 vezes). Revertido.

- [x] G8: prova negativa (ii) — lastModifiedAt como emissão
  EVIDENCE: `parsed.emitidoEm ?? toYmd(row.lastModifiedAt)`. Vitest: `expected 1 to be +0` em `result.preenchidos` no teste "PDF sem emissão não grava lastModifiedAt em emitidoEm". Revertido.

- [x] G9: prova negativa (iii) — escrever também validUntil
  EVIDENCE: `data: { emitidoEm, validUntil: row.validUntil }`. Vitest: `expected [ 'emitidoEm', 'validUntil' ] to deeply equal [ 'emitidoEm' ]` em "só toca em emitidoEm". Revertido.

- [x] G10: prova negativa (iv) — Promise.all nos downloads
  EVIDENCE: `await Promise.all(chosen.map(... downloadPdf ...))`. Vitest: `expected 3 to be 1` em `maxInFlight` no teste "não dispara downloads em paralelo". Revertido.

- [x] G11: typecheck, lint e ui:check
  CHECK: npx tsc --noEmit && npm run lint --silent && npm run ui:check --silent && echo TL_UI_OK
  EXPECT: TL_UI_OK
  EVIDENCE: `npx prisma generate && npx tsc --noEmit` exit 0; `npm run lint` exit 0; `npm run ui:check` APROVADO tokens/dialogs/trap. TL_UI_OK.

- [x] G12: suíte inteira sentinela (&&, sem `| tail`)
  CHECK: npx vitest run > /dev/null 2>&1 && echo SUITE_OK
  EXPECT: SUITE_OK
  EVIDENCE: SUITE_OK. Contagem visível: Test Files 218 passed | 4 skipped (222); Tests 1808 passed | 9 skipped (1817)

- [x] G13: build e validate-docs
  CHECK: npm run build > /dev/null 2>&1 && echo BUILD_OK
  EXPECT: BUILD_OK
  EVIDENCE: BUILD_OK. `npm run build` Compiled successfully; rota `ƒ /api/documentos/backfill-emissao`; página `○ /cadastro/documentos`. `node scripts/validate-docs.mjs` → Documentation validation passed (205 Markdown files, 55 IDs).
