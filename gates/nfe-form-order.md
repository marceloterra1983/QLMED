# Gates: Ordem dos campos Nova NF-e

Scope: Reordenar o cabeçalho da tela Nova NF-e: Destinatário primeiro; Natureza → Série (badge 2) → Finalidade. Sem mudar regra fiscal.

- [x] G1: Destinatário é o primeiro controle significativo no JSX da seção inicial
  CHECK: node -e "const fs=require('fs'); const s=fs.readFileSync('src/app/(painel)/fiscal/issued/nova/page-client.tsx','utf8'); const m=s.match(/\\{tab === 'dados' && \\([\\s\\S]*?\\{tab === 'itens'/); if(!m){console.error('no-dados'); process.exit(1);} const b=m[0]; const dest=b.indexOf('>Destinatário<'); const nat=b.indexOf('label=\"Natureza / CFOP\"'); const ser=b.indexOf('label=\"Série\"'); const fin=b.indexOf('label=\"Finalidade\"'); const orderOk=dest>=0&&nat>dest&&ser>nat&&fin>ser; console.log(JSON.stringify({dest,nat,ser,fin,orderOk})); if(!orderOk) process.exit(1);"
  EXPECT: "orderOk":true
  EVIDENCE: {"dest":276,"nat":2391,"ser":3056,"fin":3549,"orderOk":true}

- [x] G2: Série permanece badge compacto read-only (não é input)
  CHECK: node -e "const fs=require('fs'); const s=fs.readFileSync('src/app/(painel)/fiscal/issued/nova/page-client.tsx','utf8'); const hasInput= /<input[^>]*(name|id)=[\"']serie[\"']/i.test(s) || /<input[^>]*serie[^>]*>/i.test(s); const hasBadge=/S[eé]rie/.test(s) && (/badge/i.test(s) || /readOnly|aria-readonly|não edit|nao edit/i.test(s) || /série\\s*2|serie\\s*2|NFE_EMISSION_SERIES|emissionSeries/i.test(s)); console.log(JSON.stringify({hasInput,hasBadge})); if(hasInput) process.exit(1);"
  EXPECT: "hasInput":false
  EVIDENCE: {"hasInput":false,"hasBadge":true}

- [x] G3: Spec 025 documenta a ordem visual dos campos
  CHECK: rg -n "FR-017|Destinatário" specs/025-emissao-nota-fiscal/spec.md
  EXPECT: FR-017
  EVIDENCE: 231:  Remessa e devolução MUST usar `tPag` 90 sem cobrança. Destinatário | 238:- **FR-017**: Na aba Dados da Nova NF-e, o destinatário MUST ser o

- [x] G4: Teste de ordem/série existente não regressou
  CHECK: npx vitest run src/lib/__tests__/nfe-emission-series.test.ts
  EXPECT: Test Files  1 passed
  EVIDENCE: Start at  00:59:23 | Duration  175ms (transform 42ms, setup 0ms, import 79ms, tests 6ms, environment 0ms)

- [x] G5: Typecheck
  CHECK: npx tsc --noEmit
  EXPECT: 
  EVIDENCE: (no output)

- [x] G6: Lint dos arquivos tocados
  CHECK: npx eslint "src/app/(painel)/fiscal/issued/nova/page-client.tsx" src/lib/__tests__/nfe-emission-series.test.ts
  EXPECT: 
  EVIDENCE: (no output)

- [x] G7: Preview dev escuta em porta livre (não 3000)
  CHECK: ss -ltnp | rg ':3002' || echo 'DEV_NOT_LISTENING'
  EXPECT: :3002
  EVIDENCE: LISTEN 0      511                        0.0.0.0:3002       0.0.0.0:*    users:(("next-server (v1",pid=708506,fd=22))
