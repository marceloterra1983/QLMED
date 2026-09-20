# Gates: fila pós-081 (076 rebase + sidecar reads + vercel skill)

Scope: rebase SPEC-076, ler Decimal onde o sidecar já existe, instalar skill Vercel.

- [ ] G1: PR 465 rebaseada em origin/main sem conflito
  CHECK: git -C /home/marce/qlmed/.worktrees/076-jev-sefaz-followup merge-base --is-ancestor origin/main HEAD && echo ancestor
  EXPECT: ancestor
  EVIDENCE: pending

- [ ] G2: mapNfeEntryItem prefere sidecar Decimal
  CHECK: npx vitest run src/lib/__tests__/money.test.ts src/lib/__tests__/satellite-stores-prisma.test.ts src/lib/__tests__/nfe-entry-item-decimal-read.test.ts
  EXPECT: Test Files
  EVIDENCE: pending

- [ ] G3: by-cfop soma totalValueDecimal quando presente
  CHECK: npx vitest run src/lib/__tests__/by-cfop-decimal-read.test.ts src/app/api/fiscal/by-cfop/__tests__ 
  EXPECT: pending-adjust
  EVIDENCE: pending

- [ ] G4: skill vercel-react-best-practices instalada
  CHECK: test -f /home/marce/.agents/skills/vercel-react-best-practices/SKILL.md -o -f /home/marce/.claude/skills/vercel-react-best-practices/SKILL.md && echo vercel-ok
  EXPECT: vercel-ok
  EVIDENCE: pending

- [ ] G5: webhook n8n e GATES.md raiz não voltam
  CHECK: test -f src/app/api/webhooks/n8n/route.ts && test ! -f GATES.md && echo hygiene-ok
  EXPECT: hygiene-ok
  EVIDENCE: pending

ABANDON: T010-T013 DROP Float / tax expand — ROLE-001.
ABANDON: GOD-SPLIT sem spec dedicada.
ABANDON: PONYTAIL tetos NSU/500/28px.
ABANDON: DEPENDABOT-451-453 revisão de lockfile fora desta fila imediata.
