# Gates: Página de Rotinas do Sistema

Scope: Criar a página de Rotinas com tabela relacionando todas as rotinas executadas pelo código do portal QLMED

- [x] G1: Catálogo de rotinas com pelo menos 18 rotinas mapeadas do sistema
  CHECK: cd /home/marce/qlmed/worktrees/044-pagina-rotinas && npx tsx -e "import { SYSTEM_ROUTINES } from './src/lib/system-routines'; if (!Array.isArray(SYSTEM_ROUTINES) || SYSTEM_ROUTINES.length < 18) process.exit(1); console.log('ROUTINES_COUNT=' + SYSTEM_ROUTINES.length);"
  EXPECT: ROUTINES_COUNT=
  EVIDENCE: ROUTINES_COUNT=19

- [x] G2: Navegação e sidebar sincronizados com a nova rota /sistema/rotinas
  CHECK: cd /home/marce/qlmed/worktrees/044-pagina-rotinas && npx vitest run src/components/__tests__/sidebar-nav-paths.test.ts
  EXPECT: 3 passed
  EVIDENCE: Start at  23:30:40 | Duration  153ms (transform 42ms, setup 17ms, import 51ms, tests 3ms, environment 0ms)

- [x] G3: Testes de unidade do catálogo de rotinas e API passam
  CHECK: cd /home/marce/qlmed/worktrees/044-pagina-rotinas && npx vitest run src/lib/__tests__/system-routines.test.ts
  EXPECT: 1 passed
  EVIDENCE: Start at  23:35:36 | Duration  272ms (transform 64ms, setup 39ms, import 38ms, tests 10ms, environment 0ms)

- [x] G4: Verificação de tipos TypeScript sem erros
  CHECK: cd /home/marce/qlmed/worktrees/044-pagina-rotinas && npx tsc --noEmit
  EXPECT: 
  EVIDENCE: (no output)

- [x] G5: Verificação de lint do código sem erros
  CHECK: cd /home/marce/qlmed/worktrees/044-pagina-rotinas && npm run lint
  EXPECT: 
  EVIDENCE: > qlmed@0.1.0 lint | > eslint .

- [x] G6: Validação de governança de documentação passa
  CHECK: cd /home/marce/qlmed/worktrees/044-pagina-rotinas && npm run docs:validate
  EXPECT: Documentation validation passed
  EVIDENCE: > node ./scripts/validate-docs.mjs | Documentation validation passed (198 Markdown files, 55 IDs).
