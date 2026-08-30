# Gates: consulta ANVISA na tela de Produtos

Scope: Tirar ANVISA da barra lateral e abrir o site oficial (Produtos para Saúde) a partir de Cadastros › Produtos.

- [x] G1: Spec 026 descreve remoção da barra e botão externo
  CHECK: rg -n "AC-001|FR-001|/cadastro/anvisa|consultas.anvisa.gov.br" specs/026-anvisa-consulta-produtos/spec.md
  EXPECT: /AC-001/
  EVIDENCE: 131:  `https://consultas.anvisa.gov.br/#/saude/`. | 139:- Apagar a rota `/cadastro/anvisa` e as APIs de embed-status.

- [x] G2: Barra e PAGE_GROUPS não listam /cadastro/anvisa
  CHECK: npx vitest run src/lib/__tests__/navigation.test.ts src/lib/__tests__/anvisa-consulta.test.ts
  EXPECT: Test Files  2 passed
  EVIDENCE: Start at  20:31:56 | Duration  144ms (transform 45ms, setup 0ms, import 74ms, tests 7ms, environment 0ms)

- [x] G3: /api/anvisa passa a exigir /cadastro/produtos
  CHECK: npx vitest run src/lib/__tests__/navigation.test.ts -t "anvisa"
  EXPECT: Test Files  1 passed
  EVIDENCE: Start at  20:31:57 | Duration  187ms (transform 46ms, setup 0ms, import 58ms, tests 4ms, environment 0ms)

- [x] G4: Typecheck
  CHECK: npx tsc --noEmit && echo TSC_OK
  EXPECT: TSC_OK
  EVIDENCE: TSC_OK

- [x] G5: Lint
  CHECK: npm run lint && echo LINT_OK
  EXPECT: LINT_OK
  EVIDENCE: > eslint . | LINT_OK

- [x] G6: Validação Spec Kit
  CHECK: npm run docs:validate && echo DOCS_OK
  EXPECT: DOCS_OK
  EVIDENCE: Documentation validation passed (134 Markdown files, 35 IDs). | DOCS_OK

- [x] G7: SidebarNav não tem item ANVISA
  CHECK: bash -c 'rg -n "href: .*/cadastro/anvisa" src/components/SidebarNav.tsx; test $? -eq 1' && echo NO_SIDEBAR_ANVISA
  EXPECT: NO_SIDEBAR_ANVISA
  EVIDENCE: NO_SIDEBAR_ANVISA

- [x] G8: Produtos tem botão para o portal oficial
  CHECK: rg -n "ANVISA_PRODUTOS_SAUDE_URL|Consulta ANVISA" src/app/\(painel\)/cadastro/produtos/page-client.tsx src/lib/anvisa-consulta.ts
  EXPECT: /consultas.anvisa.gov.br\/#\/saude/
  EVIDENCE: src/app/(painel)/cadastro/produtos/page-client.tsx:366:            href={ANVISA_PRODUTOS_SAUDE_URL} | src/app/(painel)/cadastro/produtos/page-client.tsx:373:            Consulta ANVISA
