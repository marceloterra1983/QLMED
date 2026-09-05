# Gates: L13 — Gestão do documento (popup, cards recolhidos, tabela compacta)

Scope: `families.ts`, `list.ts`, `ingest.ts`, `pdf-validity.ts`, `page-client.tsx`,
`DocumentosFamilyTable.tsx`, `DocumentoDetalheModal.tsx` (novo), schema + migração
`20260905180000_company_document_emitido_em`, pin em
`scripts/verify-production-migration-window.cjs`, testes da folha, `spec.md`.
Sem dependência nova. Não toca `RowActions.tsx`, `share-email.ts`, `upload.ts`,
`alerts.ts`, `onedrive-port.ts`. Não abre o modal de detalhe na família `balanco`.

Contagem de `it()` nos ficheiros da folha (origin/main → agora):
families 6→8; pdf-validity 25→31; list-contract 12→13; ingest 21→22;
documentos-page 20→22; documentos-detalhe-modal 0→5. Nenhum `it()` dentro de
`afterAll`/`beforeEach`.

- [x] G1: todos os cards recolhidos
  CHECK: npx vitest run src/lib/__tests__/documentos-families.test.ts -t "todos os cards recolhidos" > /dev/null 2>&1 && npx vitest run src/components/__tests__/documentos-page.test.tsx -t "todos os cards recolhidos ao entrar" > /dev/null 2>&1 && echo OK_G1
  EXPECT: OK_G1
  EVIDENCE: OK_G1

- [x] G2: popup de gestão; clique na linha não abre o de atualização
  CHECK: npx vitest run src/components/__tests__/documentos-page.test.tsx -t "abre o modal de gestão" > /dev/null 2>&1 && npx vitest run src/components/__tests__/documentos-detalhe-modal.test.tsx > /dev/null 2>&1 && echo OK_G2
  EXPECT: OK_G2
  EVIDENCE: OK_G2

- [x] G3: emissão da faixa é o início; lastModifiedAt não substitui
  CHECK: npx vitest run src/lib/__tests__/documentos-pdf-validity.test.ts -t "o início é a emissão" > /dev/null 2>&1 && npx vitest run src/components/__tests__/documentos-detalhe-modal.test.tsx -t "não informado" > /dev/null 2>&1 && echo OK_G3
  EXPECT: OK_G3
  EVIDENCE: OK_G3

- [x] G4: quem emite aparece com expira false; todos os tipos têm descricao/orgao
  CHECK: npx vitest run src/components/__tests__/documentos-detalhe-modal.test.tsx -t "quem emite aparece" > /dev/null 2>&1 && npx vitest run src/lib/__tests__/documentos-families.test.ts -t "todos os tipos têm descricao e orgao" > /dev/null 2>&1 && echo OK_G4
  EXPECT: OK_G4
  EVIDENCE: OK_G4

- [x] G5: prova negativa (i) — defaultOpen true numa família
  EVIDENCE: `defaultOpen: true` em `certidao`. Vitest: `AssertionError: certidao: expected true to be false` em `documentos-families.test.ts` ("todos os cards recolhidos"). Revertido.

- [x] G6: prova negativa (ii) — lastModifiedAt como emissão
  EVIDENCE: `emitidoEmTexto` passou a `formatDocumentDate(row.emitidoEm ?? lastModifiedAt)`. Vitest: `Unable to find an element with the text: não informado` e o diálogo mostrou `15/01/2026` em `documentos-detalhe-modal.test.tsx` ("emitidoEm null mostra não informado e ignora lastModifiedAt"). Revertido.

- [x] G7: prova negativa (iii) — faixa devolve o fim como emissão
  EVIDENCE: faixa passou a gravar `emitidoEm = parsed.ymd` (o fim). Vitest: `expected '2026-09-29' to be '2026-08-31'` em `documentos-pdf-validity.test.ts` ("faixa: o início é a emissão e o fim é a validade"). Revertido.

- [x] G8: prova negativa (iv) — esconder quem emite quando expira false
  EVIDENCE: bloco `data-bloco="quem-emite"` envolvido em `row.expira === false ? null : …`. Vitest: `Unable to find an element with the text: Quem emite / onde renovar` em `documentos-detalhe-modal.test.tsx` ("quem emite aparece mesmo quando o documento não vence"). Revertido.

- [x] G9: typecheck, lint e ui:check
  CHECK: npx tsc --noEmit && npm run lint --silent && npm run ui:check --silent && echo TL_UI_OK
  EXPECT: TL_UI_OK
  EVIDENCE: `npx tsc --noEmit` exit 0; `npm run lint --silent` exit 0; `npm run ui:check --silent` APROVADO tokens/dialogs/trap. TL_UI_OK.

- [x] G10: suíte inteira sentinela (&&, sem `| tail`)
  CHECK: npx vitest run > /dev/null 2>&1 && echo SUITE_OK
  EXPECT: SUITE_OK
  EVIDENCE: SUITE_OK. Contagem visível: Test Files 217 passed | 4 skipped (221); Tests 1785 passed | 9 skipped (1794)

- [x] G11: build, validate-docs e pin da migração
  CHECK: npm run build > /dev/null 2>&1 && echo BUILD_OK
  EXPECT: BUILD_OK
  EVIDENCE: BUILD_OK. `npm run build` Compiled successfully; rota `○ /cadastro/documentos`. `node scripts/validate-docs.mjs` → Documentation validation passed (205 Markdown files, 55 IDs).

- [x] G12: migração pinada; janela de produção
  CHECK: node scripts/test-production-migration-window.cjs && echo MIG_OK
  EXPECT: MIG_OK
  EVIDENCE: MIG_OK — `Production migration window static contract passed.` Pin `20260905180000_company_document_emitido_em` sha256 `49acc6d75a6edf5871c6acd82beca81358b01d93dc78acbd82df7f7c053ffb36`.
