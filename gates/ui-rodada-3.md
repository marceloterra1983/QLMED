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

- [ ] **G1 — Base verde**
  CHECK: npm run typecheck && npm run lint && npm test && npm run ui:check
  EXPECT: exit 0
  EVIDENCE: pending

- [ ] **G2 — `Card`, `Spinner`, `formatInt`, `formatPercent` testados**
  CHECK: npx vitest run src/components/ui/__tests__/Card.test.tsx src/components/ui/__tests__/Spinner.test.tsx src/lib/__tests__/utils.test.ts
  EXPECT: exit 0, com controles positivos
  EVIDENCE: pending

- [ ] **G3 — Formatação só pelos helpers**
  CHECK: npm run ui:verify
  EXPECT: seção `format` com 0 violações
  EVIDENCE: pending

- [ ] **G4 — Cartão de superfície só por `<Card>`**
  CHECK: npm run ui:verify
  EXPECT: seção `card` com 0 violações
  EVIDENCE: pending

- [ ] **G5 — Spinner só por `<Spinner>` ou `<Button loading>`**
  CHECK: npm run ui:verify
  EXPECT: seção `spinner` com 0 violações
  EVIDENCE: pending

- [ ] **G6 — Sombra de folha por token**
  CHECK: bash -c 'grep -rc "rgba(0,0,0,0.0[68])" --include=*.tsx src | grep -v ":0" | wc -l'
  EXPECT: 0
  EVIDENCE: pending

- [ ] **G7 — Controles positivos das regras novas**
  CHECK: npm run ui:verify:test
  EXPECT: 26 → 30
  EVIDENCE: pending

- [ ] **G8 — Base verde depois, com build**
  CHECK: npm run typecheck && npm run lint && npm test && npm run build && npm run ui:check && npm run ui:gallery:check
  EXPECT: exit 0
  EVIDENCE: pending
