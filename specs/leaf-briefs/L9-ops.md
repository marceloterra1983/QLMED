# Findings de L9-ops

## QLMED-OPS-001 — Path filter de PR omite ops/production/compose; CI sem gate de container
- severidade: high | status: confirmed | confiança: high
- local: .github/workflows/ci.yml:59 (filters.app)
- invariante: Mudança operacional dispara o job app ou um job de manifests.
- cenário: quality docs-only. Push main ainda roda app. Sem docker compose config/build.
- esperado: Incluir ops/** production/** docker-compose.yml ou job manifests.
- observado: ci.yml:38-79,145-213.
- causa raiz: Filter pensado em src/prisma.
- correção mínima: Adicionar paths ou always-run manifests job.
- teste de regressão: PR que só toca production/docker-compose.yml falha quality se compose inválido.
- risco residual: n/a

## QLMED-OPS-002 — npm run deploy:server --legacy publica produção sem os gates fail-closed
- severidade: high | status: confirmed | confiança: high
- local: package.json:17 (deploy:server); scripts/deploy-server.sh:39 (--legacy)
- invariante: Produção pública só via workflow_dispatch com SHA/CI/TOCTOU.
- cenário: npm script já passa --legacy; qualquer branch; up -d --build; exige health público.
- esperado: Recusar ou restringir a stack não pública; nunca app.qlmed.com.br.
- observado: deploy-server.sh:39-43,64-68,150-155,217-231.
- causa raiz: Footgun legado ao lado do workflow canônico.
- correção mínima: Remover npm script ou apontar a DEST não público; exigir CONFIRM.
- teste de regressão: deploy:server recusa se HEALTHCHECK for app.qlmed.com.br.
- risco residual: SSH root no host continua sendo o plano de controle.

## QLMED-OPS-003 — Compose production vs ops divergem; ops injeta secret em build-arg
- severidade: medium | status: confirmed | confiança: high
- local: ops/compose/qlmed-stack.yml:82 (QLMED_API_KEY); Dockerfile:74 (node_modules)
- invariante: Compose canônico único; secret não é build-arg.
- cenário: production compose sem ARG key; ops tem; Dockerfile npm ci full tree copiado.
- esperado: Uma fonte; --omit=dev se possível.
- observado: composeDiff leaf cicd; Dockerfile:5-6,67-74.
- causa raiz: Dois stacks.
- correção mínima: Deprecar ops ARG; documentar production/ como canônico.
- teste de regressão: ops compose sem QLMED_API_KEY ARG.
- risco residual: Prisma 7 pede node_modules no runner — aceito documentado.

## QLMED-OPS-005 — App para durante migrate; rollback de imagem não desfaz DDL
- severidade: medium | status: confirmed | confiança: high
- local: .github/workflows/deploy-production.yml:235 (migrate)
- invariante: Rollback de imagem é compatível com schema expandido.
- cenário: stop app, migrate deploy+diff, up. start.sh migrate de novo sem diff. Rollback = previous image.
- esperado: Só expand; contract depois de N versões.
- observado: deploy-production.yml:235-353; start.sh:26-30; data.md:27-48.
- causa raiz: Migrate no deploy path com app down.
- correção mínima: Manter expand-only; testar previous image contra schema atual em CI.
- teste de regressão: Imagem N-1 sobe contra DB N.
- risco residual: Contract futuro quebra rollback.

## QLMED-DOC-001 — Docs mandam db:push e deploy automático; código não tem nenhum dos dois
- severidade: high | status: confirmed | confiança: high
- local: docs/deployment/qlmed-app.md:194 (db:push); docs/deployment/qlmed-app.md:117 (workflow_run)
- invariante: Docs de deploy coincidem com workflows executáveis.
- cenário: db:push não é script; workflow_run proibido pelo hardening; deploy é dispatch manual.
- esperado: Alinhar docs ao deploy-production.yml e migrate deploy.
- observado: qlmed-app.md:117-209,194; AGENTS.md:162-163; package.json sem db:push.
- causa raiz: Docs históricas não atualizadas após ADR de deploy manual.
- correção mínima: Corrigir qlmed-app.md e AGENTS.md.
- teste de regressão: docs:validate flagra db:push / workflow_run em docs de deploy.
- risco residual: n/a

## QLMED-DOC-003 — SECURITY.md cita next 15.5.23; package.json 15.5.24
- severidade: low | status: confirmed | confiança: high
- local: SECURITY.md:16 (next)
- invariante: Scorecard = lockfile.
- cenário: SECURITY.md atrasado; login PIN_MAP ainda em qlmed-app.md.
- esperado: Atualizar.
- observado: SECURITY.md:16-19; package.json:38.
- causa raiz: Doc pontual.
- correção mínima: Bump SECURITY.md.
- teste de regressão: versão = package.json.
- risco residual: n/a

## QLMED-SUPPLY-002 — Tags mutáveis node/postgres; mysql2 high no audit (não usado)
- severidade: medium | status: confirmed | confiança: high
- local: Dockerfile:2 (node:22-alpine)
- invariante: Imagens pinadas por digest; CVE prod acionáveis.
- cenário: FROM node:22-alpine unpinned; postgres:18-alpine; npm audit high mysql2 via prisma, app usa Postgres.
- esperado: Digest pin; triagem mysql2 como não alcançável.
- observado: npm audit prod 2 high mysql2/prisma; npm ls mysql2 via prisma.
- causa raiz: Prisma puxa mysql2; tags móveis.
- correção mínima: Pin digest; documentar mysql2 unreachable.
- teste de regressão: npm ls mysql2 continua unused; imagem FROM digest.
- risco residual: Prisma bump pode puxar mysql2 para runtime se alguém ligar adapter.

## QLMED-SUPPLY-003 — Container sem USER no Dockerfile; start.sh root→su-exec; sem cap_drop no DB
- severidade: low | status: confirmed | confiança: high
- local: Dockerfile:77 (start.sh); production/docker-compose.yml:6 (qlmed-db)
- invariante: Defesa em profundidade no runtime.
- cenário: no USER; su-exec; app tem no-new-privileges+mem; db expõe 127.0.0.1:5432 superuser.
- esperado: USER nextjs; cap_drop no db se possível.
- observado: Dockerfile start.sh; compose 6-81.
- causa raiz: Migrate no start precisa root? (su-exec depois).
- correção mínima: Documentar; USER após chown.
- teste de regressão: n/a.
- risco residual: Prisma migrate no start.

## QLMED-UI-001 — Listas fiscais pedem até 5000 e mostram total completo sem aviso de truncamento
- severidade: medium | status: confirmed | confiança: high
- local: src/app/(painel)/fiscal/invoices/page-client.tsx:164 (limit)
- invariante: UI declara quando a página < total.
- cenário: limit=5000 (era 2000); footer pagination.total; array renderizado sem warning.
- esperado: Paginação real ou aviso truncado.
- observado: invoices/page-client.tsx:164-179; API max 5000.
- causa raiz: Cap elevado, não removido.
- correção mínima: Se total>length, banner; ou paginar.
- teste de regressão: total 5001 mostra aviso.
- risco residual: Performance de 5000 XML attach extra fields.

## QLMED-UI-002 — Financeiro busca 2000 duplicatas; backfill histórico 500 XML por GET
- severidade: medium | status: confirmed | confiança: high
- local: src/app/(painel)/financeiro/components/FinanceiroPageClient.tsx:99 (limit=2000)
- invariante: Cobertura histórica completa ou progresso visível.
- cenário: default status '' (não esconde vencidos — lead 16 parcialmente rejeitado). Backfill 500/GET.
- esperado: Backfill até remaining=0 ou job.
- observado: financeiro-duplicatas.ts:313-316.
- causa raiz: Lazy backfill bounded.
- correção mínima: Loop até remaining=0 no job; UI 'cobertura incompleta'.
- teste de regressão: remaining não fica >0 após um GET se NFE<500.
- risco residual: GET lento se loop completo.

## QLMED-UI-003 — Relatório de válvulas prefere estoque hardcoded REAL_STOCK
- severidade: medium | status: confirmed | confiança: high
- local: src/app/api/reports/valvulas-importadas/route.ts:125 (REAL_STOCK)
- invariante: Estoque = compras−vendas do período, salvo override explícito na UI.
- cenário: netQty usa mapa fev/2026. SPEC-030 deixou fora de escopo.
- esperado: Calcular ou rotular 'estoque informado'.
- observado: route.ts:125-136,490.
- causa raiz: Snapshot operacional cravado.
- correção mínima: Remover mapa ou datar o snapshot na UI.
- teste de regressão: Sem REAL_STOCK, netQty = purchased-sold.
- risco residual: Produto pode querer o snapshot.

## QLMED-UI-004 — ConfirmDialog sem trap de Tab; filtros fiscais sem aria-label
- severidade: low | status: confirmed | confiança: medium
- local: src/components/ui/ConfirmDialog.tsx:35 (ConfirmDialog)
- invariante: Diálogo modal prende foco.
- cenário: Modal.tsx tem trap; ConfirmDialog Escape+foco inicial sem ciclo Tab.
- esperado: Trap como Modal.
- observado: ConfirmDialog.tsx:35-88.
- causa raiz: Dois componentes de diálogo.
- correção mínima: Reusar Modal trap.
- teste de regressão: Tab não foge do ConfirmDialog.
- risco residual: E2E a11y bloqueado.

## QLMED-UI-005 — SW não cacheia API; push ainda mostra remetente e número da nota
- severidade: low | status: confirmed | confiança: high
- local: public/sw.js:1 (push)
- invariante: Lock screen minimizado; SW sem XML.
- cenário: SW install/activate/push only; body senderName+number; TTL 1h; sem chave 44.
- esperado: OK residual minimizado.
- observado: sw.js; web-push.ts:38-57.
- causa raiz: Produto quer contexto no aviso.
- correção mínima: Título genérico se política exigir.
- teste de regressão: payload sem 44 dígitos.
- risco residual: Aceito de produto.

## QLMED-TEST-001 — Zero testes de render/browser/a11y/coverage; UI é regex de fonte
- severidade: high | status: confirmed | confiança: high
- local: vitest.config.ts:5 (environment); src/lib/__tests__/audit-data-display.test.ts:9 (readFileSync)
- invariante: Comportamento de UI tem evidência de render ou E2E.
- cenário: 97 .test.ts, 0 .test.tsx, vitest node, sem Playwright/axe/coverage. Contratos de página são toMatch no fonte.
- esperado: Mínimo: render das listas fiscais + 401 rotas P0 + emissão concorrente.
- observado: package.json:26-72; 725 testes unitários verdes não cobrem UI.
- causa raiz: Contrato por grep no lugar de UI testing.
- correção mínima: jsdom+testing-library nas page-clients P0; um teste authorize concorrente.
- teste de regressão: Quebrar direction=received na NFS-e deve falhar teste de comportamento, não só regex.
- risco residual: E2E browser bloqueado nesta auditoria.
