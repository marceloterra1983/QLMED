# Gates: L12 — Tela integrada (popup, leitura, ícones, compartilhar, tags)

Scope: `page-client.tsx`, `DocumentosFamilyTable.tsx`, `DocumentoUpdateModal.tsx`,
`DocumentoShareModal.tsx`, `src/app/api/documentos/analisar/route.ts`,
`families.ts`, `list.ts`, testes da folha, `spec.md`. Sem dependência nova.
Não toca `RowActions.tsx`, `upload.ts`, `share-email.ts`, `pdf-validity.ts`.

- [x] G1: linha clicável abre o modal; clique em Ver não abre
  CHECK: npx vitest run src/components/__tests__/documentos-page.test.tsx -t "clicar em Ver não abre o modal de atualização" > /dev/null 2>&1 && npx vitest run src/components/__tests__/documentos-page.test.tsx -t "clicar na linha ou Enter abre" > /dev/null 2>&1 && echo OK_G1
  EXPECT: OK_G1
  EVIDENCE: OK_G1 — CHECK corrigido: o vitest recusa `-t` duas vezes no mesmo comando (exit 1), logo a evidência anterior era impossível de produzir.

- [x] G2: validade lida entra pré-preenchida; nenhuma não bloqueia
  CHECK: npx vitest run src/components/__tests__/documentos-update-modal.test.tsx -t "validade lida entra pré-preenchida" > /dev/null 2>&1 && npx vitest run src/components/__tests__/documentos-update-modal.test.tsx -t "confidence nenhuma" > /dev/null 2>&1 && echo OK_G2
  EXPECT: OK_G2
  EVIDENCE: OK_G2 — mesma correção do G1: dois comandos encadeados por &&.

- [x] G3: compartilhar com zero destinatários desativa o botão
  CHECK: npx vitest run src/components/__tests__/documentos-share-modal.test.tsx -t "não envia com zero destinatários" > /dev/null 2>&1 && echo OK_G3
  EXPECT: OK_G3
  EVIDENCE: OK_G3

- [x] G4: só o FGTS é automático
  CHECK: npx vitest run src/lib/__tests__/documentos-families.test.ts -t "só o FGTS é automático" > /dev/null 2>&1 && echo OK_G4
  EXPECT: OK_G4
  EVIDENCE: OK_G4. `expect(automaticas, 'só o FGTS é automático').toEqual(['crf_fgts'])`

- [x] G5: rota analisar — ACL, só PDF, 5 MB, 200 nenhuma, não grava
  CHECK: npx vitest run src/lib/__tests__/documentos-analisar.test.ts > /dev/null 2>&1 && echo OK_G5
  EXPECT: OK_G5
  EVIDENCE: OK_G5 (8 testes: 401/403, não-PDF, 5 MB, sucesso sem gravação, 200 nenhuma)

- [x] G6: prova negativa (i) — clique em Ver a propagar abre o modal e o teste falha
  EVIDENCE: removi `onClick={stopRowEvent}` da célula de ações. Vitest: `expected <div role="dialog">…Atualizar CND Receita Federal… to be null` em `documentos-page.test.tsx` ("clicar em Ver não abre o modal de atualização"). Revertido.

- [x] G7: prova negativa (ii) — campo de data a ignorar o valor lido faz o teste falhar
  EVIDENCE: `setValidUntil("")` em vez de pré-preencher com `result.validUntil`. Vitest: `expected '' to be '2026-09-29'` em `documentos-update-modal.test.tsx:85` ("validade lida entra pré-preenchida"). Revertido.

- [x] G8: prova negativa (iii) — enviar com zero destinatários faz o teste falhar
  EVIDENCE: removi `disabled={!canSend}` e a guarda `selected.length === 0`. Vitest: `expected false to be true` em `hasAttribute('disabled')` (`documentos-share-modal.test.tsx:68`). Revertido.

- [x] G9: prova negativa (iv) — `cnd_federal` automática faz o teste das tags falhar nomeando o FGTS
  EVIDENCE: `cnd_federal` com `automacao: 'automatica'`. Vitest: `AssertionError: só o FGTS é automático: expected [ 'cnd_federal', 'crf_fgts' ] to deeply equal [ 'crf_fgts' ]` em `documentos-families.test.ts:74`. Revertido.

- [x] G10: typecheck, lint e ui:check
  CHECK: npx tsc --noEmit && npm run lint --silent && npm run ui:check --silent && echo TL_UI_OK
  EXPECT: TL_UI_OK
  EVIDENCE: `npx tsc --noEmit && npm run lint && npm run ui:check && echo TL_UI_OK` → TL_UI_OK (tsc exit 0; lint exit 0; ui:check APROVADO tokens/dialogs/trap)

- [x] G11: suíte inteira sentinela (&&, sem `| tail`)
  CHECK: npx vitest run > /dev/null 2>&1 && echo SUITE_OK
  EXPECT: SUITE_OK
  EVIDENCE: SUITE_OK. Contagem visível com `--reporter=dot`: Test Files 212 passed | 4 skipped (216); Tests 1722 passed | 9 skipped (1731)

- [x] G12: build e validate-docs
  CHECK: npm run build > /dev/null 2>&1 && echo BUILD_OK
  EXPECT: BUILD_OK
  EVIDENCE: `npm run build` Compiled successfully; rota `○ /cadastro/documentos` e `ƒ /api/documentos/analisar`. `node scripts/validate-docs.mjs` → Documentation validation passed (204 Markdown files, 55 IDs).

- [x] G9: resposta atrasada de /analisar não contamina o ficheiro seguinte
  CHECK: npx vitest run src/components/__tests__/documentos-update-modal.test.tsx -t "resposta atrasada" > /dev/null 2>&1 && echo OK_G9
  EXPECT: OK_G9
  EVIDENCE: OK_G9 — controlo negativo: removendo a guarda de sequência, o teste reprova com `expected '2020-01-01' to be '2027-10-10'`. O mesmo padrão foi aplicado ao DocumentoShareModal (seqRef), sem teste dedicado.
