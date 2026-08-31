# Gates: Série + Finalidade + Consumidor final na mesma linha

Scope: Na Nova NF-e, layout compacto: Série, Finalidade e Consumidor final
na mesma linha (wrap responsivo em mobile). Sem mudar regra fiscal.

- [x] G1: Os três campos compartilham o mesmo container de linha no JSX
  CHECK: node -e "const fs=require('fs'); const s=fs.readFileSync('src/app/(painel)/fiscal/issued/nova/page-client.tsx','utf8'); const m=s.match(/data-nfe-serie-finalidade-linha[\\s\\S]*?<\\/div>/); if(!m){console.error('no-container'); process.exit(1);} const b=m[0]; const ser=b.indexOf('label=\"Série\"'); const fin=b.indexOf('label=\"Finalidade\"'); const cons=b.indexOf('label=\"Consumidor final\"'); const ok=ser>=0&&fin>ser&&cons>fin; console.log(JSON.stringify({ser,fin,cons,ok,hasFlexWrap:/flex-wrap/.test(b)||/sm:grid-cols-3/.test(b)})); if(!ok) process.exit(1);"
  EXPECT: "ok":true
  EVIDENCE: {"ser":165,"fin":683,"cons":1082,"ok":true,"hasFlexWrap":true}

- [x] G2: Série permanece badge compacto read-only (não é input/select)
  CHECK: node -e "const fs=require('fs'); const s=fs.readFileSync('src/app/(painel)/fiscal/issued/nova/page-client.tsx','utf8'); const serieField=s.match(/<Field label=\"Série\"[\\s\\S]*?<\\/Field>/); if(!serieField){console.error('no-serie'); process.exit(1);} const b=serieField[0]; const hasInput=/<(input|select)\\b/.test(b); const hasBadge=/DEFAULT_SERIES/.test(b)&&/aria-readonly/.test(b); console.log(JSON.stringify({hasInput,hasBadge})); if(hasInput||!hasBadge) process.exit(1);"
  EXPECT: "hasInput":false
  EVIDENCE: {"hasInput":false,"hasBadge":true}

- [x] G3: Spec 025 documenta layout compacto na mesma linha (FR novo)
  CHECK: node -e "const fs=require('fs'); const s=fs.readFileSync('specs/025-emissao-nota-fiscal/spec.md','utf8'); const ok=/\*\*FR-022\*\*:/.test(s) && /mesma linha/.test(s) && /Consumidor final/.test(s); console.log(JSON.stringify({hasFr022:/\*\*FR-022\*\*:/.test(s),ok})); if(!ok) process.exit(1);"
  EXPECT: "hasFr022":true
  EVIDENCE: {"hasFr022":true,"ok":true}

- [x] G4: Teste de layout/série passa
  CHECK: npx vitest run src/lib/__tests__/nfe-emission-series.test.ts
  EXPECT: Test Files  1 passed
  EVIDENCE: Start at  20:04:29 | Duration  391ms (transform 105ms, setup 0ms, import 189ms, tests 23ms, environment 0ms)

- [x] G5: Typecheck
  CHECK: npx tsc --noEmit
  EXPECT: 
  EVIDENCE: (no output)

- [x] G6: Lint dos arquivos tocados
  CHECK: npx eslint "src/app/(painel)/fiscal/issued/nova/page-client.tsx" src/lib/__tests__/nfe-emission-series.test.ts
  EXPECT: 
  EVIDENCE: (no output)

- [x] G7: Preview :3002 no ar
  CHECK: ss -ltnp | rg ':3002' || echo 'DEV_NOT_LISTENING'
  EXPECT: :3002
  EVIDENCE: LISTEN 0      511                        0.0.0.0:3002       0.0.0.0:*    users:(("next-server (v1",pid=918009,fd=22))
