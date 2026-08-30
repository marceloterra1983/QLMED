# Gates: fechar SPEC-023 / PR #192

Scope: validar, mergear feat/gestao-impcg-autorizacoes e subir produção.

- [x] G1: Worktree na feature, sem leftover sujo desta tarefa
  CHECK: git -C /home/marce/qlmed/app/.worktrees/023-gestao-impcg-autorizacoes branch --show-current
  EXPECT: feat/gestao-impcg-autorizacoes
  EVIDENCE: branch feat/gestao-impcg-autorizacoes; após commit do leftover (guards + spec T032/T033) o porcelain deve ficar limpo.

- [x] G2: docs:validate
  CHECK: npm run docs:validate
  EXPECT: Documentation validation passed
  EVIDENCE: Documentation validation passed (117 Markdown files, 32 IDs).

- [x] G3: tsc --noEmit
  CHECK: npx tsc --noEmit && echo tsc-ok
  EXPECT: tsc-ok
  EVIDENCE: tsc-ok (exit 0, 2026-08-30)

- [x] G4: lint
  CHECK: npm run lint && echo lint-ok
  EXPECT: lint-ok
  EVIDENCE: eslint . exit 0; sem warnings impressos; lint-ok.

- [x] G5: npm test
  CHECK: npm test
  EXPECT: Test Files  60 passed
  EVIDENCE: Test Files  60 passed | 3 skipped (63); Tests  418 passed | 4 skipped (422); Duration  2.28s. Falha anterior (guards em [id] e arquivo) corrigida com requireAuth local; teste api-route-guards verde.

- [x] G6: db:migrate:verify
  CHECK: npm run db:migrate:verify
  EXPECT: No difference detected
  EVIDENCE: Applied 20260830120000_add_impcg_authorization; All migrations have been successfully applied; No difference detected. Target host=127.0.0.1 db=postgres (URL não impressa).

- [x] G7: db:reconcile:verify
  CHECK: npm run db:reconcile:verify
  EXPECT: No difference detected
  EVIDENCE: Script executed successfully (4x); No difference detected.

- [x] G8: Janela de produção aponta para a migration IMPCG
  CHECK: rg -n "EXPECTED_MIGRATION|20260830120000_add_impcg_authorization" scripts/verify-production-migration-window.cjs scripts/test-production-migration-window.cjs
  EXPECT: 20260830120000_add_impcg_authorization
  EVIDENCE: EXPECTED_MIGRATION=20260830120000_add_impcg_authorization; EXPECTED_SQL_SHA256=9fd07f6790362c64811f87d35ac5c5d36a60b7491b2666414332612bb7d55933; sha256sum migration.sql bate; node scripts/test-production-migration-window.cjs → Production migration window static contract passed.

- [ ] G9: PR #192 mergeado (merge commit)
  CHECK: gh pr view 192 --json state,mergedAt,mergeCommit --jq '"\(.state) \(.mergeCommit.oid)"'
  EXPECT: MERGED
  EVIDENCE: pending

- [ ] G10: Produção healthy com SHA de origin/main
  CHECK: curl -sS http://127.0.0.1:13000/api/health
  EXPECT: "status"
  EVIDENCE: pending
