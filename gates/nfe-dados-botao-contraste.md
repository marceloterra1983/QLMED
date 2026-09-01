# Gates: Contraste do botão ativo das etapas da Nova NF-e

Scope: Estado ativo de TODAS as etapas com fundo sólido escuro + texto/ícone branco (nunca branco-em-pastel). Tailwind precisa varrer `src/lib`.

- [x] G1: FR-025 proíbe branco sobre pastel no botão ativo
  CHECK: rg -n "branco-em-pastel|branco sobre pastel|fundo sólido" specs/025-emissao-nota-fiscal/spec.md
  EXPECT: branco
  EVIDENCE: 414:  MUST atender AA. O botão ativo MUST usar fundo sólido escuro do | 417:  ou ícone branco sobre fundo pastel/lavanda (branco-em-pastel).

- [x] G2: Tailwind content inclui src/lib (onde vivem as classes navActive)
  CHECK: node -e 'const c=require("./tailwind.config.js"); const ok=c.content.some((p)=>p.includes("src/lib")); console.log(JSON.stringify({ok,content:c.content})); if(!ok) process.exit(1);'
  EXPECT: "ok":true
  EVIDENCE: {"ok":true,"content":["./src/pages/**/*.{js,ts,jsx,tsx,mdx}","./src/components/**/*.{js,ts,jsx,tsx,mdx}","./src/app/**/*.{js,ts,jsx,tsx,mdx}","./src/lib/**/*.{js,ts,jsx,tsx,mdx}"]}

- [x] G3: Dados ativo é bg-blue-600 + text-white (sem bg-blue-50/100)
  CHECK: rg -n "bg-blue-600 text-white" src/lib/nfe-emission/form-steps.ts
  EXPECT: bg-blue-600 text-white
  EVIDENCE: 34:      'bg-blue-600 text-white font-extrabold shadow-md ring-2 ring-blue-800 ring-offset-2 ring-offset-slate-100 dark:bg-blue-500 dark:ring-blue-200 dark:ring-offset-slate-800',

- [x] G4: Todas as etapas ativas: fundo sólido 600/700 + text-white; inativas sem text-white
  CHECK: npx vitest run src/lib/__tests__/nfe-emission-form-steps.test.ts -t "contraste do bot"
  EXPECT: Test Files  1 passed
  EVIDENCE: Start at  22:02:31 | Duration  117ms (transform 24ms, setup 0ms, import 32ms, tests 2ms, environment 0ms)

- [x] G5: Teste existente de preenchimento/anel continua verde
  CHECK: npx vitest run src/lib/__tests__/nfe-emission-form-steps.test.ts
  EXPECT: Test Files  1 passed
  EVIDENCE: Start at  22:02:31 | Duration  180ms (transform 59ms, setup 0ms, import 69ms, tests 7ms, environment 0ms)

- [x] G6: Typecheck
  CHECK: npx tsc --noEmit
  EXPECT: 
  EVIDENCE: (no output)

- [x] G7: Lint dos arquivos tocados
  CHECK: npx eslint "src/app/(painel)/fiscal/issued/nova/page-client.tsx" src/lib/nfe-emission/form-steps.ts src/lib/__tests__/nfe-emission-form-steps.test.ts tailwind.config.js
  EXPECT: 
  EVIDENCE: (no output)

- [x] G8: Preview :3002 desta worktree
  CHECK: bash -c 'ss -ltnp 2>/dev/null | rg ":3002" >/dev/null && readlink /proc/$(ss -ltnp | rg ":3002" | rg -o "pid=[0-9]+" | head -1 | cut -d= -f2)/cwd'
  EXPECT: nfe-dados-botao-contraste
  EVIDENCE: /home/marce/qlmed/.worktrees/nfe-dados-botao-contraste

- [x] G9: CSS compilado inclui .bg-blue-600 (safelist + content src/lib)
  CHECK: npx tailwindcss -i src/app/globals.css -o /tmp/qlmed-tw-nfe.css --minify && rg -c "bg-blue-600" /tmp/qlmed-tw-nfe.css
  EXPECT: 1
  EVIDENCE: Rebuilding... | Done in 905ms.
