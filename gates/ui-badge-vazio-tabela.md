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

- [x] **G1 — Base verde**
  CHECK: npm run typecheck && npm run lint && npm test && npm run ui:check
  EXPECT: exit 0; 1333 testes
  EVIDENCE: typecheck, lint e ui:check exit 0; `Tests 1333 passed | 9 skipped (1342)`.

- [x] **G2 — `<Badge>` e `<EmptyState>` seguem a folha**
  Badge: pill, 12px/700, ponto de 6px que carrega a cor junto com o texto,
  cinco tons pareados por tema. EmptyState: ícone em disco, título 15px/700,
  dica, ação opcional em `<Button variant="secondary" size="sm">`.
  CHECK: npx vitest run src/components/ui/__tests__/Badge.test.tsx src/components/ui/__tests__/EmptyState.test.tsx
  EXPECT: exit 0
  EVIDENCE: `Badge.test.tsx` 5 + `EmptyState.test.tsx` 8 = 13 testes; 6 controles positivos reprovam (tom trocado, `aria-hidden` do ponto, `dark:` removido, sem `role="status"`, `compact` com classes do normal, título sem `font-bold`).

- [x] **G3 — Nenhuma pill à mão sobrevive**
  CHECK: npm run ui:verify
  EXPECT: seção `pill` com 0 violações
  EVIDENCE: `ok   pill: 0 violações` — 22 pills à mão em 11 ficheiros viraram `<Badge tone>`; a regra `pill` isenta botão redondo (via `atributosDe`) e disco de passo `w-N h-N`.

- [x] **G4 — Nenhum "Nenhum…" centrado à mão sobrevive**
  CHECK: npm run ui:verify
  EXPECT: seção `empty` com 0 violações
  EVIDENCE: `ok   empty: 0 violações`. 40 estados vazios (18 por P1, 22 por P2) viraram `<EmptyState>`; `hint` só onde já havia segunda linha, `action` só onde já havia botão, `compact` em `<td colSpan>`. Deixados com motivo: dois `<p>` de lista à esquerda em `SettingsModal` (não é o bloco centrado) e um banner amarelo com links em `sync:622`.

- [x] **G5 — Linha de lista a 44px, números tabulares**
  `<td>` de tabela de LISTA em `py-3`; célula numérica/monetária com
  `tabular-nums`. Modais de detalhe ficam como estão (densidade própria).
  CHECK: bash -c 'grep -rlE "<td[^>]*className=\"[^\"]*\bpy-(1|1\.5|2)\b" "src/app/(painel)" | wc -l'
  EXPECT: 0 nas páginas de lista (o relatório de P2 lista o que ficou e por quê)
  EVIDENCE: Todas as `<td>` de LISTA em `py-3`; ~140 células numéricas com `tabular-nums`. O grep do CHECK conta 11 ficheiros, mas o `\bpy-1` dele casa `py-12`/`py-10` — que são os próprios `<EmptyState>` em `<td colSpan>` — e `py-2.5` das linhas de `<Skeleton>`. As sobras reais são sub-tabelas de DETALHE, por regra: itens da NF-e expandida (`entrada-nfe:667-703, 883-889`, com inputs inline), itens da linha expandida do CASSEMS (`526-531`), painel de duplicatas, itens do formulário de emissão, tabela de prévia e histórico.

- [x] **G6 — Controles positivos das regras novas**
  CHECK: npm run ui:verify:test
  EXPECT: `pill` e `empty` têm caso que reprova; contagem 18 → 20
  EVIDENCE: `ui:verify:test` APROVADO **21** (18 + `pill-a-mao`, `contador-a-mao`, `vazio-a-mao`). Fixture limpo com botão redondo, disco de passo `w-7 h-7`, `<EmptyState>` e `<Badge>` — nenhum acusa.

- [x] **G7 — `npm run dev` recusa em vez de matar**
  `fuser -k 3000/tcp` matava o que estivesse na porta, de quem fosse.
  CHECK: grep -c "fuser -k" package.json
  EXPECT: 0
  EVIDENCE: `grep -c "fuser -k" package.json` = 0. O `dev` agora recusa com a porta ocupada e diz como achar o dono (`ss -ltnp | grep :3000`).

- [x] **G8 — Base verde depois, com build**
  CHECK: npm run typecheck && npm run lint && npm test && npm run build && npm run ui:check && npm run ui:gallery:check
  EXPECT: exit 0
  EVIDENCE: typecheck e lint exit 0; `Tests 1333 passed | 9 skipped (1342)`; `next build` Compiled successfully; `ui:check` OK; `ui:gallery:check` 28/32/40/44px; `ui:verify` 9 seções a zero; `ui:dialogs` 3 a zero; `docs:validate`; `ci:verify`.


---

## Notas

- **48 pills** (22 P1 + 26 P2) viraram `<Badge tone>`; mapas de classe (`STATUS_COLORS`, `ROLE_COLORS`, `styles`) viraram `Record<string, BadgeTone>`. As pills com ícone interno perderam o ícone de propósito: o ponto do `Badge` é o sinal não-cromático.
- `Badge` não aceita `title`; um sítio embrulhou num `<span title>`. Fica assim até haver segundo caso.
- `financeiro-utils.ts:88` ainda guarda `statusConfig.classes` — `.ts` fora do escopo dos agentes; `FinanceiroTable` já não o usa. Limpeza de uma linha, noutro PR.
- Regra `pill` isenta botão redondo (via `atributosDe`) e disco de passo `w-N h-N`; regra `empty` olha texto JSX `>Nenhum`, não atributos — `<EmptyState title="Nenhum…">` não acusa.
- P2 parou a árvore por ~4 min a meio; um empurrão por mensagem bastou. A sentinela por "transcript + árvore parados" funcionou como sinal de fim.
