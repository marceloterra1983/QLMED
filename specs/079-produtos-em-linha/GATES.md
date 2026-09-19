# Gates: SPEC-079 produtos abrem Em Linha

Scope: Lista de produtos inicia com Status Em Linha selecionado; árvore não explode grupos só por causa desse default.

- [ ] G1: Spec Kit 079 existe
  CHECK: test -f specs/079-produtos-em-linha/spec.md && test -f specs/079-produtos-em-linha/plan.md && test -f specs/079-produtos-em-linha/tasks.md && rg -q 'SPEC-079' specs/079-produtos-em-linha/spec.md && echo SPEC079_OK
  EXPECT: SPEC079_OK
  EVIDENCE: pending

- [ ] G2: default lineStatusFilter é active
  CHECK: rg -n "useState<'active' \| 'outOfLine' \| 'all'>\\('active'\\)" "src/app/(painel)/cadastro/produtos/page-client.tsx" && echo DEFAULT_ACTIVE_OK
  EXPECT: DEFAULT_ACTIVE_OK
  EVIDENCE: pending

- [ ] G3: testes do recorte passam
  CHECK: npx vitest run src/lib/__tests__/produtos-groups-expanded-contract.test.ts src/app/\(painel\)/cadastro/produtos/components/__tests__/product-filters.test.ts --reporter=dot
  EXPECT: Tests
  EVIDENCE: pending
