# Plano: backlog da auditoria QLMED b177b07

Base: `origin/main` @ b177b07. Item 1 (emissão atômica) fechado no PR #249.
Modo: orquestrado. Cada folha corre num worktree próprio, com gates próprios,
e volta como branch. A integração é minha, sequencial, com re-execução dos
checks — a folha verificar-se a si mesma não substitui o pai reverificar.

## Contratos entre folhas

Escritos antes do fan-out porque as folhas partilham superfícies:

1. **`src/lib/auth.ts` é da folha L2 e de mais ninguém.** Quem precisar de um
   guard novo, pede a L2 pelo relatório; não edita.
2. **Allowlist de host** é UMA função, `assertAllowedHost(url, allowlist)`, em
   `src/lib/http-allowlist.ts`, criada pela L3. L5 e L7 consomem, não duplicam.
3. **Redaction do Pino** é da L4, em `src/lib/logger.ts`. Ninguém mais mexe no
   logger.
4. **Nenhuma folha toca em `prisma/schema.prisma` exceto L8.** Quem precisar de
   coluna ou índice, declara no relatório e a L8 aplica.
5. **Nenhuma folha toca em `.github/workflows/` exceto L9.**
6. **Migrações**: só a L8 cria ficheiro em `prisma/migrations/`. Prefixo de
   data `2026090X`, para não colidir com o `20260901180000` do item 1.
7. Toda folha termina com `npm run typecheck`, `npm run lint` e `npm test`
   verdes no seu worktree, e com controlo positivo registado: reverter a
   correção tem de deixar o teste novo vermelho.
8. Nenhuma folha toca em produção, SEFAZ, n8n, Evolution, OneDrive ou dumps.
   Nenhuma folha lê `.env`, PFX, XML fiscal real ou PDF clínico.

## Folhas

| # | Item do backlog | Superfície | Estado |
|---|---|---|---|
| L2 | ACL default-deny | `src/lib/auth.ts`, middleware, `/api/users` | — |
| L3 | Credenciais e borda | webhook n8n, allowlist de host, nextLink Graph | — |
| L4 | Segredos em repouso | `pfxData`, crypto, logger, GET invoice | — |
| L5 | Uploads | upload XML, XLSX, PDF/OCR, Chromium, basename | — |
| L6 | IMPCG/CASSEMS | OneDrive na TX, WhatsApp outbox, `ok` honesto, AccessLog | — |
| L7 | Cursor de sincronização | NSU SEFAZ/Receita, lock de run | — |
| L8 | Dados | FK satélites, Decimal, schema, migrações | — |
| L9 | Operação | path filter CI, `deploy:server`, docs | — |

L10 (testes P0) não é folha: cada folha traz o seu teste. O que sobrar de
cobertura vira gate meu na integração.

## Log de estado

- 2026-09-01: PR #249 aberto (item 1). CI verde exceto `Dependency audit`.
- 2026-09-01: dispensa nominal do GHSA-3f6p-5ww8-9rcr commitada; portão de
  dependências passa a ser `scripts/verify-dependency-audit.mjs`.
- 2026-09-01 20:36Z: **PR #249 mesclado** em `main` como `5971adc`. CI toda
  verde, incluindo "Replay and verify migration history" (a migração aplicou
  contra Postgres real) e o portão novo de dependências. Item 1 fechado.
- 2026-09-01: 8 folhas despachadas em paralelo, cada uma no seu worktree,
  a partir de `fix/nfe-emissao-atomica` (que já contém o item 1).

## Findings deliberadamente fora das folhas

5 dos 77, com motivo — nenhum foi esquecido:

| ID | Por que fica de fora |
|---|---|
| AUTH-010 | ADR-0012: login só por senha é decisão do dono, aceite. |
| PRIV-001 | WhatsApp de ofício com PHI: owner-accepted por SPEC-031/034. |
| OPS-006 | Ensaio de restore: NEEDS CONTROLLED RECOVERY DRILL, exige autorização. |
| INFO-001 | mysql2 inalcançável: fechado pela dispensa nominal do portão de audit. |
| INFO-003 | Graphify stale: regenerar é operação, não código. |

Cobertura: 72 de 77 atribuídos (5 do item 1 já fechados no PR #249) + 5 acima.

## Erro meu no fan-out, e a correção

Os worktrees dos agentes saíram de `b177b07` **sem** `PLAN.md` nem
`specs/leaf-briefs/`, porque o harness cria o worktree a partir do repo em
`/home/marce/qlmed/app`, não da minha branch. As 8 folhas começaram a
trabalhar só com o que eu tinha inlinado no prompt.

Corrigido por mensagem: cada folha recebeu o seu brief integral. As duas que
já tinham terminado (L3 e L5) foram retomadas com os findings que lhes
faltavam. Nenhuma inventou finding — as duas declararam explicitamente o que
não conseguiam verificar, que é o comportamento certo.

## Correções à própria auditoria, vindas das folhas

| Origem | O que a auditoria dizia | O que é verdade |
|---|---|---|
| L5 | FILE-003: `tesseract`/`pdftoppm` sem `-l` | O `-l` **já existia** em `src/lib/cassems/extract-pdf-text.ts:47` em b177b07. A sub-alegação não se sustenta; o resto do finding (cap de bytes, deadline partilhado) sustenta-se. |

## Achados novos, fora dos 77

| Origem | Achado |
|---|---|
| L3 | `RECEITA_NFSE_VERIFY_SSL=false` e `SEFAZ_VERIFY_SSL=false` desligam a verificação de TLS por variável de ambiente (`receita-nfse-sync.ts:123`, `ssl-verify.ts:14`). Não está nos 77. Vai para a re-auditoria. |

## Consequências de implantação a relatar ao dono

- **`N8N_WEBHOOK_SECRET` passa de opcional a obrigatório** (L3, INT-001). Sem
  ele o webhook devolve 401 em toda chamada. Se o n8n hoje chama sem assinar,
  isto quebra a integração até o segredo estar configurado dos dois lados.
- `MAX_XLSX_BYTES` = 15 MiB (L5) vira teto rígido para planilhas E509
  legítimas. Se as reais forem maiores, o número tem de subir.
