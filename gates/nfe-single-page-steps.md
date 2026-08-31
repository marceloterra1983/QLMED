# Gates: Nova NF-e página única com etapas

Scope: Mesma página rolável; nav foca seções; concluir etapa valida e avança; sem wizard.

- [x] G1: SPEC-025 declara página única, âncoras e concluir etapa
  CHECK: rg -n "FR-020|FR-021|AC-021|AC-022|Concluir nesta etapa" specs/025-emissao-nota-fiscal/spec.md
  EXPECT: FR-020
  EVIDENCE: 334:  **Concluir nesta etapa**. O clique MUST validar só o mínimo | 407:  botão Concluir nesta etapa quando o mínimo da etapa está ok.

- [x] G2: Seções Dados/Itens/Transporte/Pagamento/Complementos sempre no JSX (sem esconder por aba)
  CHECK: node -e "const fs=require('fs'); const s=fs.readFileSync('src/app/(painel)/fiscal/issued/nova/page-client.tsx','utf8'); const hide=/\btab === '/.test(s); const ids=['dados','itens','transporte','pagamento','complementos'].every((id)=>s.includes(\"nfeSectionId('\"+id+\"')\")||s.includes('nfe-secao-'+id)); console.log(JSON.stringify({hide,ids})); if(hide||!ids) process.exit(1);"
  EXPECT: "hide":false
  EVIDENCE: {"hide":false,"ids":true}

- [x] G3: Clique no nav rola até a seção (helper)
  CHECK: npx vitest run src/lib/__tests__/nfe-emission-form-steps.test.ts -t "nav rola"
  EXPECT: Test Files  1 passed
  EVIDENCE: Start at  20:04:44 | Duration  191ms (transform 52ms, setup 0ms, import 68ms, tests 3ms, environment 0ms)

- [x] G4: Concluir etapa incompleta não avança e lista o que falta
  CHECK: npx vitest run src/lib/__tests__/nfe-emission-form-steps.test.ts -t "incompleta"
  EXPECT: Test Files  1 passed
  EVIDENCE: Start at  20:04:45 | Duration  202ms (transform 35ms, setup 0ms, import 46ms, tests 3ms, environment 0ms)

- [x] G5: Concluir Dados completo vai para Itens
  CHECK: npx vitest run src/lib/__tests__/nfe-emission-form-steps.test.ts -t "Dados vai para Itens"
  EXPECT: Test Files  1 passed
  EVIDENCE: Start at  20:04:46 | Duration  272ms (transform 94ms, setup 0ms, import 105ms, tests 3ms, environment 0ms)

- [x] G6: Botão Concluir nesta etapa nas 4 primeiras seções; última sem o botão
  CHECK: node -e "const fs=require('fs'); const s=fs.readFileSync('src/app/(painel)/fiscal/issued/nova/page-client.tsx','utf8'); const n=(s.match(/<StepCompleteFooter/g)||[]).length; const idx=s.indexOf(\"nfeSectionId('complementos')\"); const last=idx>=0?s.slice(idx):''; const lastHas=last.includes('StepCompleteFooter')||last.includes('Concluir nesta etapa'); console.log(JSON.stringify({n,lastHas,hasLabel:s.includes('Concluir nesta etapa')})); if(n!==4||lastHas||!s.includes('Concluir nesta etapa')) process.exit(1);"
  EXPECT: "n":4
  EVIDENCE: {"n":4,"lastHas":false,"hasLabel":true}

- [x] G7: Ordem Dados (destinatário → natureza → série → finalidade) e série 2 não regressaram
  CHECK: npx vitest run src/lib/__tests__/nfe-emission-series.test.ts
  EXPECT: Test Files  1 passed
  EVIDENCE: Start at  20:04:47 | Duration  373ms (transform 74ms, setup 0ms, import 129ms, tests 10ms, environment 0ms)

- [x] G8: Typecheck
  CHECK: npx tsc --noEmit
  EXPECT: 
  EVIDENCE: (no output)

- [x] G9: Lint dos arquivos tocados
  CHECK: npx eslint "src/app/(painel)/fiscal/issued/nova/page-client.tsx" src/lib/nfe-emission/form-steps.ts src/lib/__tests__/nfe-emission-form-steps.test.ts src/lib/__tests__/nfe-emission-series.test.ts
  EXPECT: 
  EVIDENCE: (no output)

- [x] G10: Preview :3002 desta worktree
  CHECK: bash -c 'ss -ltnp | rg ":3002" >/dev/null && readlink /proc/$(ss -ltnp | rg ":3002" | rg -o "pid=[0-9]+" | head -1 | cut -d= -f2)/cwd'
  EXPECT: nfe-form-order
  EVIDENCE: /home/marce/qlmed/.worktrees/nfe-form-order

- [x] G11: Botão da etapa ativa tem preenchimento, peso e anel; inativo fica apagado
  CHECK: npx vitest run src/lib/__tests__/nfe-emission-form-steps.test.ts -t "preenchimento, peso e anel"
  EXPECT: Test Files  1 passed
  EVIDENCE: Start at  20:04:53 | Duration  148ms (transform 45ms, setup 0ms, import 54ms, tests 3ms, environment 0ms)
