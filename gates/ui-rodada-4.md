# Gates: um só cartão de seção (rodada 4)

Base: `origin/main` @ 895d701 · worktree `feat/ui-rodada-4`

Quatro componentes fazem a mesma coisa — chip de ícone colorido, título,
corpo, às vezes subtítulo/badge, às vezes recolhível — com três cópias do mapa
de cor do chip:

| componente | sítios | ficheiros | props reais |
|---|---|---|---|
| `SectionBlock` (ui/InvoiceDetailHelpers) | 37 | 3 | title, icon, iconColor |
| `CollapsibleCard` (ui/) | 10 | 4 | icon, title, badge?, variant? — recolhível não controlado |
| `SectionCard` (contact-details) | 6 | 1 | title, subtitle, icon, iconColor, open, onToggle — controlado |
| `DetailSectionCard` (produtos) | 4 | 1 | id, icon, iconColor, title, isOpen, onToggle(id), badge? — controlado |

Total: **57 sítios em 9 ficheiros** (o "133" da rodada 2 contava importações e definições).

---

- [x] **G1 — Base verde**
  CHECK: npm run typecheck && npm run lint && npm test && npm run ui:check
  EXPECT: exit 0
  EVIDENCE: typecheck, lint, ui:check exit 0; `Tests 1366 passed | 9 skipped (1375)`.

- [x] **G2 — `<Section>` cobre as quatro formas sem prop especulativa**
  `icon`, `title`, `subtitle?`, `tone?`, `badge?`, `variant?`, recolhível
  controlado (`open`/`onToggle`) ou não (`defaultOpen`), `id?`, `className?`.
  Em cima de `<Card>`. Um só mapa de tom.
  CHECK: npx vitest run src/components/ui/__tests__/Section.test.tsx
  EXPECT: exit 0, controles positivos
  EVIDENCE: `Section.test.tsx` 8 testes; 3 controles positivos reprovam (`aria-expanded` sempre true; corpo renderizado fechado; primary sem par escuro). Um só mapa `TONE` com 10 tons; em cima de `<Card padding="none">`.

- [x] **G3 — Os 57 sítios migrados, os quatro componentes apagados**
  CHECK: bash -c '! grep -rEn "<(SectionBlock|CollapsibleCard|SectionCard|DetailSectionCard)\b" --include=*.tsx src | grep -v __tests__'
  EXPECT: nenhum uso em JSX (o comentário histórico do Section pode citar os nomes)
  EVIDENCE: 0 usos em JSX. 57 sítios migrados (49 pelo codemod, 8 à mão: tone repassado por três wrappers locais, `shortNameTone` na origem em `contact-kinds.ts`, `badgeDe` para os quatro badges `{label, color}` das integrações). Apagados: `CollapsibleCard.tsx`, `SectionBlock`+`bgMap` (fica `Field`), `SectionCard`+`iconBgMap` local, `DetailSectionCard`+`iconBgMap` de `product-utils`. O ficheiro que só tinha `DetailField`/`BulkFieldRow` passa a `product-detail-fields.tsx`.

- [x] **G4 — Regra `section` tranca os nomes antigos**
  CHECK: npm run ui:verify && npm run ui:verify:test
  EXPECT: `ok   section: 0 violações`; harness 30 → 31
  EVIDENCE: `ok   section: 0 violações` (18 seções ok); `ui:verify:test` APROVADO **32** (31 + `cartao-de-secao-antigo`); fixture limpo com `<Section defaultOpen>`.

- [x] **G5 — Recolhível acessível**
  O cabeçalho recolhível é `<button aria-expanded aria-controls>`; o corpo tem
  `id`. Hoje o `CollapsibleCard` tem botão sem `aria-expanded`; o `SectionCard`
  e o `DetailSectionCard` têm de ser verificados.
  CHECK: npx vitest run src/components/ui/__tests__/Section.test.tsx -t expanded
  EXPECT: exit 0
  EVIDENCE: Botão do cabeçalho com `aria-expanded` e `aria-controls` apontando para o `id` do corpo; fixo é `<h3>` sem botão. Testado nos dois estados.

- [x] **G6 — Base verde depois, com build**
  CHECK: npm run typecheck && npm run lint && npm test && npm run build && npm run ui:check && npm run ui:gallery:check
  EXPECT: exit 0
  EVIDENCE: typecheck e lint exit 0; `Tests 1374 passed | 9 skipped (1383)`; `next build` Compiled successfully; `ui:check` OK; `ui:gallery:check` 28/32/40/44px.


---

## Notas

- O "133" da rodada 2 contava importações e definições; os sítios JSX reais eram 57 em 9 ficheiros.
- Recolhível deixou de ter animação de slide (o `CollapsibleCard` tinha `grid-rows` animado): o corpo monta e desmonta. Ganha `aria-expanded`/`aria-controls`, que nenhum dos dois recolhíveis tinha; perde uma transição de 200 ms.
- `SectionCard` montava os filhos só depois da primeira abertura (`hasBeenOpened`) — o `Section` faz o mesmo por construção (não renderiza fechado).
- Um mapa de tom com 10 entradas substitui três cópias (`bgMap`, dois `iconBgMap`) e o par claro/escuro do `primary` fica num sítio só.
