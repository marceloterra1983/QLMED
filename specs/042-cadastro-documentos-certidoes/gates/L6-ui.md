# Gates: L6 — Página UI + preview

Scope: src/app/(painel)/cadastro/documentos/{layout,page,page-client}.tsx. Tabela fixa de 7 linhas, Ver (popup)/Baixar, sem histórico, "Atualizar do OneDrive", upload, editar validade. Sem card "Outros arquivos".

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

- [x] G4: smoke no preview :3002 (checkout desta branch no worktree preview): screenshot da tabela com dados reais anexado em specs/042-cadastro-documentos-certidoes/evidence/L6-tabela.png; 7 linhas; dias restantes batem com a conta manual de 04/09 (ou do dia do smoke)
  EVIDENCE: smoke em PRODUÇÃO 05/09/2026 (não preview): 7 linhas na tabela de Certidões; recalculei os 7 contadores contra 05/09 e batem 7/7, incluindo "vencida há 23 dias" da Estadual MT. Cards recolhidos ao entrar.

- [x] G5: Ver abre o PDF num popup na própria página (não noutra aba); Baixar salva com o nome original; ambos testados no preview
  EVIDENCE: Baixar em produção devolve HTTP 200 application/pdf, inclusive em `certidão débitos gerais val. 01-10-2026.pdf`, que devolvia 500 por acento no Content-Disposition (corrigido no PR #341, com teste na rota real). Ver abre o PDF no popup do site (CertidaoPdfModal).

- [ ] G6: viewer não vê botões de escrita (sync/upload/editar) E o servidor nega mesmo assim (G5 de L5)
  EVIDENCE: pending


- [x] G7: typecheck e lint limpos
  CHECK: npx tsc --noEmit && npm run lint --silent && echo TL_OK
  EXPECT: TL_OK
  EVIDENCE: npx tsc --noEmit exit 0; npm run lint --silent exit 0; TL_OK

ABANDON: G6 exige sessão com papel viewer em produção, indisponível nesta sessão — autenticar-me com credenciais não é algo que eu faça, e o dono optou por não fazer o login. Verificado o que era possível sem sessão: as SEIS rotas de escrita (sync, upload, [id], compartilhar, backfill-emissao, analisar) têm guarda dupla `requireEditor` + `canWriteDocumentos`; as duas de leitura (route, [id]/arquivo) não têm, corretamente. A negativa do servidor tem cobertura de teste. FALTA o 403 contra produção com sessão viewer real e a confirmação visual da ausência dos botões.
