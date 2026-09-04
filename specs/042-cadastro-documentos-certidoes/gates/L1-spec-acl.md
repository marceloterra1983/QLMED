# Gates: L1 — Spec aprovado + navegação/ACL

Scope: SPEC-042 revisado pelo dono (status draft→approved) e a página existe para o middleware, o menu e a ACL — ainda sem conteúdo.

- [ ] G1: spec.md tem frontmatter válido e passa no validador de docs
  CHECK: node scripts/validate-docs.mjs && echo DOCS_OK
  EXPECT: DOCS_OK
  EVIDENCE: pending

- [ ] G2: dono aprovou o spec (status: approved) — perguntas 1–3 do PLAN respondidas ou explicitamente adiadas
  EVIDENCE: pending

- [ ] G3: página registrada em PAGE_GROUPS (Cadastros) e PAGE_LABELS
  CHECK: grep -c "'/cadastro/documentos'" src/lib/navigation.ts src/components/SidebarNav.tsx
  EXPECT: /navigation.ts:[1-9][\s\S]*SidebarNav.tsx:[1-9]/
  EVIDENCE: pending

- [ ] G4: prefixo /api/documentos mapeado para a página
  CHECK: grep -n "prefix: '/api/documentos'" src/lib/navigation.ts
  EXPECT: /cadastro/documentos
  EVIDENCE: pending

- [ ] G5: teste de ACL cobre o prefixo novo (nega sem página, permite com página, admin bypass)
  CHECK: npx vitest run src/lib/__tests__/acl-default-deny.test.ts src/lib/__tests__/documentos-acl.test.ts 2>&1 | tail -5
  EXPECT: /Tests\s+\d+ passed/
  EVIDENCE: pending

- [ ] G6: typecheck e lint limpos
  CHECK: npx tsc --noEmit && npm run lint --silent && echo TL_OK
  EXPECT: TL_OK
  EVIDENCE: pending
