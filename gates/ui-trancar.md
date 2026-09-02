# Gates: trancar (etapa 4)

Base: `origin/main` @ f8b938a · worktree `chore/ui-trancar`

Quatro frentes disjuntas, em paralelo. Cada uma tem dono de ficheiros; eu
integro, varro o que sobrar e fecho o ledger.

| frente | ficheiros |
|---|---|
| A · CI | `.github/workflows/ci.yml`, `scripts/verify-ci-hardening.sh`, `scripts/test-ci-hardening.sh`, `package.json` |
| B · confirmação | `ui/ConfirmDialog.tsx` (+teste), `fiscal/cte/page-client.tsx`, `settings/components/IntegrationsSection.tsx`, `scripts/verify-ui-dialogs.mjs`, `scripts/test-ui-dialogs-verifier.sh` |
| C · menu e config | `components/SidebarNav.tsx`, `tailwind.config.js` |
| D · varredura de classes | `scripts/verify-ui-tokens.mjs`, `scripts/test-ui-tokens-verifier.sh`, e os `.tsx` que não pertencem a B nem a C |

---

- [x] **G1 — Base verde**
  CHECK: npm run typecheck && npm run lint && npm test && npm run ui:verify && npm run ui:dialogs
  EXPECT: exit 0; 784 testes
  EVIDENCE: typecheck, lint, ui:verify e ui:dialogs exit 0; `Tests 784 passed | 4 skipped (788)`.

- [x] **G2 — Os quatro verificadores correm no CI e reprovam o PR**
  `ui:verify`, `ui:dialogs`, `ui:gallery:check` (depois do build) e os quatro
  harnesses de controle positivo. O guard de hardening tem de continuar a
  passar — ele impõe padrões próprios sobre o workflow.
  CHECK: npm run ci:verify && grep -c "ui:verify\|ui:dialogs\|ui:gallery" .github/workflows/ci.yml
  EXPECT: guard passa; ≥ 3 ocorrências no workflow
  EVIDENCE: job `app`: `UI · regras e controles` (`npm run ui:check` = verify + dialogs + 3 harnesses) entre Lint e Test; `UI · galeria contra o CSS do build` depois de Build. `ci:verify` passa (10/10). O guard de hardening não ganhou regra de UI de propósito: é portão de segurança com spec (SPEC-013) — fica como recomendação.

- [x] **G3 — `ConfirmDialog` em cima de `ui/Modal`, com foco preso**
  Hoje é o único diálogo sem trap. Reconstruído como caso especial do Modal,
  sem copiar lógica de foco.
  CHECK: npx vitest run src/components/ui/__tests__/ConfirmDialog.test.tsx
  EXPECT: exit 0; o ficheiro não contém `focusable`, `Tab`, `Escape` nem `body.style.overflow`
  EVIDENCE: `ConfirmDialog.test.tsx` 7 testes, 5 controles positivos reprovam. `grep -c` de `Escape|focusable|Tab|body.style.overflow|useModalBackButton|previousFocusRef` = 0 cada: só importa `Modal` e `Button`.

- [x] **G4 — Nenhum `window.confirm` / `window.alert` sobrevive** (achado 08)
  Os dois sítios (CT-e em lote, remover OneDrive) passam a `ConfirmDialog`,
  dizendo quantos registos e o quê. Regra nova no verificador de diálogos.
  CHECK: npm run ui:dialogs && npm run ui:dialogs:test
  EXPECT: seção `nativo` com 0 violações; controle positivo reprova
  EVIDENCE: `ok   nativo: 0 violações`; `ui:dialogs:test` APROVADO 7. CT-e em lote: "Manifestar em lote — {ação} para {N} CT-e selecionado(s)?" (primary: registrar/cancelar desacordo revertem-se, não destroem). OneDrive: "Remover conexão OneDrive", `danger`, `loading` amarrado ao estado real.

- [x] **G5 — O item ativo do menu não salta** (achado 09)
  `border-l-4` sai; marca por `box-shadow: inset` que não ocupa espaço.
  CHECK: grep -c "border-l-4" src/components/SidebarNav.tsx
  EXPECT: 0
  EVIDENCE: `grep -c border-l-4 SidebarNav.tsx` = 0. Marca por `shadow-[inset_4px_0_0_0_#2563eb] dark:shadow-[inset_4px_0_0_0_#60a5fa]`; padding do ativo igual ao do inativo. De carona: o item ativo estava com `text-primary` **sem par escuro** — escondido num template aninhado que o verificador não lê (ver nota abaixo). Par adicionado.

- [x] **G6 — `borderRadius` morto sai do `tailwind.config.js`** (achado 11)
  Os quatro valores eram idênticos ao padrão do Tailwind 3.4.
  CHECK: grep -c "borderRadius" tailwind.config.js
  EXPECT: 0
  EVIDENCE: `grep -c borderRadius tailwind.config.js` = 0; `require` OK. `accent` mantido (2 usos: `UserProfile.tsx:34`, `login/page.tsx:91`).

- [x] **G7 — Foco: um anel só** (achado 07)
  `focus:ring-*`, `focus:border-*` e `focus:outline-none` saem dos literais;
  o contorno vem do `globals.css`. Regra nova no verificador de tokens.
  CHECK: npm run ui:verify
  EXPECT: seção `focus` com 0 violações
  EVIDENCE: `ok   focus: 0 violações`. 206 → 0: 180 pelo codemod em 21 ficheiros, 8 à mão em `IntegrationsSection`, 2 em `cte`, e o `FILTER_INPUT_CLS` de `src/lib/utils.ts` (20+ campos). `shortNameInputClass` apagado: só continha `focus:*` por tipo de contacto.

