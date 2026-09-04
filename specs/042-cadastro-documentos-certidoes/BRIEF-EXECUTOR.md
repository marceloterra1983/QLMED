# Brief para o executor — SPEC-042

Você vai implementar a página **Cadastro › Documentos › Certidões** do QLMED,
folha por folha, com disciplina de gates. Leia nesta ordem, e nada além disso
antes de começar:

1. `AGENTS.md` (política do repo — Spec Kit, validações, limites de segurança)
2. `specs/042-cadastro-documentos-certidoes/spec.md`
3. `specs/042-cadastro-documentos-certidoes/PLAN.md` (contratos e árvore)
4. o gate file da folha que vai executar, em `gates/`

## Ambiente

```bash
cd /home/marce/qlmed/.worktrees/042-certidoes
git status                      # branch feat/cadastro-documentos-certidoes
npm ci && npx prisma generate   # NUNCA symlink para ../app/node_modules
```

Env: herde `/srv/qlmed/env/app.env` sem imprimir. Se `qlmed-db` não resolver,
`DATABASE_URL` com host `127.0.0.1:5432`. Rode com
`QLMED_DISABLE_BACKGROUND_SERVICES=true` em qualquer processo local. Nunca
`npm run dev` na porta 3000 (mata o que estiver lá). Preview de UI só no
worktree `/home/marce/qlmed/.worktrees/preview`, porta 3002.

## Regras de execução

- **Uma folha por sessão/agente.** Brief da folha = seção "Contratos" do
  PLAN + o gate file dela. Não carregue o histórico das outras.
- **Ordem:** L1 → (L2 ‖ L3) → L4 → L5 → L6 → L7 → L8. S1 é independente.
- **Comece cada folha copiando o gate file e trabalhando os quatro passes**
  (implementar completo → reler como especialista → caçar defeito → polir).
  Termine só quando `node ~/.claude/skills/unlazy/scripts/gate-check.mjs --status gates/<folha>.md`
  não mostrar `pending`. Gate impossível: escreva `ABANDON: G<n> <motivo>` e
  reporte; nunca apague o gate.
- **Teste antes do código para comportamento novo** (constituição, princípio
  I). Antes de confiar numa suíte verde, reverta a correção e veja o teste
  falhar (G5 de L3 exige isso explicitamente).
- **Copie a forma, não a lógica:** `src/lib/impcg/{folder-ingest,ingest,whatsapp-notify,access,constants}.ts`
  e `src/app/api/gestao/impcg/[id]/arquivo/route.ts` são os moldes. A única
  diferença deliberada: resolução de conexão OneDrive **sem fallback**.
- **Reuse, não reimplemente:** `sendWhatsAppDocument`, `listOneDriveChildren`,
  `openOneDriveItemContent`, `uploadOneDriveFile`, `ensureValidOneDriveAccessToken`,
  `formDataWithLimit`, `apiError/apiValidationError`, `Badge/EmptyState/PageHeader/Card`,
  `acquirePostgresAdvisoryLock`, `markBackgroundService*`.
- **Nenhuma dependência nova.** `npm ls <pkg>` antes de importar.
- **Nunca:** editar `/home/marce/qlmed/app`; ler/imprimir `.env`; logar PDF,
  legenda ou token; deploy/migrate deploy/publish sem o dono pedir nesta rodada.
- **Commits:** por folha, Conventional Commits, mensagem citando `SPEC-042` e a
  folha (`feat(documentos): L3 classify/validity puras (SPEC-042)`). Push só
  quando L8 mandar.
- **Reporte** por folha no formato FEITO / FAZENDO / FALTA, com o ledger do
  gate-check colado (N de N) e todo número re-medido antes de escrever.

## O que já foi verificado por quem escreveu este plano (não refaça)

- Pasta e nomes reais dos 24 PDFs no OneDrive de `faturamento@qlmed.com.br` —
  fixture no PLAN. Nomes chegam em NFD do Graph (`certidão` decomposto).
- A data no nome é validade (dois PDFs abertos e conferidos).
- A conexão `faturamento@` já existe no app (é a do IMPCG).
- `sendWhatsAppDocument` só manda documento; não há `sendText` — e não precisa.
- O scan `api-route-guards.test.ts` cobre rotas novas automaticamente; a ACL
  nova precisa de caso próprio.

## Quando parar e perguntar ao dono

- JID do grupo de WhatsApp (teste e produção) — bloqueia G7 de L7.
- Qualquer coisa que exija nova dependência, ADR, ou tocar produção.
