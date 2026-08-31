# Gates: Tons distintos por etapa na Nova NF-e

Scope: Cada etapa (nav + card) tem tom próprio; ativo forte; inativo muted; card com borda/fundo/header na cor da etapa; acessível além de cor; mapa stepId→classes sem lib nova.

- [x] G1: SPEC-025 declara FR visual de tons por etapa (nav + card)
  CHECK: rg -n "FR-025|AC-027|card/bloco|fundo sutil" specs/025-emissao-nota-fiscal/spec.md
  EXPECT: FR-025
  EVIDENCE: 381:  navegação e no card/bloco da seção correspondente. O botão | 386:  mesmo tom com borda, fundo sutil e título/accent alinhados

- [x] G2: Mapa stepId → classes de tom com 5 tons distintos
  CHECK: npx vitest run src/lib/__tests__/nfe-emission-form-steps.test.ts -t "tons por etapa"
  EXPECT: Test Files  1 passed
  EVIDENCE: Start at  20:46:12 | Duration  170ms (transform 47ms, setup 0ms, import 60ms, tests 3ms, environment 0ms)

- [x] G3: Teste cobre mapa (nav ativo/inativo + card borda/fundo/heading)
  CHECK: npx vitest run src/lib/__tests__/nfe-emission-form-steps.test.ts -t "tons por etapa"
  EXPECT: Test Files  1 passed
  EVIDENCE: Start at  20:46:13 | Duration  127ms (transform 28ms, setup 0ms, import 37ms, tests 4ms, environment 0ms)

- [x] G4: page-client usa NFE_STEP_TONE / helpers na nav e nos cards (sem bg/borda neutros fixos)
  CHECK: node -e "const fs=require('fs'); const s=fs.readFileSync('src/app/(painel)/fiscal/issued/nova/page-client.tsx','utf8'); const sections=['dados','itens','transporte','pagamento','complementos'].every((id)=>s.includes(\"nfeStepSectionClass('\"+id+\"')\")); const neutral= /bg-white dark:bg-card-dark border border-slate-200 dark:border-slate-800 rounded-xl p-5 \\$\\{nfeStepSectionClass/.test(s); console.log(JSON.stringify({hasTone:s.includes('NFE_STEP_TONE'),nav:s.includes('nfeStepNavClass'),sections,neutral})); if(!s.includes('NFE_STEP_TONE')||!s.includes('nfeStepNavClass')||!sections||neutral) process.exit(1);"
  EXPECT: "neutral":false
  EVIDENCE: {"hasTone":true,"nav":true,"sections":true,"neutral":false}

- [x] G5: Ativo usa peso+anel; inativo muted da etapa (não bg-primary único)
  CHECK: npx vitest run src/lib/__tests__/nfe-emission-form-steps.test.ts -t "preenchimento, peso e anel"
  EXPECT: Test Files  1 passed
  EVIDENCE: Start at  20:46:14 | Duration  157ms (transform 33ms, setup 0ms, import 44ms, tests 2ms, environment 0ms)

- [x] G6: Cada card no mapa tem borda + fundo sutil + accent top (mesmo tom)
  CHECK: node -e "const fs=require('fs'); const src=fs.readFileSync('src/lib/nfe-emission/form-steps.ts','utf8'); const sections=[...src.matchAll(/section: '([^']+)'/g)].map(m=>m[1]); const bad=sections.filter(c=>!/\bborder\b/.test(c)||!/bg-/.test(c)||!/border-t-2/.test(c)); console.log(JSON.stringify({cardChrome:sections.length===5&&bad.length===0,n:sections.length})); if(sections.length!==5||bad.length) process.exit(1);"
  EXPECT: "cardChrome":true
  EVIDENCE: {"cardChrome":true,"n":5}

- [x] G7: Typecheck
  CHECK: npx tsc --noEmit
  EXPECT: 
  EVIDENCE: (no output)

- [x] G8: Lint dos arquivos tocados
  CHECK: npx eslint "src/app/(painel)/fiscal/issued/nova/page-client.tsx" src/lib/nfe-emission/form-steps.ts src/lib/__tests__/nfe-emission-form-steps.test.ts
  EXPECT: 
  EVIDENCE: (no output)

- [x] G9: Preview :3002 desta worktree
  CHECK: bash -c 'ss -ltnp 2>/dev/null | rg ":3002" >/dev/null && readlink /proc/$(ss -ltnp | rg ":3002" | rg -o "pid=[0-9]+" | head -1 | cut -d= -f2)/cwd'
  EXPECT: nfe-form-order
  EVIDENCE: /home/marce/qlmed/.worktrees/nfe-form-order
