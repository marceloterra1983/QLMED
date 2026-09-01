# Gates: componentes Button e Field (etapa 2)

Escopo: absorver as escritas soltas do botão e o rótulo de campo remontado à mão
em dois componentes em `components/ui/`, e trancar com regra no verificador.

Base: `origin/main` @ 3de08d6 · worktree `feat/ui-button-field`

Inventário medido antes de editar (`/tmp/claude-1000/recon2.mjs`):

| medida | valor |
|---|---|
| elementos com superfície de botão | 80 (67 `<button>`, 9 `<Link>`, 4 `<a>`) |
| por variante | 33 primário · 27 fantasma · 13 secundário · 1 perigo · 6 outro |
| com ícone | 69 (86%) |
| com spinner de carregamento | 8 |
| com `disabled` | 21 |
| alturas em uso | `py-2.5` 25 · `py-2` 19 · `py-3.5` 10 · `py-1.5` 5 · `py-3` 4 |
| rótulo de campo remontado à mão | 35 |

---

- [x] **G1 — Base verde antes de tocar em código**
  CHECK: npm run typecheck && npm run lint && npm test && npm run ui:verify
  EXPECT: exit 0 nos quatro; 738 testes
  EVIDENCE: typecheck, lint e ui:verify exit 0; `Tests 738 passed | 4 skipped (742)`.

- [x] **G2 — `<Button>` cobre o inventário sem props sobrando**
  4 variantes × 3 tamanhos, `icon`, `loading`, `block`, e `as` para `Link`/`a`.
  Nada além do que os 80 sítios usam — sem prop especulativa.
  CHECK: npx vitest run src/components/ui/__tests__/Button.test.tsx
  EXPECT: exit 0
  EVIDENCE: 21 testes em `Button.test.tsx`/`Field.test.tsx`, exit 0. Renderizados com `react-dom/server` — sem jsdom nem testing-library, zero dependência nova. O inventário pediu duas variantes que eu não tinha previsto: `soft` (5 botões tingidos `bg-primary/10`) e `external` (2 âncoras `target="_blank"` mais as fronteiras de erro, que recarregam de propósito).

- [x] **G3 — `<Field>` junta rótulo, controle, dica e erro**
  Um `id` gerado liga `<label htmlFor>` ao controle; o erro liga por
  `aria-describedby` e marca `aria-invalid`. Hoje o rótulo é um `<label>` solto
  sem `htmlFor` em todos os 35 sítios — clicar no rótulo não foca o campo.
  CHECK: npx vitest run src/components/ui/__tests__/Field.test.tsx
  EXPECT: exit 0
  EVIDENCE: 9 testes provam a amarração `label htmlFor` ↔ `id` do controle, ids distintos entre campos, `aria-describedby` da dica, `aria-invalid` no erro e `aria-required`.

- [x] **G4 — Todos os 80 sítios migrados**
  Sem allowlist: uma regra com exceções apodrece. Itens de navegação
  (`SidebarNav`) não são botões e ficam fora do inventário.
  CHECK: node scripts/verify-ui-tokens.mjs
  EXPECT: seção `button` com 0 violações
  EVIDENCE: `ok   button: 0 violações`. 59 sítios migrados em 36 ficheiros. Sobraram 4 que a varredura marcava como botão e não são: dois cabeçalhos de acordeão, um `role="switch"` e o "Concluir nesta etapa" (fundo invertido `bg-slate-900`, com gancho `data-nfe-complete-step` de um gate existente).

- [x] **G5 — Regra tranca botão primário cru**
  Superfície de botão fora de `ui/Button` reprova.
  CHECK: bash scripts/test-ui-tokens-verifier.sh
  EXPECT: controle positivo do botão cru reprova; `ui/Button.tsx` isento
  EVIDENCE: `APROVADO: 8 violações reprovadas, fixture limpo aprovado`. Os controles cobrem botão primário cru e botão de perigo cru; o fixture limpo inclui uma ação só-ícone e um `role="switch"` com `bg-primary`, que **não** podem disparar.

- [x] **G6 — Nenhuma regressão de comportamento**
  `onClick`, `disabled`, `type`, `title`, `aria-label` e `href` preservados em
  cada sítio migrado; `loading` desabilita.
  CHECK: npm run typecheck
  EXPECT: exit 0 — prop perdida em `<Link>`/`<a>` quebra o tipo
  EVIDENCE: typecheck exit 0 em cada lote. Ele pegou o que a revisão manual não pegaria: uma inserção de import minha caiu dentro de um `import {` multilinha em `DuplicataEditPanel.tsx` e quebrou o ficheiro.

- [x] **G7 — Base verde depois**
  CHECK: npm run typecheck && npm run lint && npm test
  EXPECT: exit 0; contagem de testes ≥ a de G1 mais os novos
  EVIDENCE: typecheck e lint exit 0; `Tests 759 passed | 4 skipped (763)` — 738 da base mais 21 novos, nenhum perdido.

- [x] **G8 — Build de produção passa e o CSS sai completo**
  CHECK: npm run build
  EXPECT: exit 0, tabela de rotas completa (não só o 404 do Pages Router)
  EVIDENCE: exit 0, tabela de rotas completa, First Load JS compartilhado 103 kB, sem `app/` fantasma.

- [x] **G9 — Contraste não regrediu**
  Os pares de tema da etapa 1 valem para os componentes novos.
  CHECK: npm run ui:verify
  EXPECT: `primary`, `muted` e `scale` com 0 violações
  EVIDENCE: `ok primary / muted / scale: 0 violações`. A variante `soft` usa `text-primary-dark` (5,81:1 sobre o fundo tingido); `text-primary` daria 4,48:1, abaixo da AA.


---

**Defeitos meus, achados na passagem de revisão**

1. O verificador lia comentários como literais: uma crase em volta de
   `text-primary` na documentação do próprio `Button.tsx` virava violação.
   Passou a apagar comentários preservando offsets.
2. `ICON_SIZE` guardava só `text-[16px]`, e a regra da escala reclamava.
   Em vez de isentar o ficheiro — isenção apodrece — o mapa passou a guardar a
   classe completa `material-symbols-outlined text-[16px]`, que é o que ele
   sempre significou.
3. Um controle positivo voltou cego na etapa anterior deste trabalho:
   `toContain('disabled')` casava com a classe `disabled:opacity-45`, não com o
   atributo. Trocado por uma checagem que só olha a tag de abertura.

**Limite conhecido da regra**

Um botão cuja superfície vem inteira de uma variável escapa: a regra lê o
literal da `className`. Era o caso do `ConfirmDialog`, que montava
`confirmCls` fora do JSX — migrado à mão, e agora usa `variant`. Se voltar a
aparecer, vai ser por revisão, não pelo verificador.

**Não feito**

Dos 35 rótulos de campo remontados à mão, 14 viraram `<Field>`. Os outros 21
têm controle multilinha (um `<select>` com `<option>`s) ou rótulo dinâmico; o
codemod recusa esses de propósito em vez de adivinhar. Migram quando cada tela
for tocada.