- [x] **G8 — Três raios** (achado 03)
  `rounded-md` → `rounded-lg`; `rounded-2xl` → `rounded-xl`; `rounded-full` fica.
  Regra nova no verificador.
  CHECK: npm run ui:verify
  EXPECT: seção `radius` com 0 violações
  EVIDENCE: `ok   radius: 0 violações`. 81 → 0: 80 pelo codemod em 27 ficheiros (inclui `ui/Modal.tsx` sunken `sm:rounded-2xl` → `sm:rounded-xl`), 1 à mão em `cte`.

- [x] **G9 — Borda de campo única** (achado 04, resto)
  `border-slate-300 dark:border-slate-600` em controle vira `slate-200/700`.
  CHECK: npm run ui:verify
  EXPECT: seção `field` com 0 violações
  EVIDENCE: `ok   field: 0 violações`. 39 → 0: 35 pelo codemod em 6 ficheiros, 2 à mão em `cte`. A regra só olha `className` de `input|select|textarea` — `<div>` com borda 300 continua permitido (está no fixture limpo).

- [x] **G10 — Controles positivos das regras novas**
  CHECK: npm run ui:verify:test && npm run ui:dialogs:test
  EXPECT: cada regra nova tem um caso que reprova
  EVIDENCE: `ui:verify:test` APROVADO **18** (5 regras novas + `classe-em-template-aninhado`); `ui:dialogs:test` APROVADO **8** (`window-confirm`, `alert-nu`, `overlay-em-template-aninhado`).

- [x] **G11 — Base verde depois, com build**
  CHECK: npm run typecheck && npm run lint && npm test && npm run build && npm run ui:gallery:check
  EXPECT: exit 0 em todos
  EVIDENCE: typecheck e lint exit 0; `Tests 791 passed | 4 skipped (795)`; `next build` Compiled successfully; `ui:gallery:check` 28/32/40/44px; `ui:gallery:test` 3; `test-ui-modal-trap.sh` 4; `docs:validate` 160 ficheiros; `ci:verify` passa; `ui:check` OK.


---

## O que entrou além do plano

- **`FILTER_INPUT_CLS` em `src/lib/utils.ts`** carregava `focus:ring-2 focus:ring-primary/50 focus:border-primary` para 20+ campos — anel duplo por cima do contorno global. Removido; `placeholder-slate-500` no claro (slate-400 dá 2,56:1). O teste de contrato passa a afirmar o contrário do que afirmava.
- **Diálogo de excluir CT-e nunca fechava depois de excluir** (`fiscal/cte/page-client.tsx`, apanhado pelo agente ao migrar o `window.confirm` vizinho). `setShowDeleteConfirm(false)` no ramo de sucesso.
- **Item ativo do menu sem par escuro** desde a etapa 1: `text-primary` num template **aninhado**, que a regex de literais não lia. Par adicionado; scanner novo (ver abaixo).
- **`node_modules` desapareceu** a meio da rodada, com três agentes em voo; restaurado com `npm ci` (19 s). Causa não identificada.

- **O scanner de literais estava cego, de duas formas.** A regex `"…"|'…'|`…``
  parava no primeiro backtick: (1) num template **aninhado** o interno ficava
  fora de qualquer literal; (2) um **regex com aspa** dentro de `${…}` —
  `replace(/"/g, '""')` — abria uma string falsa, o fecho verdadeiro virava
  abertura e o corpo engolia o ficheiro até ao próximo backtick. **239 literais
  de classe** não eram lidos. Novo `scripts/ui-literais.mjs`: lexer que conta
  `${`/`}`, reconhece regex em posição de operando, descarta string não fechada
  na linha (apóstrofo em texto JSX), com autoteste (`node scripts/ui-literais.mjs`).
  Os dois verificadores importam-no. Sobre os 239, uma violação real escondida
  desde a etapa 1: `text-[16px]` em `nova/page-client.tsx:484`.
- **`npm ci` sem `postinstall`**: a política `install-scripts` do npm bloqueou o
  `prisma generate`; o client ausente derrubou 8 testes de emissão atómica e a
  coleta de páginas do build com mensagens que não apontavam para isso.
  `npm run db:generate` resolve; fica na memória.

## Depois do merge com o `main` (#252, #257, #259)

- `#252` tinha posto no `ConfirmDialog` um hook `useDialogKeydown` (Esc + trap,
  QLMED-UI-004). Superado: o `ConfirmDialog` daqui herda tudo do `Modal`. Hook
  removido — ficaria órfão e duplicaria `focus-trap.ts`.
- O teste de render do `#252` (`ConfirmDialog.render.test.tsx`, jsdom) reprovava
  a volta do Tab: `focaveis()` filtrava por `offsetParent !== null`, e **jsdom
  não tem layout** — a lista ficava vazia. O filtro geométrico é necessário no
  navegador (X do desktop e "Voltar" do celular são `display:none` conforme a
  largura); agora: geometria quando vê alguém, lista crua quando não. 33/33.
- `#252` tirou `handleKeyDown` das dependências do `useEffect` do `Modal`
  (`[isOpen]`): um `onClose` novo depois de aberto deixava o handler velho
  ligado ao Esc. Restaurado `[isOpen, handleKeyDown]`; ESLint limpo.
- `npm ci` falhou uma vez (transitório, sem linha de erro no log) e passou na
  segunda; `prisma generate` a seguir, como a memória manda.
