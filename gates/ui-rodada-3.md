# Gates: formatação, cartão, spinner, cor cravada (rodada 3)

Base: `origin/main` @ eb99705 · worktree `feat/ui-rodada-3`

Backlog medido na rodada 2, sem o cartão de seção (fica para a 4). Medido:

| medida | antes |
|---|---|
| número/data fora dos helpers | ~59 `toLocaleString('pt-BR')`, 10 `toFixed`, 6 datas, 1 `Intl` — 26 fich. |
| cartão de superfície à mão | 60 em 26 fich., 10 paddings, 22 com sombra |
| spinner à mão | 25 em 19 fich., 9 tamanhos |
| cor cravada | 33 fora de `ui/`; 18 são sombra de folha (16) e marca do menu (2); 15 legítimas (visor XML, erro global, `theme-color`) |

Partição exclusiva por ficheiro: P1 = `src/components/**` menos `ui/`; P2 = `src/app/**`; T = regras `format`, `card`, `spinner`, `shadow` + testes de `Card`/`Spinner` + harness.

---

- [x] **G1 — Base verde**
  CHECK: npm run typecheck && npm run lint && npm test && npm run ui:check
  EXPECT: exit 0
  EVIDENCE: typecheck, lint e ui:check exit 0; `Tests 1345 passed | 9 skipped (1354)`.

- [x] **G2 — `Card`, `Spinner`, `formatInt`, `formatPercent` testados**
  CHECK: npx vitest run src/components/ui/__tests__/Card.test.tsx src/components/ui/__tests__/Spinner.test.tsx src/lib/__tests__/utils.test.ts
  EXPECT: exit 0, com controles positivos
  EVIDENCE: `Card.test` 4, `Spinner.test` 4, `utils.test` 22 + 2 describes novos (`formatDateTimeSeconds`, `formatQuantity`); 6 controles positivos reprovam (sombra no Card, `padding="none"` a emitir `p-4`, `as` ignorado; Spinner sem `role`, sem `animate-spin`, sem `aria-hidden`).

- [x] **G3 — Formatação só pelos helpers**
  CHECK: npm run ui:verify
  EXPECT: seção `format` com 0 violações
  EVIDENCE: `ok   format: 0 violações` — 97 hits (55 `toLocaleString`, 17 `toFixed`, 10 datas, 1 hora) → helpers, incluindo 4 novos (`formatInt`, `formatPercent`, `formatDateTimeSeconds`, `formatQuantity`, `formatDateShort`, `formatFileSize`) e `formatCurrencyShort(v, kDigits)`. Isentos por regra: `src/app/api/**` (ficheiro/texto no servidor) e decimal.js. Quatro singletons com `// ui-ok: <motivo>` (mês por extenso; dia/mês sem ano; CSV exportado; payload da API).

- [x] **G4 — Cartão de superfície só por `<Card>`**
  CHECK: npm run ui:verify
  EXPECT: seção `card` com 0 violações
  EVIDENCE: `ok   card: 0 violações` — 60 → 0: 57 para `<Card padding>` (sombra em repouso removida em 22), 2 cartões clicáveis com `onClick` passado ao `Card`, 2 `<button>` nativos e 3 painéis de aviso com borda de tom marcados com motivo. `MobileFilterWrapper` (ui/) também é `<Card>`.

- [x] **G5 — Spinner só por `<Spinner>` ou `<Button loading>`**
  CHECK: npm run ui:verify
  EXPECT: seção `spinner` com 0 violações
  EVIDENCE: `ok   spinner: 0 violações` — 25 → 0: `<Spinner size>` com `role="status"` em bloco e célula; `<Button loading>` em botão. Spinners `lg` perdem a tinta (amber/teal/violet) e ficam neutros — decisão.

- [x] **G6 — Sombra de folha por token**
  CHECK: bash -c 'grep -rc "rgba(0,0,0,0.0[68])" --include=*.tsx src | grep -v ":0" | wc -l'
  EXPECT: 0
  EVIDENCE: 0 ficheiros com `rgba(0,0,0,0.0[68])`; `ok   shadow: 0 violações`. As 16 folhas dos modais e as 2 do próprio `Modal`/`ConfirmDialog` usam `shadow-sheet-top`/`shadow-sheet-bottom`.

