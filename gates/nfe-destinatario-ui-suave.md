# Gates: Destinatário UI suave (Nova NF-e)

Scope: Remover parágrafo de ajuda junto ao destinatário; caixa top 10 com tipografia/espaçamento discretos (slate), sem lista crua nem cores gritantes. Placeholder curto permanece. Apelido/top 10 sem dump inalterados.

- [x] G1: Parágrafo de ajuda operacional sumiu da Nova NF-e
  CHECK: node -e "const fs=require('fs'); const s=fs.readFileSync('src/app/(painel)/fiscal/issued/nova/page-client.tsx','utf8'); const help=/Somente cliente PJ já presente nas emitidas|10 mais faturados|Sem digitar, vê os 10/.test(s); console.log(JSON.stringify({help})); if(help) process.exit(1);"
  EXPECT: {"help":false}
  EVIDENCE: {"help":false}

- [x] G2: Placeholder curto do input permanece (uma linha)
  CHECK: node -e "const fs=require('fs'); const s=fs.readFileSync('src/app/(painel)/fiscal/issued/nova/page-client.tsx','utf8'); const ph=/placeholder=\"Nome ou CNPJ\"/.test(s); console.log(JSON.stringify({placeholder:ph})); if(!ph) process.exit(1);"
  EXPECT: {"placeholder":true}
  EVIDENCE: {"placeholder":true}

- [x] G3: Lista do destinatário é caixa slate (não divide-blue / painel de etapa)
  CHECK: node -e "const fs=require('fs'); const s=fs.readFileSync('src/app/(painel)/fiscal/issued/nova/page-client.tsx','utf8'); const m=s.match(/data-destinatario-list[\\s\\S]*?<\\/ul>/); const block=m?m[0]:''; const hasAttr=/data-destinatario-list/.test(s); const noBlueDiv=/divide-blue/.test(block); const noPanelOnList=/nfeStepPanelClass\\('dados'\\)/.test(block); const hasSlate=/border-slate-200/.test(block); const stackedName=/block text-sm font-medium/.test(block); const mutedCnpj=/text-\\[11px\\][\\s\\S]{0,80}text-slate-400/.test(block); const slop=/purple|from-violet|shadow-2xl|neon|glow/.test(block); console.log(JSON.stringify({hasAttr,noBlueDiv,noPanelOnList,hasSlate,stackedName,mutedCnpj,slop})); if(!hasAttr||noBlueDiv||noPanelOnList||!hasSlate||!stackedName||!mutedCnpj||slop) process.exit(1);"
  EXPECT: "hasAttr":true
  EVIDENCE: {"hasAttr":true,"noBlueDiv":false,"noPanelOnList":false,"hasSlate":true,"stackedName":true,"mutedCnpj":true,"slop":false}

- [x] G4: Spec 025 não exige o parágrafo; FR-023 veta copy de ajuda na UI
  CHECK: rg -n "FR-023|parágrafo de ajuda|placeholder curto" specs/025-emissao-nota-fiscal/spec.md
  EXPECT: parágrafo de ajuda
  EVIDENCE: 367:  MUST NÃO exibir parágrafo de ajuda operacional junto ao | 368:  destinatário; o placeholder curto do campo (nome ou CNPJ) basta.

- [x] G5: Sem dump A–Z / separator; apelido continua no rótulo
  CHECK: node -e "const fs=require('fs'); const s=fs.readFileSync('src/app/(painel)/fiscal/issued/nova/page-client.tsx','utf8'); const sep=/data-destinatario-sep/.test(s); const nick=/recipientDisplayName/.test(s); console.log(JSON.stringify({sep,nick})); if(sep||!nick) process.exit(1);"
  EXPECT: {"sep":false,"nick":true}
  EVIDENCE: {"sep":false,"nick":true}

- [x] G6: Testes de etapa/tom e customer-search continuam verdes
  CHECK: npx vitest run src/lib/__tests__/nfe-emission-form-steps.test.ts src/lib/__tests__/nfe-emission-customer-search.test.ts src/lib/__tests__/nfe-recipient-display-name.test.ts
  EXPECT: Test Files  3 passed
  EVIDENCE: Start at  22:52:11 | Duration  149ms (transform 108ms, setup 0ms, import 142ms, tests 21ms, environment 0ms)

- [x] G7: Typecheck
  CHECK: npx tsc --noEmit && echo TSC_OK
  EXPECT: TSC_OK
  EVIDENCE: TSC_OK

- [x] G8: Lint dos arquivos tocados
  CHECK: npx eslint "src/app/(painel)/fiscal/issued/nova/page-client.tsx" "src/lib/__tests__/nfe-emission-form-steps.test.ts" --max-warnings 0 && echo LINT_OK
  EXPECT: LINT_OK
  EVIDENCE: LINT_OK

- [x] G9: docs:validate após ajuste do spec
  CHECK: npm run docs:validate
  EXPECT: Documentation validation passed
  EVIDENCE: > node ./scripts/validate-docs.mjs | Documentation validation passed (149 Markdown files, 44 IDs).

- [x] G10: Preview :3002 na worktree nfe-destinatario-ui-suave
  CHECK: ss -ltnp | rg ':3002' || echo DEV_NOT_LISTENING
  EXPECT: :3002
  EVIDENCE: LISTEN 0      511                        0.0.0.0:3002       0.0.0.0:*    users:(("next-server (v1",pid=655083,fd=22))
