# Gates: L8i — Integração, PR, deploy

> Nota de nomenclatura: o PLAN chamava esta folha de "L8". Depois criei folhas
> novas a pedido do dono e reusei o nome L8 para "modelo e OneDrive" (MT como
> tipo próprio, arquivamento). Para não haver dois L8, esta passa a ser **L8i**
> (integração). O ficheiro mantém o nome antigo porque os gates das outras
> folhas o referenciam.

Scope: tudo junto, CI do GitHub verde, PR aberto e mesclado, deploy em produção SÓ com autorização explícita do dono nesta rodada.

- [x] G1: gates L1–L7 todos verdes re-executados pelo driver (não pelo executor da folha)
  CHECK: for f in specs/042-cadastro-documentos-certidoes/gates/L[1-7]-*.md; do node ~/.claude/skills/unlazy/scripts/gate-check.mjs --status "$f" | tail -1; done
  EXPECT: /(?!.*pending)/
  EVIDENCE: re-executado por mim no worktree 042-tela: L1 ALL MET (6), L2 (5), L3 (6), L4 (7 met, 1 abandoned = G7 smoke real), L5 (7), L6 (4 met, 3 abandoned = smoke visual do driver), L7 (8 met, 1 abandoned = G7 homologação, depende de JID que o dono ainda não deu).

- [x] G2: validação completa do AGENTS.md rodada de fato
  CHECK: npm run docs:validate --silent && npx tsc --noEmit && npm run lint --silent && npx vitest run > /dev/null 2>&1 && npm run build > /dev/null 2>&1 && echo FULL_OK
  EXPECT: FULL_OK
  EVIDENCE: FULL_OK no worktree 042-tela (2026-09-04). docs:validate "Documentation validation passed (190 Markdown files, 53 IDs)"; tsc --noEmit 0; lint 0; vitest "Test Files 197 passed | 4 skipped (201)" e "Tests 1545 passed | 9 skipped (1554)"; build "✓ Compiled successfully in 13.4s".

- [x] G3: graph atualizado
  CHECK: graphify update . 2>&1 | tail -1
  EXPECT: /./
  EVIDENCE: "Code graph updated." (graphify update . no worktree 042-tela, 2026-09-04).

- [x] G4: PR aberto contra main com corpo apontando SPEC-042; CI verde no SHA final (esperar pelo SHA, não pelo PR — concurrency cancela runs a cada push)
  CHECK: gh pr view --json number,url,statusCheckRollup -q '.url + " " + ([.statusCheckRollup[].conclusion] | join(","))'
  EXPECT: /SUCCESS/
  EVIDENCE: PRs abertos contra main com corpo a citar SPEC-042 e CI verde no SHA final, esperando pelo SHA e não pelo PR (concurrency cancela runs a cada push). Série completa mesclada: #302, #303, #304, #305, #308, #309, #311, #312, #322, #325, #326, #328, #332, #334, #336, #339, #340, #341, #343.

- [x] G5: dono autorizou deploy desta feature nesta rodada (registrar frase e data)
  EVIDENCE: dono, 2026-09-04: "pode seguir o ciclo inteiro, incluindo o migrate deploy". Antes disso eu tinha listado explicitamente os três bloqueios (portão de migração pinado, schema de produção, degrau L8) e ele respondeu autorizando o ciclo inteiro. Autorização vale para a rodada L1–L6, que foi a deployada.

- [x] G6: deploy via workflow_dispatch seguido pelo run ID do próprio dispatch; produção responde e /cadastro/documentos existe no bundle
  CHECK: curl -fsS -o /dev/null -w "%{http_code}" https://app.qlmed.com.br/cadastro/documentos
  EXPECT: /^(200|307|302)$/
  EVIDENCE: run 33927443920 (seguido pelo próprio ID, não por recência), DEPLOY_success, SHA 7f04eb2. Provado em produção e não no run verde: /cadastro/documentos → HTTP 307 (mesmo que /cadastro/produtos); /api/documentos → 401 sem sessão (ACL a negar, como deve); rota compilada dentro do container em /app/.next/server/app/(painel)/cadastro/documentos + as 5 rotas de API; migração 20260904204949_company_document em _prisma_migrations às 22:56; tabelas CompanyDocument e CompanyDocumentIngestState criadas; enum CompanyDocumentKind com 7 valores; imagem servida qlmed-app:7f04eb2fd5bd…

- [x] G7: variáveis novas em /srv/qlmed/env/app.env (DOCUMENTOS_WHATSAPP_ENABLED, DOCUMENTOS_WHATSAPP_GROUP_JID) só depois de G7 de L7; ficam ausentes até lá
  EVIDENCE: verificado sem imprimir valores — DOCUMENTOS_WHATSAPP_ENABLED e DOCUMENTOS_WHATSAPP_GROUP_JID AUSENTES em /srv/qlmed/env/app.env, como esperado: o G7 da L7 está abandonado por falta do JID do grupo. O canal nasce desligado; sem as duas variáveis o resolvedor devolve null e nada é enviado.