- [x] **G7 — Controles positivos das regras novas**
  CHECK: npm run ui:verify:test
  EXPECT: 26 → 30
  EVIDENCE: `ui:verify:test` APROVADO **30** (26 + `formato-nu`, `cartao-a-mao`, `spinner-a-mao`, `sombra-cravada`); fixture limpo com `<Card>`, `<Spinner>`, `shadow-sheet-top`, `formatInt`, a superfície do Modal sem `border`, e `toDecimalPlaces(2).toFixed(2)` do decimal.js.

- [x] **G8 — Base verde depois, com build**
  CHECK: npm run typecheck && npm run lint && npm test && npm run build && npm run ui:check && npm run ui:gallery:check
  EXPECT: exit 0
  EVIDENCE: typecheck e lint exit 0; `Tests 1358 passed | 9 skipped (1367)`; `next build` Compiled successfully; `ui:check` OK; `ui:gallery:check` 28/32/40/44px; `ui:verify` **17** seções a zero; `ui:dialogs` 3; harness 31; `docs:validate`; `ci:verify`.


---

## Notas da rodada

- Dois formatos não tinham helper: carimbo SEFAZ com segundos (`dd/mm/aa hh:mm:ss`, um `formatDateBr` local copiado em três modais) e quantidade com até 4 casas. Entraram `formatDateTimeSeconds` e `formatQuantity` em `lib/utils`, com testes; os quatro sítios migrados à mão.
- A regra `format` isenta `src/app/api/**` (PDF/CSV no servidor não é exibição do painel) e `.toDecimalPlaces(n).toFixed(n)` (API do decimal.js, não `Number`).
- O próprio `Spinner` tropeçava na regra `scale`: o tamanho vivia num literal sem `material-symbols`. Mesmo truque do `Button`: o glifo vai junto com o tamanho.
- Diferenças visuais assumidas: spinners `lg` perdem a tinta (amber/teal/violet) e ficam `slate` — um spinner é neutro; `pctLabel` mostra `+` só para v > 0 (antes `>= 0`) e vírgula decimal — comportamento do helper, e correto em pt-BR.
- Três agentes caíram por limite de sessão (13:30) e foram relançados às 14:24; T retomou do estado parcial sem duplicar.


---

## Notas da rodada

- **`// ui-ok: <motivo>`** — opt-out por linha (ou `{/* ui-ok: … */}` em JSX), honrado por todas as regras de literal e pela `format`. Sem motivo não isenta (fixture prova); `grep -rn ui-ok src` é a auditoria. Sete usos nesta rodada, todos com o porquê na linha.
- `Card` passou a aceitar atributos HTML (`onClick`, `role`, `aria-*`) — cartão de lista no celular é clicável por desenho. `type` não entra (não é atributo de `div`); os dois cartões-botão ficam `<button>` nativo com motivo.
- Helpers novos em `lib/utils` com testes: `formatDateTimeSeconds` (carimbo SEFAZ), `formatQuantity`, `formatDateShort` (dd/mm/aa), `formatFileSize`; `formatCurrencyShort` ganhou `kDigits`. Os `formatDate`/`formatQuantity`/`formatBytes` locais em `.ts` de feature passaram a delegar.
- O `Spinner` tropeçou na própria regra `scale` (tamanho num literal sem `material-symbols`); mesmo truque do `Button`.
- Os três agentes caíram por limite de sessão (reset 13:30) e foram relançados às 14:24; T retomou do parcial sem duplicar; P2 levou 6,9 min em 33 ficheiros.
- Dois formatos ficaram sem migrar, com motivo na linha: o separador do ICU entre data e hora varia (`02/09/26, 14:32:05`) e o teste tolera-o — é o que o `formatDateBr` local já dava.
- **CI reprovou no `Dependency audit`** com quatro advisories `high` em `fast-uri` (via `prisma → @prisma/dev → ajv@8`) que entraram no registo entre o run do `main` (16:26, verde) e o do PR (17:43). Lockfile não tinha mudado. Havia `overrides.fast-uri: 3.1.5` de um advisory anterior: subiu para `^3.1.7` — o fix mínimo, dentro da faixa `^3` do `ajv@8` (o primeiro impulso foi `^4.1.4`, major; recuei). Audit, testes e Prisma verdes. Fica na memória.
