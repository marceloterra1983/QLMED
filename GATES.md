# Gates: Emissão de NF-e atômica (auditoria b177b07, backlog 1)

Scope: fechar QLMED-FISCAL-001 (reentrada do rascunho), -002 (PATCH em paralelo
com o send), -003 (sem unique de série+número), -004 (estado SEFAZ incerto
apagado) e -005 (persistência pós-autorização não atômica).

Invariante: **um rascunho produz no máximo um `enviNFe` autorizado**, e um
estado incerto na SEFAZ nunca vira reemissão cega.

Base: `origin/main` b177b07. Worktree `/home/marce/qlmed/.worktrees/nfe-emissao-atomica`.
Rodar com o cwd no worktree.

- [x] G1: CAS de estado — o send só acontece depois de um UPDATE condicional que
  sai de `draft`/`rejected`.
  CHECK: grep -q "status: { in: \['draft', 'rejected'\] }" src/lib/nfe-emission/authorize.ts && echo G1_CAS_OK
  EXPECT: G1_CAS_OK
  EVIDENCE: G1_CAS_OK

- [x] G2: Erro de transporte não apaga número nem chave no caminho de envio.
  CHECK: test "$(sed -n '/} catch (error) {/,/^  }$/p' src/lib/nfe-emission/authorize.ts | grep -c 'number: null')" = 0 && echo G2_SEM_WIPE
  EXPECT: G2_SEM_WIPE
  EVIDENCE: G2_SEM_WIPE

- [x] G3: Cliente de NFeConsultaProtocolo existe e é usado na reentrada.
  CHECK: grep -q "export async function consultarNfeProtocolo" src/lib/nfe-emission/autorizacao-client.ts && grep -q "resolveSubmittedEmission" src/lib/nfe-emission/authorize.ts && echo G3_CONSULTA_OK
  EXPECT: G3_CONSULTA_OK
  EVIDENCE: G3_CONSULTA_OK

- [x] G4: O desfecho vem do `infProt`, não do primeiro cStat da árvore, e isso
  é provado por parse de resposta real da SEFAZ (não por grep).
  CHECK: npx vitest run src/lib/__tests__/nfe-emission-autorizacao-response.test.ts 2>&1 | grep -E "^ +Tests +[0-9]+ passed"
  EXPECT: /5 passed/
  EVIDENCE: Tests  5 passed (5)

- [x] G4b: Controlo positivo do G4 — lendo o cStat do lote em vez do `infProt`,
  os testes ficam vermelhos com o defeito exato da auditoria.
  EVIDENCE: trocando `findNode(parsed, 'infProt')` por `findNode(parsed,
  'retEnviNFe')`: "expected 'rejected' to be 'authorized'" (lote 104 lido como
  rejeicao da nota), "expected '104' to be '539'", "expected 'rejected' to be
  'pending'" / "Tests 3 failed | 2 passed (5)". Restaurado, volta a 5 passed.

- [x] G5: Unique de (companyId, series, number) no schema e na migração.
  CHECK: grep -q "@@unique(\[companyId, series, number\])" prisma/schema.prisma && grep -q "CREATE UNIQUE INDEX" prisma/migrations/20260901180000_nfe_emission_atomic/migration.sql && echo G5_UNIQUE_OK
  EXPECT: G5_UNIQUE_OK
  EVIDENCE: G5_UNIQUE_OK

- [x] G6: PATCH recusa emissão `submitted` com 409.
  CHECK: grep -q "existing.status === 'submitted'" "src/app/api/nfe-emissions/[id]/route.ts" && echo G6_PATCH_OK
  EXPECT: G6_PATCH_OK
  EVIDENCE: G6_PATCH_OK

- [x] G7: Regressão — dois authorize concorrentes, exatamente 1 `send`.
  CHECK: npx vitest run src/lib/__tests__/nfe-emission-authorize-atomic.test.ts 2>&1 | grep -E "^ +Tests +[0-9]+ passed"
  EXPECT: /8 passed/
  EVIDENCE: Tests  8 passed (8)

- [x] G8: Controlo positivo — sem o CAS, o teste de G7 fica vermelho.
  EVIDENCE: trocando o `where` do updateMany por `{ id, companyId }` (sem o filtro
  de status) e rodando o mesmo ficheiro: "× dois authorize concorrentes enviam à
  SEFAZ exatamente uma vez" / "AssertionError: expected vi.fn() to be called 1
  times, but got 2 times" / "Tests 1 failed | 7 passed (8)". Restaurado o CAS,
  volta a "Tests 8 passed (8)". O teste falha pelo defeito, não por acaso.

- [x] G9: Suíte inteira verde, sem regressão contra as 725 do TARGET.
  CHECK: npm test 2>&1 | grep -E "^ +Tests +[0-9]+ passed"
  EXPECT: /738 passed/
  EVIDENCE: Tests  738 passed | 4 skipped (742)

- [x] G10: typecheck e lint limpos.
  CHECK: npm run typecheck >/dev/null 2>&1 && npm run lint >/dev/null 2>&1 && echo G10_TSC_LINT_OK
  EXPECT: G10_TSC_LINT_OK
  EVIDENCE: G10_TSC_LINT_OK

- [x] G11: Dispensa do audit é nominal — só o GHSA-3f6p-5ww8-9rcr do mysql2,
  com motivo e validade; qualquer outro high/critical continua reprovando.
  CHECK: npm run audit:verify --silent
  EXPECT: /GHSA-3f6p-5ww8-9rcr/
  EVIDENCE: Dispensado até 2026-12-01: GHSA-3f6p-5ww8-9rcr (mysql2) | Dependency audit OK

- [x] G12: Controlo positivo do portão de dependências — sem dispensa, com
  dispensa vencida e com dispensa morta, ele reprova.
  CHECK: bash scripts/test-dependency-audit.sh
  EXPECT: /OK \(4 casos\)/
  EVIDENCE: test-dependency-audit: OK (4 casos)

- [x] G13: O guard de hardening do CI continua passando com o step trocado.
  CHECK: bash scripts/verify-ci-hardening.sh && bash scripts/test-ci-hardening.sh >/dev/null && echo G13_HARDENING_OK
  EXPECT: G13_HARDENING_OK
  EVIDENCE: CI hardening policy OK | G13_HARDENING_OK
