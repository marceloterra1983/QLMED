# Ledger: verificação QLMED 2026-09-11

Base: `main` `be3ffb4`. Janela `e8c5ef1^..HEAD` (SPEC-042 #430–#442).
Verificador: achados de Codex/agy/workflow refutados contra o código actual.
Não misturar DANFE/`public/brand`. Sem deploy.

## Portões mecânicos

| Check | Resultado |
|---|---|
| `npx tsc --noEmit` | TSC_EXIT:0 |
| `npm run lint` | LINT_EXIT:0 |
| `npm test` | Test Files 299 passed / 4 skipped; Tests 2384 passed / 9 skipped; 38.42s |
| `docs:validate` + `ui:verify` + `test:invariants` + `audit:verify` | VERIFY_BUNDLE_EXIT:0 |
| `ui:check` | UI_CHECK:0 |
| `ai-tooling:check` | AI_TOOLING:0 pin=0.14.2 |
| `db:config:verify` | DB_CONFIG:0 com `DATABASE_URL` herdado (sem `DATABASE_URL` no shell do agente falha — não é defeito do produto) |
| `docs:validate:test` | DOCS_TEST:0 |
| `audit:verify:test` | AUDIT_TEST:0 |
| `ci:verify` | CI_VERIFY:0 |

## Skills corridas

- audit-code / security-review / ponytail-audit / ponytail-review / code-review Standards / code-review Spec / review correctness / web-design-guidelines — workflow `verify-qlmed` (8 agentes; adversarial a seguir)
- Codex `exec --sandbox read-only --skip-git-repo-check` (gpt-5.6-sol)
- agy `--mode plan --model gemini-3.1-pro-high` na vps1 (cópia sem `.env*` / `node_modules`)
- graphify query/explain: `single-company.ts` degree 103; documentos ingest/alerts/carta-mail no mesmo cluster; isolamento canónico em `src/lib/single-company.ts`

Não corridos nesta passagem: `request-review` Santa AND-gate, `test:integration`, `npm run build`, `ponytail-audit` do repo inteiro fora de documentos.

## Confirmados (código lido)

### C1 — bug — ingestão pisa `emitidoEm` manual
`src/lib/documentos/ingest.ts:385` — `input.emitidoEm != null` escreve sempre. `validUntil` tem `validUntilSource === 'manual'`; emissão não. PATCH no popup não sobrevive à próxima ingestão.

### C2 — bug — ingestão pisa `manufacturer` manual
`src/lib/documentos/ingest.ts:390` — mesmo padrão. Sem teste em `documentos-ingest.test.ts`.

### C3 — bug (vs FR-044) — OCR de carta só se o nome já parece carta
`src/lib/documentos/carta-mail.ts:171` — `ocrFallback: nameSubjectHit`. `anexo.pdf` escaneado nunca chega ao texto; o classificador no teste injeta o texto à mão (`documentos-carta-mail.test.ts:26`). Comentário no código admite o atalho (não congelar 80 páginas Graph). Spec: texto sempre lido, OCR se a camada for escassa.

### C4 — bug baixo — prazo relativo implausível no futuro é aceite
`src/lib/documentos/pdf-validity.ts:315` — `if (!isPlausibleYmd(computed, todayYmd) && computed < emitidoEm) continue`. `applyDuration` aceita amount até 120 (anos). Validade >10 anos à frente não é descartada. Sem teste.

### C5 — suggestion — anexos Graph sem `@odata.nextLink`
`src/lib/graph-mail-client.ts:289` `listGraphPdfAttachments` lê uma página. A listagem de mensagens já pagina e lança `GraphMailboxTruncatedError`. Mensagem com >~10 anexos pode perder PDF.

### C6 — suggestion — PATCH ok + refresh falha deixa `daysRemaining` velho
`src/app/(painel)/cadastro/documentos/page-client.tsx:248` — fallback copia `validUntil`/`emitidoEm`/`manufacturer` e não recalcula status.

### C7 — suggestion — testes não exercitam `GraphMailboxTruncatedError` em cartas
`src/lib/__tests__/documentos-carta-mail.test.ts:13` — só `CARTA_MAIL_MAX_PAGES === 40`.

### C8 — suggestion / ponytail — `enhancePort` duplica Graph
`src/lib/documentos/ingest.ts:785` — wrap só existia porque `onedrive-port` estava noutro worktree; hoje relista Graph (listPdfs + listChildren) para preencher `webUrl`. Confirmado pelo workflow.

### C9 — suggestion / ponytail — exports mortos
`src/lib/documentos/families.ts:489` — `thresholdsForKind` e `closedKindsOf` sem callers (só re-export em `constants.ts`).

### C10 — suggestion / ponytail — `pdfText` morto
`src/lib/documentos/ingest.ts:191` — `resolveIngestValidity` devolve `pdfText` e o único caller destrutura sem o campo.

## Workflow `verify-qlmed`

8 skills + 16 verificadores. 3 confirmados (C8–C10, todos ponytail). 13 dropped como nit/DRY (incluindo não importar `rowsForFamily` no client — puxaria Prisma). Security/spec/audit/ui/standards não sobreviveram à verificação adversarial.

## Refutados

| Claim | Porquê |
|---|---|
| Input `type=date` recebe ISO e fica em branco | `list.ts` `toYmd`; testes usam `2026-09-13` |
| `manufacturer: null ?? undefined` impede limpar fabricante | persistência usa `data.manufacturer = parsed.data.manufacturer`; UI usa o `patch`, não a chave omitida no JSON |
| `CARTA_FOLDER_JUNK` mata cartas de credenciamento | FR-044 manda ignorar credenciamento; teste `Credenciamento 21-05-2025 CARBOMEDICS.pdf` → false |
| MIME `application/pdf` no share-email | rota de compartilhar só envia PDF (`pdfFromStream`) |
| Isolamento/IDOR/auth skip nas rotas documentos | `requireEditor` + `requireDocumentosPage` + `findFirst`/`updateMany` com `companyId: access.companyId` |

## Classificação (G6)

| Id | Acção |
|---|---|
| C1, C2 | corrigir agora — o popup de datas/fabricante é mentira após a ingestão |
| C3 | corrigir agora ou documentar o teto no spec — FR-044 vs comentário de performance |
| C4, C5, C6, C7, C8, C9, C10 | depois |
