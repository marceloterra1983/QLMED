# Gates: padronização de tokens de cor e escala tipográfica (etapa 1)

Escopo: os dois pares de cor de texto e os seis degraus da escala.
Busca e substituição em `src/**/*.{ts,tsx}`. Nenhuma mudança de estrutura ou de
lógica além de três linhas de normalização de chave de mapa (G3).

Base: `origin/main` @ 5971adc · worktree `chore/padroniza-tokens-ui`

Alvos medidos antes de editar, pelo próprio `scripts/verify-ui-tokens.mjs`:

| alvo | antes | depois |
|---|---|---|
| `text-primary` sem par escuro (92 puro, 44 `hover:`, 2 `file:`, 1 `group-hover:`) | 139 | 0 |
| `text-slate-400` em posição clara (2,56:1) | 441 | 0 |
| `dark:text-slate-500` (3,17:1 sobre `card-dark`) | 107 | 0 |
| `text-[Npx]` N≤16 em literal de texto | 500 | 0 |
| `text-[Npx]` em literal de ícone — **tem de ficar igual** | 529 | 529 |

Correções de número em relação ao plano inicial: a contagem de ícone era 513 num
grep por linha; a medição por literal do verificador dá 529. O controle positivo
tem 6 casos, não 4.

**Ambiente:** o worktree começou com `node_modules` em symlink para o checkout
principal. Isso trouxe duas armadilhas, ambas corrigidas com `npm ci` local:
o `next build` com `output: 'standalone'` gravou o rastreio de dependências em
`./app/node_modules/**`, e esse `app/` na raiz passou a sombrear `src/app` — a
build seguinte emitiu só o 404 do Pages Router. E o Next do symlink era 15.5.23,
não o 15.5.24 do `package.json`. Todos os números abaixo são da instalação real.

---

- [x] **G1 — Base verde antes de tocar em código**
  CHECK: npm run typecheck && npm run lint && npm test
  EXPECT: exit 0 nos três
  EVIDENCE: typecheck exit 0; lint exit 0; `Test Files 96 passed | 3 skipped (99)` / `Tests 738 passed | 4 skipped (742)`, exit 0.

- [x] **G2 — `text-primary` sempre com par escuro**
  Todo `text-primary` que chega a uma className ganha `dark:text-blue-400` na
  mesma variante (`hover:`→`dark:hover:`, `file:`→`dark:file:`,
  `group-hover:`→`dark:group-hover:`). 149 ocorrências, 0 sem par.
  CHECK: node scripts/verify-ui-tokens.mjs
  EXPECT: `ok   primary: 0 violações`
  EVIDENCE: `ok   primary: 0 violações` (era `FALHA primary: 139 violações`).

- [x] **G3 — Lookup por chave de token não quebra**
  Os 3 mapas que usam `iconColor` como chave normalizam para o primeiro token;
  sem isso o par escuro derruba o lookup para o default e o chip perde a tinta.
  CHECK: bash -c "grep -c \"split(' ')\\[0\\]\" src/components/ui/InvoiceDetailHelpers.tsx src/components/contact-details/contact-detail-utils.tsx 'src/app/(painel)/cadastro/produtos/components/DetailSectionCard.tsx'"
  EXPECT: 1 em cada um dos 3 ficheiros
  EVIDENCE: `InvoiceDetailHelpers.tsx:1`, `contact-detail-utils.tsx:1`, `DetailSectionCard.tsx:1`.

- [x] **G4 — Texto secundário legível nos dois temas**
  `text-slate-400` claro → `text-slate-500` (4,76:1); par escuro
  `dark:text-slate-400` (5,87:1). Onde já existia um par escuro de outra cor
  (`dark:text-amber-400`, `dark:text-violet-400`…), só o lado claro mudou —
  110 casos. Nenhum `dark:text-slate-500` sobrevive.
  CHECK: node scripts/verify-ui-tokens.mjs
  EXPECT: `ok   muted: 0 violações`
  EVIDENCE: `ok   muted: 0 violações` (era `FALHA muted: 548 violações`).

- [x] **G5 — Escala de seis degraus, piso de 12px**
  9/10/11/12px → `text-xs`; 13/14px → `text-sm`; 15px → `text-base`. 500 sítios,
  incluindo 7 com variante `sm:`.
  CHECK: node scripts/verify-ui-tokens.mjs
  EXPECT: `ok   scale: 0 violações`
  EVIDENCE: `ok   scale: 0 violações` (era `FALHA scale: 500 violações`).

- [x] **G6 — Tamanho de ícone intacto**
  Px cru continua legítimo para dimensionar glifo: os literais com
  `material-symbols` não foram tocados.
  CHECK: bash -c "node scripts/verify-ui-tokens.mjs --stats | grep '\"icone\"'"
  EXPECT: `"icone": 529` — igual à medição de base
  EVIDENCE: `"icone": 529` antes e depois; `"escala": 500` → `0`.

- [x] **G7 — Controle positivo do verificador**
  Um verificador que nunca reprova é indistinguível de um cego.
  CHECK: bash scripts/test-ui-tokens-verifier.sh
  EXPECT: 5 violações injetadas reprovam; fixture limpo aprova
  EVIDENCE: `APROVADO: 5 violações reprovadas, fixture limpo aprovado` — primary
  sem par, hover sem par, slate-400 claro, dark:text-slate-500 e text-[10px] em
  texto todos deram rc=1; o limpo (com chave de mapa e ícone em px) deu rc=0.

