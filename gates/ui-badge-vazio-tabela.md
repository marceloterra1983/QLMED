# Gates: o resto da folha de componentes (etapa 5)

Base: `origin/main` @ 95521d4 · worktree `feat/ui-badge-vazio-tabela`

A folha de componentes do canvas desenhou três coisas que ninguém construiu:
a **pill de situação**, o **estado vazio** e a **linha de tabela** (44px,
números tabulares). Medido: 22 pills à mão em 11 ficheiros, 39 "Nenhum…" à
mão em 24, 25 ficheiros com tabela e `py-` de 0.5 a 4.

Partição por caminho, porque 19 ficheiros têm vazio e tabela juntos:

| frente | ficheiros |
|---|---|
| eu | `ui/Badge.tsx`, `ui/EmptyState.tsx`, `package.json` (`dev` sem `fuser -k`) |
| P1 | `src/components/**` (menos `ui/`) e `src/app/(painel)/cadastro/**` |
| P2 | `src/app/(painel)/{fiscal,financeiro,sistema,relatorios,estoque,gestao}/**` |
| T | `__tests__/Badge`, `__tests__/EmptyState`, regras `pill` e `empty` no verificador + controles |

---

- [ ] **G1 — Base verde**
  CHECK: npm run typecheck && npm run lint && npm test && npm run ui:check
  EXPECT: exit 0; 1320 testes
  EVIDENCE: pending

- [ ] **G2 — `<Badge>` e `<EmptyState>` seguem a folha**
  Badge: pill, 12px/700, ponto de 6px que carrega a cor junto com o texto,
  cinco tons pareados por tema. EmptyState: ícone em disco, título 15px/700,
  dica, ação opcional em `<Button variant="secondary" size="sm">`.
  CHECK: npx vitest run src/components/ui/__tests__/Badge.test.tsx src/components/ui/__tests__/EmptyState.test.tsx
  EXPECT: exit 0
  EVIDENCE: pending

- [ ] **G3 — Nenhuma pill à mão sobrevive**
  CHECK: npm run ui:verify
  EXPECT: seção `pill` com 0 violações
  EVIDENCE: pending

- [ ] **G4 — Nenhum "Nenhum…" centrado à mão sobrevive**
  CHECK: npm run ui:verify
  EXPECT: seção `empty` com 0 violações
  EVIDENCE: pending

- [ ] **G5 — Linha de lista a 44px, números tabulares**
  `<td>` de tabela de LISTA em `py-3`; célula numérica/monetária com
  `tabular-nums`. Modais de detalhe ficam como estão (densidade própria).
  CHECK: bash -c 'grep -rlE "<td[^>]*className=\"[^\"]*\bpy-(1|1\.5|2)\b" "src/app/(painel)" | wc -l'
  EXPECT: 0 nas páginas de lista (o relatório de P2 lista o que ficou e por quê)
  EVIDENCE: pending

- [ ] **G6 — Controles positivos das regras novas**
  CHECK: npm run ui:verify:test
  EXPECT: `pill` e `empty` têm caso que reprova; contagem 18 → 20
  EVIDENCE: pending

- [ ] **G7 — `npm run dev` recusa em vez de matar**
  `fuser -k 3000/tcp` matava o que estivesse na porta, de quem fosse.
  CHECK: grep -c "fuser -k" package.json
  EXPECT: 0
  EVIDENCE: pending

- [ ] **G8 — Base verde depois, com build**
  CHECK: npm run typecheck && npm run lint && npm test && npm run build && npm run ui:check && npm run ui:gallery:check
  EXPECT: exit 0
  EVIDENCE: pending
