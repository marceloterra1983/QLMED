# Gates: Tons distintos por etapa na Nova NF-e

Scope: Cada etapa (nav + card wrapper + painéis internos + aside) tem tom próprio com fundo VISÍVEL; ativo forte; inativo muted; sem lib nova.

- [x] G1: SPEC-025 declara FR visual de tons por etapa (nav + card)
  CHECK: rg -n "FR-025|AC-027|card/bloco|fundo sutil" specs/025-emissao-nota-fiscal/spec.md
  EXPECT: FR-025
  EVIDENCE: 381:  navegação e no card/bloco da seção correspondente. O botão | 386:  mesmo tom com borda, fundo sutil e título/accent alinhados

- [x] G2: Mapa stepId → 5 tons distintos com section+panel
  CHECK: npx vitest run src/lib/__tests__/nfe-emission-form-steps.test.ts -t "tons por etapa"
  EXPECT: Test Files  1 passed
  EVIDENCE: Start at  21:06:58 | Duration  149ms (transform 33ms, setup 0ms, import 43ms, tests 5ms, environment 0ms)

- [x] G3: Teste cobre nav + section fundo sólido + panel interno + aside
  CHECK: npx vitest run src/lib/__tests__/nfe-emission-form-steps.test.ts -t "tons por etapa"
  EXPECT: Test Files  1 passed
  EVIDENCE: Start at  21:06:59 | Duration  163ms (transform 38ms, setup 0ms, import 48ms, tests 6ms, environment 0ms)

- [x] G4: page-client usa panel em todas as etapas e aside colorido (sem bg-white nos cards)
  CHECK: node -e 'const fs=require("fs"); const s=fs.readFileSync("src/app/(painel)/fiscal/issued/nova/page-client.tsx","utf8"); const panels=["dados","itens","transporte","pagamento","complementos"].every((id)=>s.includes("nfeStepPanelClass(\x27"+id+"\x27)")); const whiteAside=/bg-white dark:bg-card-dark border border-slate-200/.test(s); console.log(JSON.stringify({panels,whiteAside,aside:s.includes("data-nfe-aside-card")})); if(!panels||whiteAside||!s.includes("data-nfe-aside-card")) process.exit(1);'
  EXPECT: "whiteAside":false
  EVIDENCE: {"panels":true,"whiteAside":false,"aside":true}

- [x] G5: Ativo usa peso+anel; inativo muted da etapa
  CHECK: npx vitest run src/lib/__tests__/nfe-emission-form-steps.test.ts -t "preenchimento, peso e anel"
  EXPECT: Test Files  1 passed
  EVIDENCE: Start at  21:07:00 | Duration  139ms (transform 34ms, setup 0ms, import 44ms, tests 2ms, environment 0ms)

- [x] G6: Section tem fundo sólido light (bg-*-100/200) + panel com bg+border
  CHECK: node -e 'const fs=require("fs"); const src=fs.readFileSync("src/lib/nfe-emission/form-steps.ts","utf8"); const sections=[...src.matchAll(/section:\s*\x27([^\x27]+)\x27/g)].map(m=>m[1]); const panels=[...src.matchAll(/panel:\s*\x27([^\x27]+)\x27/g)].map(m=>m[1]); const need=["bg-blue-100","bg-emerald-100","bg-amber-100","bg-violet-100","bg-slate-200"]; const solid=need.every(c=>src.includes(c)); const badP=panels.filter(c=>!/\bborder\b/.test(c)||!/bg-/.test(c)); console.log(JSON.stringify({ok:solid&&sections.length===5&&panels.length===5&&badP.length===0,nS:sections.length,nP:panels.length})); if(!solid||sections.length!==5||panels.length!==5||badP.length) process.exit(1);'
  EXPECT: "ok":true
  EVIDENCE: {"ok":true,"nS":5,"nP":5}

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

- [x] G10: Código das seções usa bg-*-100 (fundo visível) e nfeStepPanelClass
  CHECK: node -e "const fs=require('fs'); const f=fs.readFileSync('src/lib/nfe-emission/form-steps.ts','utf8'); const p=fs.readFileSync('src/app/(painel)/fiscal/issued/nova/page-client.tsx','utf8'); const solid=['bg-blue-100','bg-emerald-100','bg-amber-100','bg-violet-100','bg-slate-200'].every(c=>f.includes(c)); console.log(JSON.stringify({solid,panelHelper:p.includes('nfeStepPanelClass'),panelDef:f.includes('panel:')})); if(!solid||!p.includes('nfeStepPanelClass')) process.exit(1);"
  EXPECT: "solid":true
  EVIDENCE: {"solid":true,"panelHelper":true,"panelDef":true}