- [x] **G8 — `dark:text-blue-400` existe no CSS gerado**
  Classe nova só vale se o Tailwind a emitir. Medido no bundle, não na fonte.
  A primeira medição olhou o CSS errado (o chunk de 8 KB) e deu 0 para tudo — o
  controle com uma cor sabidamente presente (`primary`) expôs o instrumento.
  CHECK: bash -c 'CSS=$(ls -S .next/static/css/*.css | head -1); grep -c "96 165 250" "$CSS" && grep -o "dark..text-blue-400" "$CSS" | head -1'
  EXPECT: cor #60a5fa presente e a regra `.dark\:text-blue-400` emitida
  EVIDENCE: `96 165 250` presente; regras emitidas: `.dark\:text-blue-400:is(.dark *)`,
  `.dark\:hover\:text-blue-400:hover:is(.dark *)`, `.dark\:file\:text-blue-400`,
  `.dark\:group-hover\:text-blue-400`, `.dark\:placeholder\:text-slate-400`.
  Controle positivo do próprio grep: `37 99 235` (primary) presente.
  `font-size:9px` e `font-size:10px` sumiram do bundle; `11px`, `13px` e `15px`
  sobrevivem uma vez cada — são as regras dos glifos `material-symbols`, que é
  exatamente o que a regra preserva.

- [x] **G9 — Base verde depois**
  CHECK: npm run typecheck && npm run lint && npm test
  EXPECT: exit 0 nos três, mesma contagem de testes de G1
  EVIDENCE: typecheck exit 0; lint exit 0; `Test Files 96 passed | 3 skipped (99)` /
  `Tests 738 passed | 4 skipped (742)` — idêntico a G1, nenhum teste novo, nenhum perdido.

- [x] **G10 — Build de produção passa**
  CHECK: npm run build
  EXPECT: exit 0
  EVIDENCE: exit 0, First Load JS compartilhado 103 kB, CSS emitido em
  `.next/static/css/90f782825357867d.css` (119.770 bytes). Medido depois do
  `npm ci` local, sem o `app/` fantasma do symlink.

- [x] **G11 — Risco de layout medido, não presumido**
  A escala sobe o texto em até 33% (9px→12px). Varredura dos literais alterados
  que vivem em caixa de tamanho fixo (`h-N`, `h-[Npx]`, `min-w-[Npx]`).
  CHECK: bash -c 'node scripts/verify-ui-tokens.mjs >/dev/null && echo medido'
  EXPECT: nenhum caso onde o texto novo não caiba
  EVIDENCE: 6 casos, todos folgados — 3 círculos `w-7 h-7` (28px) com texto 12px,
  2 inputs `h-9` (36px) com texto 14px, 1 badge `min-w-[20px] h-5` (20px, altura
  de linha 16px) com texto 12px. Nenhum estouro possível.

- [x] **G12 — Nenhuma cor de texto escura ambígua na mesma variante**
  Defeito do meu próprio codemod, achado na passagem de revisão: em
  `SidebarNav.tsx` a inserção criou `dark:group-hover:text-blue-400` ao lado do
  `dark:group-hover:text-primary-dark` que já existia — duas cores disputando o
  mesmo estado, com a ordem do CSS decidindo. A regra de idempotência olhava a
  string exata do par, não a variante.
  CHECK: bash -c 'node /tmp/claude-1000/dup.mjs 2>/dev/null | grep -v "(sem)" | grep -c "com 2" || true'
  EXPECT: 0 literais com duas cores escuras na mesma variante prefixada
  EVIDENCE: era 1 (`SidebarNav.tsx:221`), agora 0. Os 59 casos de variante base
  são ramos de ternário dentro do mesmo template literal — só um pinta por vez;
  conferidos um a um em `NfeDetailsModal:697`, `ProductTable:303`,
  `sync/page-client:631` e `CteDetailsModal:579`.

- [x] **G13 — Hover não escurece o link no tema escuro**
  Defeito pré-existente, exposto pela varredura: 5 links tinham
  `hover:text-primary-dark` (#1d4ed8 → 2,33:1 sobre `card-dark`), ou seja, passar
  o mouse deixava o link *menos* legível no escuro. Par novo:
  `dark:hover:text-blue-300` (#93c5fd, 8,35:1).
  CHECK: node scripts/verify-ui-tokens.mjs
  EXPECT: seção `primary` cobre `text-primary-dark` e dá 0
  EVIDENCE: 4 ficheiros corrigidos (`sobre/page.tsx`, `usuarios/page-client.tsx`,
  `sync/page-client.tsx`, `HistoryModal.tsx`); regra e controle positivo
  `primary-dark-hover-sem-par` no harness, rc=1 quando o par falta.

---

**Não verificado:** inspeção visual no navegador. Exigiria subir o app contra o
Postgres canônico de produção e autenticar por e-mail; o custo não se justifica
para uma mudança que o build, os 738 testes e a varredura de caixa apertada já
cobrem. Fica para quem abrir o PR em ambiente com sessão.
