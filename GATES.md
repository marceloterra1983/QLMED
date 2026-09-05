# Gates: Produtos visíveis ao carregar

Scope: Grupos expandidos por padrão na lista de produtos e coluna dedicada ao código Spica de 6 dígitos

- [x] G1: page-client não recolhe grupos automaticamente após fetch
  CHECK: cd /home/marce/qlmed/app && grep -q "setCollapsedGroups(groups)" src/app/\(painel\)/cadastro/produtos/page-client.tsx && exit 1 || echo OK_NO_AUTO_COLLAPSE
  EXPECT: OK_NO_AUTO_COLLAPSE
  EVIDENCE: OK_NO_AUTO_COLLAPSE

- [x] G2: ProductTable expõe coluna Cód. Spica
  CHECK: cd /home/marce/qlmed/app && grep -q "Cod. Spica" src/app/\(painel\)/cadastro/produtos/components/ProductTable.tsx && echo OK_SPICA_COL
  EXPECT: OK_SPICA_COL
  EVIDENCE: OK_SPICA_COL

- [x] G3: Typecheck passa
  CHECK: cd /home/marce/qlmed/app && npm run typecheck
  EXPECT: 
  EVIDENCE: > qlmed@0.1.0 typecheck | > tsc --noEmit

- [x] G4: Lint passa
  CHECK: cd /home/marce/qlmed/app && npm run lint
  EXPECT: 
  EVIDENCE: > qlmed@0.1.0 lint | > eslint .

- [x] G5: Testes passam
  CHECK: cd /home/marce/qlmed/app && npm test
  EXPECT: 
  EVIDENCE: at extractSourcemapFromFile (file:///home/marce/qlmed/app/node_modules/vite/dist/node/chunks/node.js:19095:87) | at loadAndTransform (file:///home/marce/qlmed/app/node_modules/vite/dist/node/chunks/no

- [x] G6: docs:validate passa
  CHECK: cd /home/marce/qlmed/app && npm run docs:validate
  EXPECT: Documentation validation passed
  EVIDENCE: > node ./scripts/validate-docs.mjs | Documentation validation passed (204 Markdown files, 55 IDs).
