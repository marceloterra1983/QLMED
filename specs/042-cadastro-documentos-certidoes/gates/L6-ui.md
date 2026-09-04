# Gates: L6 — Página UI + preview

Scope: src/app/(painel)/cadastro/documentos/{layout,page,page-client}.tsx. Tabela fixa de 6 linhas, Ver/Baixar, histórico expansível, "Atualizar do OneDrive", upload, editar validade. "Outros arquivos" colapsado.

- [ ] G1: verificadores de UI do repo passam (tokens, dialogs, empty state, modal trap)
  CHECK: npm run ui:check --silent && echo UI_OK
  EXPECT: UI_OK
  EVIDENCE: pending

- [ ] G2: página usa componentes do kit (PageHeader, Card, Badge, Button, EmptyState) e não reimplementa pill/empty
  CHECK: grep -c "from '@/components/ui/Badge'\|from '@/components/ui/EmptyState'\|from '@/components/PageHeader'" "src/app/(painel)/cadastro/documentos/page-client.tsx"
  EXPECT: 3
  EVIDENCE: pending

- [ ] G3: build de produção compila a rota
  CHECK: npm run build 2>&1 | grep -E "cadastro/documentos|Compiled|error" | head -5
  EXPECT: cadastro/documentos
  EVIDENCE: pending

- [ ] G4: smoke no preview :3002 (checkout desta branch no worktree preview): screenshot da tabela com dados reais anexado em specs/042-cadastro-documentos-certidoes/evidence/L6-tabela.png; 6 linhas; dias restantes batem com a conta manual de 04/09 (ou do dia do smoke)
  EVIDENCE: pending

- [ ] G5: Ver abre o PDF inline em nova aba; Baixar salva com o nome original; ambos testados no preview
  EVIDENCE: pending

- [ ] G6: viewer não vê botões de escrita (sync/upload/editar) E o servidor nega mesmo assim (G5 de L5)
  EVIDENCE: pending

- [ ] G7: typecheck e lint limpos
  CHECK: npx tsc --noEmit && npm run lint --silent && echo TL_OK
  EXPECT: TL_OK
  EVIDENCE: pending
