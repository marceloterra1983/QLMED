# Gates: L6 — Página UI + preview

Scope: src/app/(painel)/cadastro/documentos/{layout,page,page-client}.tsx. Tabela fixa de 6 linhas, Ver/Baixar, histórico expansível, "Atualizar do OneDrive", upload, editar validade. "Outros arquivos" colapsado.

- [x] G1: verificadores de UI do repo passam (tokens, dialogs, empty state, modal trap)
  CHECK: npm run ui:check --silent && echo UI_OK
  EXPECT: UI_OK
  EVIDENCE: APROVADO: 4 adulterações reprovadas, componente íntegro aprovado | UI_OK

- [x] G2: página usa componentes do kit (PageHeader, Card, Badge, Button, EmptyState) e não reimplementa pill/empty
  CHECK: grep -c "from '@/components/ui/Badge'\|from '@/components/ui/EmptyState'\|from '@/components/PageHeader'" "src/app/(painel)/cadastro/documentos/page-client.tsx"
  EXPECT: 3
  EVIDENCE: 3

- [x] G3: build de produção compila a rota
  CHECK: npm run build 2>&1 | grep -E "cadastro/documentos|Compiled|error" | head -5
  EXPECT: cadastro/documentos
  EVIDENCE: ✓ Compiled successfully; ├ ○ /cadastro/documentos 1.3 kB

- [ ] G4: smoke no preview :3002 (checkout desta branch no worktree preview): screenshot da tabela com dados reais anexado em specs/042-cadastro-documentos-certidoes/evidence/L6-tabela.png; 6 linhas; dias restantes batem com a conta manual de 04/09 (ou do dia do smoke)
  EVIDENCE: pending

- [ ] G5: Ver abre o PDF inline em nova aba; Baixar salva com o nome original; ambos testados no preview
  EVIDENCE: pending

- [ ] G6: viewer não vê botões de escrita (sync/upload/editar) E o servidor nega mesmo assim (G5 de L5)
  EVIDENCE: pending

ABANDON: G4 smoke visual fica com o driver (exige migração no banco canônico)
ABANDON: G5 smoke visual fica com o driver (exige migração no banco canônico)
ABANDON: G6 smoke visual fica com o driver (exige migração no banco canônico)

- [x] G7: typecheck e lint limpos
  CHECK: npx tsc --noEmit && npm run lint --silent && echo TL_OK
  EXPECT: TL_OK
  EVIDENCE: npx tsc --noEmit exit 0; npm run lint --silent exit 0; TL_OK
