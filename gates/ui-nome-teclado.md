# Gates: nome acessível e teclado (etapa 6)

Base: `origin/main` @ f172429 · worktree `audit/ui-rodada-2` · `SortableTh` em d9e7ecc

Segunda rodada de varredura. O padrão das etapas 1–5 não cobria:

| medida | antes |
|---|---|
| botão só-ícone sem `aria-label` | 157 em 39 ficheiros |
| controle (`input\|select\|textarea`) sem rótulo | 89 em 18 |
| `<th onClick>` sem teclado nem `aria-sort` | 39 em 8 |
| `text-slate-300` como texto (1,9:1) | 22 em 15 |

Backlog medido, fora desta etapa: 71 formatações de número/data fora dos
helpers (26 fich.), 60 cartões de superfície à mão (26), 4 implementações de
cartão de seção (SectionBlock 78, CollapsibleCard 29, SectionCard 14,
DetailSectionCard 12), 25 spinners à mão (19), 34 cores cravadas (12).

Partição exclusiva por ficheiro:

| frente | ficheiros |
|---|---|
| A | os 8 com `<th onClick>` (lista em `/tmp/claude-1000/sortable-files.txt`), inteiros |
| B | `src/components/**` menos `ui/` menos os de A |
| C | `src/app/**` menos os de A |
| T | regras `iconbtn`, `label`, `sortable`, `faint` + harness + `SortableTh.test.tsx` |

---

- [x] **G1 — Base verde**
  CHECK: npm run typecheck && npm run lint && npm test && npm run ui:check
  EXPECT: exit 0
  EVIDENCE: typecheck, lint e ui:check exit 0; `Tests 1334 passed | 9 skipped (1343)`.

- [x] **G2 — `<SortableTh>` testado**
  CHECK: npx vitest run src/components/ui/__tests__/SortableTh.test.tsx
  EXPECT: exit 0, com controles positivos
  EVIDENCE: `SortableTh.test.tsx` — `Tests 6 passed (6)`; 3 controles positivos reprovam (`aria-sort` sempre presente, `<button>` vira `<div>`, glifo trocado).

- [x] **G3 — Nenhum `<th onClick>` sobrevive**
  CHECK: npm run ui:verify
  EXPECT: seção `sortable` com 0 violações
  EVIDENCE: `ok   sortable: 0 violações` — 39 `<th onClick>` em 8 ficheiros viraram `<SortableTh>`; 6 `getSortIcon` e 2 `SortIcon` locais apagados. Cabeçalhos ficam em `py-3` (eram `py-1.5`/`py-2.5`): mais altos, coerentes com a linha de 44px.

- [x] **G4 — Todo botão só-ícone tem nome**
  CHECK: npm run ui:verify
  EXPECT: seção `iconbtn` com 0 violações
  EVIDENCE: `ok   iconbtn: 0 violações` — 157 → 0 em 39 ficheiros: `aria-label` igual ao `title` quando havia, senão pelo vocabulário fixo por glifo, com o objeto quando à mão. Desvios deliberados: `close` que limpa/remove virou "Limpar busca"/"Remover filtro X"/"Remover ficheiro". A regra passou a contar `{tab.label}` como texto visível.

- [x] **G5 — Todo controle tem rótulo**
  CHECK: npm run ui:verify
  EXPECT: seção `label` com 0 violações
  EVIDENCE: `ok   label: 0 violações` — 89 → 0. `aria-label` com o cabeçalho da coluna ou o placeholder, e o item quando à mão ("NCM do item 3", "Quantidade do lote do item 2"); checkboxes de seleção "Selecionar NF-e 1284". A regra passou a reconhecer wrappers `*Field` (`DetailField`); três `<select>` num ramo de ternário longe do wrapper ganharam `aria-label` explícito.

- [x] **G6 — `text-slate-300` só em ícone**
  CHECK: npm run ui:verify
  EXPECT: seção `faint` com 0 violações
  EVIDENCE: `ok   faint: 0 violações` — 22 → 0. Trocas reais em texto: máscaras `••••` de valor oculto (3 listas fiscais), separadores `/` e `—` vazios (ProductTable, válvulas), descrição fora de linha. Zero trocas em `src/components`: lá era tudo ícone. A regra passou a isentar a cor no `<button>` de um botão só-ícone (herança para o glifo).

- [x] **G7 — Controles positivos das regras novas**
  CHECK: npm run ui:verify:test
  EXPECT: 21 → 25
  EVIDENCE: `ui:verify:test` APROVADO **26** (21 + `th-onclick`, `botao-so-icone`, `botao-so-icone-com-title` — title não basta —, `controle-sem-rotulo`, `texto-slate-300`); fixture limpo com botão nomeado, botão com texto, input com aria-label, ícone slate-300 e `<SortableTh>`.

- [x] **G8 — Base verde depois, com build**
  CHECK: npm run typecheck && npm run lint && npm test && npm run build && npm run ui:check && npm run ui:gallery:check
  EXPECT: exit 0
  EVIDENCE: typecheck e lint exit 0; `Tests 1340 passed | 9 skipped (1349)`; `next build` Compiled successfully; `ui:check` OK; `ui:gallery:check` 28/32/40/44px; `ui:verify` **13** seções a zero; `ui:dialogs` 3; `docs:validate`; `ci:verify`.


---

## Notas da rodada

- **Regra `iconbtn` acusava botão com texto em expressão** (`<span>{tab.label}</span>`, `{theme.pdfLabel}`, `{u.name}`): três agentes tropeçaram nisso. Um identificador dentro de `{…}` passa a contar como rótulo visível; fixture no limpo prova. Dois agentes já tinham posto `aria-label` redundante nesses sítios — inofensivo.
- **Regra `faint` acusava `text-slate-300` no `<button>` de um ícone** (chevron de colapsar, lixeira): a cor é herdada pelo glifo. Isento por posição; fixture no limpo.
- **`SortableTh` recuperou `print:hidden`** no glifo (o relatório de válvulas imprime).
- Cabeçalhos ordenáveis subiram de `py-1.5`/`py-2.5` para `py-3`: coerente com a linha de 44px; é mudança visível.
- Checkboxes de seleção de linha ganharam `aria-label` (`Selecionar NF-e 1284`) apesar de a regra `label` os isentar — o brief pedia.
- `sortOrder` passou a `useState<'asc'|'desc'>` em 5 ficheiros; `FinanceiroTable` faz `as` porque a prop do pai é `string`.
- C desviou do vocabulário onde o glifo mentia: `close` que limpa/remove virou "Limpar busca", "Remover filtro X", "Remover ficheiro". Certo.
- `ReadFieldEditor` (CASSEMS/IMPCG) rotula com `<dt>`, não `<label>`: 13 controles ganharam `aria-label` com o texto do `<dt>`.
- Todos os agentes correram sem colisão; C demorou 6,5 min (17 ficheiros, 51 `aria-label` em botões, 51 em controles).
