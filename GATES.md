# Gates: detail-cards-popup-mode

Scope: Recolhimento inicial dos cards e alternador de modo (abrir em popup padrão vs expandir inline) nos detalhes de cliente, fornecedor e produtos

- [x] G1: ContactDetailsModal inicializa com todos os cards recolhidos (isGeneralOpen false)
  CHECK: node -e "const fs = require('fs'); const src = fs.readFileSync('src/components/ContactDetailsModal.tsx', 'utf8'); if (!src.includes('setIsGeneralOpen(false)')) process.exit(1); if (src.includes('setIsGeneralOpen(true)')) process.exit(1); console.log('G1 passed: ContactDetailsModal initializes all cards closed');"
  EXPECT: G1 passed: ContactDetailsModal initializes all cards closed
  EVIDENCE: G1 passed: ContactDetailsModal initializes all cards closed

- [x] G2: ProductDetailModal inicializa com todos os cards recolhidos (sem geral padrão)
  CHECK: node -e "const fs = require('fs'); const src = fs.readFileSync('src/app/(painel)/cadastro/produtos/components/ProductDetailModal.tsx', 'utf8'); if (src.includes(\"nextOpenSections.add('geral')\")) process.exit(1); console.log('G2 passed: ProductDetailModal initializes with all cards collapsed');"
  EXPECT: G2 passed: ProductDetailModal initializes with all cards collapsed
  EVIDENCE: G2 passed: ProductDetailModal initializes with all cards collapsed

- [x] G3: Botão/seletor de alternância de modo (popup padrão vs expandir) presente no topo dos modais
  CHECK: node -e "const fs = require('fs'); const c = fs.readFileSync('src/components/ContactDetailsModal.tsx', 'utf8'); const p = fs.readFileSync('src/app/(painel)/cadastro/produtos/components/ProductDetailModal.tsx', 'utf8'); if (!c.includes('CardViewModeToggle') || !p.includes('CardViewModeToggle')) process.exit(1); console.log('G3 passed: CardViewModeToggle integrated into both modals');"
  EXPECT: G3 passed: CardViewModeToggle integrated into both modals
  EVIDENCE: G3 passed: CardViewModeToggle integrated into both modals

- [x] G4: Suporte a popup dedicado por card e modo padrão 'popup'
  CHECK: node -e "const fs = require('fs'); const t = fs.readFileSync('src/components/ui/CardViewModeToggle.tsx', 'utf8'); if (!t.includes(\"'popup'\") || !t.includes(\"'expand'\")) process.exit(1); console.log('G4 passed: card view mode toggle module exists with popup and expand modes');"
  EXPECT: G4 passed: card view mode toggle module exists with popup and expand modes
  EVIDENCE: G4 passed: card view mode toggle module exists with popup and expand modes

- [x] G5: Testes automatizados unitários/contrato cobrindo o novo comportamento passam
  CHECK: npx vitest run src/components/__tests__/card-view-mode.test.tsx
  EXPECT: passed
  EVIDENCE: Start at 02:17:10 | Duration 459ms | 10 passed tests

- [x] G6: Typecheck e suíte completa de testes passam sem regressões
  CHECK: npm run typecheck && npm test
  EXPECT: passed
  EVIDENCE: tsc 0 errors | 182 test files passed | 1432 tests passed
