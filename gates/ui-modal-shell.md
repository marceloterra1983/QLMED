# Gates: um só diálogo (etapa 3)

Base: `origin/main` @ 7ba8da1 · worktree `feat/ui-modal-shell`

`components/ui/Modal.tsx` já resolve foco preso, `Esc`, trava de rolagem, botão
voltar do Android e devolução do foco. Dez modais copiaram o **esqueleto** e
deixaram o **comportamento** para trás.

Medido antes de editar:

| ficheiro | Esc | trava rolagem | foco preso | nome acessível |
|---|---|---|---|---|
| InvoiceDetailsModal | não | não | não | não |
| NfeDetailsModal | não | não | não | não |
| CteDetailsModal | não | não | não | não |
| NfseDetailsModal | não | não | não | não |
| ContactDetailsModal | não | não | não | não |
| ProductDetailModal | não | não | não | não |
| HistoryModal | não | não | não | não |
| BulkEditModal | não | não | não | não |
| DuplicataEditPanel | não | não | não | não |
| SettingsModal | sim | sim | não | não |

Os dez partilham o mesmo string de shell. Em vez de um segundo componente de
diálogo, o `ui/Modal` ganha o que falta para servir os dois formatos — uma só
implementação de foco preso é o ponto inteiro do achado.

---

- [x] **G1 — Base verde**
  CHECK: npm run typecheck && npm run lint && npm test && npm run ui:verify
  EXPECT: exit 0; 762 testes
  EVIDENCE: typecheck, lint, ui:verify exit 0; `Tests 762 passed | 4 skipped (766)`.

- [x] **G2 — `ui/Modal` serve os dois formatos sem duplicar comportamento**
  `surface` (card | sunken), `header` (cabeçalho próprio), `height`,
  `bodyClassName` e `footer`. Nenhuma cópia da lógica de foco.
  CHECK: npx vitest run src/components/ui/__tests__/Modal.test.tsx
  EXPECT: exit 0
  EVIDENCE: `Modal.test.tsx`: 11 testes, 6 controles positivos (aria-modal removido, aria-labelledby órfão, h2 sem sr-only, footer={null} a mostrar Voltar, focus:ring, text-primary sem par) — todos reprovaram com o defeito. Props: `surface`, `header`, `height`, `bodyClassName`, `footer`, `direction`. Uma só implementação de foco: `src/lib/focus-trap.ts`.

- [x] **G3 — Todo diálogo tem nome acessível**
  Hoje os dez têm `role="dialog" aria-modal` e nenhum `aria-labelledby`. Quem
  usa leitor de tela ouve "diálogo" e mais nada. O `title` passa a ser
  obrigatório mesmo com cabeçalho próprio.
  CHECK: node scripts/verify-ui-dialogs.mjs
  EXPECT: seção `nome` com 0 violações
  EVIDENCE: `ok   nome: 0 violações` em `scripts/verify-ui-dialogs.mjs`. Todo `role="dialog"` tem `aria-labelledby`/`aria-label`; o `title` do Modal vira `<h2 className="sr-only">` quando há cabeçalho próprio.

- [x] **G4 — Nenhum overlay à mão sobrevive**
  `fixed inset-0 z-50` fora de `ui/Modal` e `ui/ConfirmDialog` reprova.
  CHECK: node scripts/verify-ui-dialogs.mjs
  EXPECT: seção `overlay` com 0 violações
  EVIDENCE: `ok   overlay: 0 violações`. Eram 13 diálogos à mão, não 10: os 10 do shell partilhado mais `LotEditModal`, o modal de e-mail de válvulas e a prévia de auto-classificação. Única isenção fora de `ui/`: o fundo do drawer de navegação em `Sidebar.tsx:38` (`fixed inset-0 … lg:hidden`, sem `role="dialog"`, fecho próprio) — lido e justificado no script.

- [x] **G5 — O verificador de diálogo enxerga**
  CHECK: bash scripts/test-ui-dialogs-verifier.sh
  EXPECT: overlay à mão e diálogo sem nome reprovam; o limpo aprova
  EVIDENCE: `APROVADO: 5 violações reprovadas, fixture limpo aprovado` — inclui um `role="dialog"` escondido atrás de `onClick={() => …}`, que prova que o leitor de atributos não para no `=>`.

- [x] **G6 — O foco preso é real, não declarado**
  Testado no comportamento: Tab no último elemento volta ao primeiro,
  Shift+Tab no primeiro vai ao último, Esc fecha, e o foco volta a quem abriu.
  CHECK: npx vitest run src/components/ui/__tests__/Modal.test.tsx -t foco
  EXPECT: exit 0
  EVIDENCE: **No navegador**, com o componente real numa página descartável (`next dev` em 4124, apagada antes do commit): ao abrir, foco no primeiro focável ("Fechar diálogo"), `body.style.overflow="hidden"`, nome acessível "Diálogo de prova"; Tab: fechar → campo → meio → último → **volta a fechar**; Shift+Tab do primeiro → **último**; Esc: fecha, `fechos: 1`, foco de volta em `#abrir`, overflow `""`. A decisão pura tem 11 testes em `focus-trap.test.ts`.

- [x] **G7 — Controle positivo do foco preso**
  Remover o trap tem de reprovar o teste.
  CHECK: bash scripts/test-ui-modal-trap.sh
  EXPECT: 3 adulterações reprovam; íntegro aprova
  EVIDENCE: `APROVADO: 4 adulterações reprovadas, componente íntegro aprovado` (`scripts/test-ui-modal-trap.sh`).

- [x] **G8 — Base verde depois**
  CHECK: npm run typecheck && npm run lint && npm test && npm run build
  EXPECT: exit 0 nos quatro
  EVIDENCE: typecheck e lint exit 0; `Tests 784 passed | 4 skipped (788)`; `next build` Compiled successfully; `ui:gallery:check` 28/32/40/44px; `docs:validate` e `ci:verify` passam.


---

## O que entrou além do plano

- **Regra de botão cega a gradiente.** `SUPERFICIE` casava `bg-primary` e não
  `from-primary`. Alargada; **19 botões** em 14 ficheiros migrados para
  `<Button>` (achado 10 fechado). 12 controles positivos no harness de tokens.
- **`useModalBackButton` duplicado** em 8 modais migrados — o Modal já o chama;
  a cópia empilhava dois pops de histórico. Removido.
- **`ConfirmDialog` aninhado no `SettingsModal`** passou para dentro do Modal,
  para os botões dele entrarem na lista de focáveis do trap. O guard do Esc
  (`if (!pendingDelete) onClose()`) migrou para o `onClose` — vale agora para o
  fundo, o Esc e o botão voltar pelo mesmo caminho.
- **Fechos guardados** preservados: `LotEditModal` não sai no meio de um
  salvamento (`if (!saving && !registering)`).
- **Teste de contrato do login** exigia "Entrar" sozinho numa linha — detalhe
  de formatação, não de comportamento. Passa a exigir o rótulo e um
  `<Button type="submit">`.

## Continua em aberto

- `ConfirmDialog` ainda não tem foco preso (a auditoria já dizia). Deve ser
  reconstruído em cima de `ui/Modal` — etapa 4.
- O `npm run dev` faz `fuser -k 3000/tcp` antes de subir: mata o que estiver na
  3000, seja de quem for. Não toquei; fica registado.
- Telas em contexto, nos dois temas — exige Postgres canónico e login.
