# Gates: L1 — Spec aprovado + navegação/ACL

Scope: SPEC-042 revisado pelo dono (status draft→approved) e a página existe para o middleware, o menu e a ACL — ainda sem conteúdo.

- [x] G1: spec.md tem frontmatter válido e passa no validador de docs
  CHECK: node scripts/validate-docs.mjs && echo DOCS_OK
  EXPECT: DOCS_OK
  EVIDENCE: Documentation validation passed (189 Markdown files, 52 IDs). | DOCS_OK

- [x] G2: dono aprovou o spec (status: approved) — perguntas 1–3 do PLAN respondidas ou explicitamente adiadas
  EVIDENCE: dono escreveu "executa a folha L1" em 2026-09-04 17:41; spec.md frontmatter `status: approved`; perguntas 1–3 adiadas para L7 (registrado no cabeçalho do spec)

- [x] G3: página registrada em PAGE_GROUPS (Cadastros) e PAGE_LABELS
  CHECK: grep -c "'/cadastro/documentos'" src/lib/navigation.ts src/components/SidebarNav.tsx
  EXPECT: /navigation.ts:[1-9][\s\S]*SidebarNav.tsx:[1-9]/
  EVIDENCE: src/lib/navigation.ts:2 | src/components/SidebarNav.tsx:1

- [x] G4: prefixo /api/documentos mapeado para a página
  CHECK: grep -n "prefix: '/api/documentos'" src/lib/navigation.ts
  EXPECT: pages: ['/cadastro/documentos']
  EVIDENCE: 101:  { prefix: '/api/documentos', pages: ['/cadastro/documentos'] },

- [x] G5: teste de ACL cobre o prefixo novo (nega sem página, permite com página, admin bypass)
  CHECK: npx vitest run src/lib/__tests__/acl-default-deny.test.ts src/lib/__tests__/documentos-acl.test.ts 2>&1 | tail -5
  EXPECT: /Tests\s+\d+ passed/
  EVIDENCE: Start at  17:43:53 | Duration  208ms (transform 94ms, setup 36ms, import 66ms, tests 63ms, environment 0ms)

- [x] G6: typecheck e lint limpos
  CHECK: npx tsc --noEmit && npm run lint --silent && echo TL_OK
  EXPECT: TL_OK
  EVIDENCE: TL_OK
