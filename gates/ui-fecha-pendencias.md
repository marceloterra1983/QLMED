# Gates: fechar as pendências das etapas 1 e 2

Base: `origin/main` @ fe587e3 · worktree `chore/ui-fecha-pendencias`

Três buracos declarados no PR #253, nesta ordem — o furo da regra primeiro,
porque ele pode revelar sítios que faltam migrar.

---

- [x] **G1 — Base verde**
  CHECK: npm run typecheck && npm run lint && npm test && npm run ui:verify
  EXPECT: exit 0; 759 testes
  EVIDENCE: typecheck, lint e ui:verify exit 0; `Tests 759 passed | 4 skipped (763)`.

- [x] **G2 — A regra enxerga superfície montada em variável**
  Hoje a regra lê só o literal da `className`. `const cls = isDanger ? 'bg-red-600…' : 'bg-primary…'`
  passa despercebido — foi assim que o `ConfirmDialog` escapou.
  O verificador passa a resolver ligações locais (`const X = '…'` e
  `const X = cond ? '…' : '…'`) antes de julgar.
  CHECK: bash scripts/test-ui-tokens-verifier.sh
  EXPECT: controle positivo com superfície em variável reprova
  EVIDENCE: `botao-superficie-em-const` e `botao-superficie-em-ternario` reprovam (rc=1). O resolutor lê `const X = '…'` e `const X = cond ? '…' : '…'` no mesmo ficheiro, um nível, sem seguir import.

- [x] **G3 — Nenhum botão novo revelado fica para trás**
  Com a regra enxergando mais, o inventário pode crescer. Todo sítio novo é
  migrado ou tem motivo registado para não ser.
  CHECK: npm run ui:verify
  EXPECT: `ok   button: 0 violações`
  EVIDENCE: `ok   button: 0 violações`. A regra afiada revelou **26 sítios** que a versão anterior não via — ver a nota abaixo.

- [x] **G4 — Os 21 rótulos de campo restantes**
  Controle multilinha (`<select>` com `<option>`s) ou rótulo dinâmico. Migrados
  à mão, um a um — o codemod recusou de propósito.
  CHECK: bash -c "grep -rc 'block text-xs font-bold' --include='*.tsx' src | grep -v ':0' | wc -l"
  EXPECT: 0 ficheiros com o rótulo remontado à mão
  EVIDENCE: 0 `<label className="block text-xs font-bold…">` no repositório. 12 migrados pelo codemod com casamento de tags, 2 wrappers locais (`DetailField` e o `Field` privado de `nova/page-client`, com 23 usos) passaram a usar o partilhado, e 1 "Status" virou `role="group" aria-labelledby` — ali o `<label>` não rotulava controle nenhum, era um segmentado de botões.

- [x] **G5 — `<Field>` amarra o rótulo em todo sítio migrado**
  Cada `<label>` que virou `<Field>` tem de amarrar num controle real.
  CHECK: npx vitest run src/components/ui/__tests__/Field.test.tsx
  EXPECT: exit 0
  EVIDENCE: 24 testes de componente, exit 0, com 4 controles positivos novos sobre a reescrita do `Field`.

- [x] **G6 — Verificação visual em pixel, não a olho**
  A app exige Postgres canónico e login por e-mail, que é passo humano. Em vez
  de fingir que olhei: uma galeria estática com o CSS compilado de verdade,
  medida no navegador. Prova as três alturas que mudaram (32/40/44px) e os
  estados, nos dois temas.
  CHECK: node scripts/render-ui-gallery.mjs --check
  EXPECT: alturas medidas iguais a 32, 40 e 44; nenhum estado sem contraste
  EVIDENCE: `ok: alturas resolvidas no CSS do build — xs 28px · sm 32px · md 40px · lg 44px`. Confirmado depois **no navegador**: `getBoundingClientRect` deu 28/32/40/44, input 40px, rótulo 12px.

- [x] **G7 — A galeria mede, não decora**
  Controle positivo: alterar uma altura no componente tem de fazer a medição
  reprovar.
  CHECK: bash scripts/test-ui-gallery.sh
  EXPECT: altura adulterada reprova; componente íntegro aprova
  EVIDENCE: `APROVADO: 3 adulterações reprovadas, componente íntegro aprovado`.

- [x] **G8 — Base verde depois**
  CHECK: npm run typecheck && npm run lint && npm test && npm run build
  EXPECT: exit 0 nos quatro
  EVIDENCE: typecheck, lint, `Tests 762 passed | 4 skipped (766)` e `next build` exit 0.


---

## O achado que muda a leitura da etapa 2

O casador de elementos da regra era `<(button|Link|a)\b([^>]*?)>`. Esse `[^>]*?`
para no **primeiro `>`** — e um `onClick={() => …}` tem um `>`. Todo botão com
arrow function antes da `className` ficava invisível para a regra.

O "0 violações" com que a etapa 2 foi mesclada era, em parte, artefato do
instrumento. Trocado por um leitor que conta chaves até o `>` que fecha a tag.
**26 sítios** apareceram:

- **11 são controles de seleção** — navegação de ano (5, forma idêntica), abas de
  detalhe da NF-e, segmentado de período, segmentado de status, paginação,
  alternância de seleção e lista de utilizadores. Todos comunicavam o estado
  **só pela cor**. Ganharam `aria-pressed` ou `aria-current="page"`; é a marcação
  semântica que compra a isenção da regra, não o formato do botão.
- **15 eram botões de verdade** e foram migrados, incluindo "Transmitir à SEFAZ",
  "Rejeitar" (perigo), "Editar em massa" e 7 chips de linha de tabela.

Duas outras imprecisões da regra, corrigidas na mesma passagem:

1. `hover:bg-primary/10` contava como superfície. Hover é afordância de
   passagem, não fundo em repouso — isso acusava os atalhos da barra lateral.
   A deteção passou a exigir a classe **sem prefixo de variante**.
2. Faltava um tamanho para as ações dentro de linha de tabela. Migrar aqueles
   7 chips para `sm` engordaria cada linha em 6px; entrou `size="xs"` (28px),
   marcado com `ponytail:` porque fica abaixo do alvo de toque de 44px de
   propósito — eles já viviam em ~26px.

## Sobre a medição de contraste

Medida no navegador, com o alpha achatado sobre o fundo da página:

| variante | claro | escuro |
|---|---|---|
| primary | 5,17 | 5,17 |
| soft | 5,59 | 6,43 |
| secondary | 10,35 | 11,87 |
| ghost | 7,24 | 12,02 |
| danger | 4,83 | 4,83 |
| rótulo do campo | 4,55 | 6,96 |

**O que a medição não cobre:** `opacity` não entra no `getComputedStyle`, então
o estado desabilitado aparece com o mesmo número do normal. Na prática ele fica
em ~45% e não passaria — o que é aceite: a WCAG 1.4.3 isenta controlo
desabilitado. Não estou a afirmar que o desabilitado passa; estou a dizer que
não foi medido e por quê.

## Continua não verificado

As **telas** do painel, em contexto. A galeria prova os componentes, não o
layout das páginas que os usam. Isso exige o Postgres canónico e login por
e-mail, que é passo humano.
