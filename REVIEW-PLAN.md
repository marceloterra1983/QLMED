# QLMED — Plano de Correção Completa

> **SUPERSEDED (2026-07-28).** Este plano de 2026-04 é histórico. A fonte de
> verdade é `specs/` (comportamento e critérios de aceite) e `docs/decisions/`
> (decisões duráveis), conforme `AGENTS.md`. Não usar este arquivo para
> priorizar trabalho novo.

**Data**: 2026-04-10
**Baseado em**: Security Audit, Deps Audit, Tech Debt Audit, Performance Audit
**Branch base**: `main`

---

> **SUPERSEDED (2026-07-30).** Plano de abr/2026 absorvido pelo roadmap GSD e
> pelas fases 01–12, ambos removidos com o GSD desativado
> (`governance.yaml: gsd.mode=disabled`). Manter só como arquivo histórico; não
> usar como checklist operacional.

## Visão Geral

10 fases organizadas por prioridade (risco + impacto). Cada fase é uma branch + PR independente.
Fases P0-P2 são críticas e devem ser feitas primeiro. P3-P5 são o core de qualidade.
P6-P9 são melhorias estruturais que podem ser feitas incrementalmente.

**Estimativa total**: ~60-80 horas de trabalho

---

## FASE 0 — Security Critical (branch: `fix/security-critical`)

**Prioridade**: URGENTE | **Risco**: Exploração ativa possível
**Estimativa**: 4-6h

### 0.1 Proteger sistema de PINs (manter padrão da empresa)
- **Arquivo**: `src/lib/auth-options.ts:6-14`
- **Ação**: Manter PINs como método de login (padrão da empresa), mas:
  - Mover `PIN_MAP` do código-fonte para env var (`PIN_MAP_JSON`) ou tabela no DB
  - Adicionar rate limiting específico para login por PIN (max 5 tentativas/min por IP)
  - Adicionar logging de tentativas falhas de PIN
- **Validação**: Login por PIN continua funcionando, mas protegido contra brute-force

### 0.2 Adicionar rate limiting
- **Instalar**: `rate-limiter-flexible` ou implementar com `lru-cache`
- **Endpoints prioritários**:
  - `/api/auth/[...nextauth]` (login) — max 5 tentativas/min por IP
  - `/api/invoices/upload` — max 10 req/min
  - `/api/certificate/upload` — max 5 req/min
  - `/api/webhooks/n8n` — max 60 req/min
- **Implementar como middleware** em `src/middleware.ts`

### 0.3 Expandir middleware matcher
- **Arquivo**: `src/middleware.ts:98-118`
- **Ação**: Trocar lista explícita por catch-all `/api/:path*` com allowlist para rotas públicas
- **Rotas públicas permitidas**: `/api/auth`, `/api/health`, `/api/register`

### 0.4 Proteger endpoints que escrevem no DB
- **`/api/anvisa/validate/route.ts`** — adicionar `requireAuth()`
- **`/api/anvisa/embed-status/route.ts`** — adicionar `requireAuth()`

### 0.5 Reduzir exposição do health endpoint
- **`/api/health/route.ts`** — remover `memory`, `uptime`, `buildCommit` da resposta pública. Retornar detalhes apenas com auth.

### 0.6 Corrigir inconsistência de password policy
- **`/api/users/[id]/route.ts:15`** — alinhar Zod schema para `min(6)` (igual ao runtime check)
- **Nota**: Manter política de senha atual (min 6 chars) — padrão da empresa

---

## FASE 1 — Dependency Fixes (branch: `fix/deps-vulnerabilities`)

**Prioridade**: ALTA | **Risco**: CVEs conhecidos em produção
**Estimativa**: 3-4h

### 1.1 npm audit fix (transitive)
- `npm audit fix` — corrige basic-ftp, @xmldom/xmldom, flatted, vite, ajv, brace-expansion, minimatch

### 1.2 Atualizar node-forge
- **Motivo**: 4 CVEs incluindo signature forgery — crítico para assinatura de NF-e
- `npm update node-forge`
- **Testar**: upload e validação de certificado digital A1

### 1.3 Atualizar nodemailer para v8
- **Motivo**: SMTP command injection via CRLF
- `npm install nodemailer@8`
- **Breaking changes**: verificar API de envio de email
- **Atualizar**: `@types/nodemailer@8`

### 1.4 Substituir xlsx por exceljs
- **Motivo**: xlsx é abandonware com prototype pollution sem fix
- **Único uso**: `/api/invoices/bulk-download/route.ts` e `/api/estoque/import-e509/route.ts`
- Instalar `exceljs`, reescrever as 2 rotas, remover `xlsx`

### 1.5 Remover dependências não usadas
- `npm uninstall html-to-image`
- Avaliar remoção de `sharp` (verificar se `next/image` optimization está ativo)

---

## FASE 2 — Database Schema Hardening (branch: `fix/database-schema`)

**Prioridade**: ALTA | **Risco**: Schema drift, queries lentas
**Estimativa**: 2-3h

### 2.1 Adicionar indexes faltantes ao Prisma schema
```prisma
@@index([recipientCnpj])
@@index([companyId, recipientCnpj])
```
- **Arquivo**: `prisma/schema.prisma` modelo Invoice

### 2.2 Modelos satélite já consolidados
- Os modelos Prisma das tabelas satélite já existem em `prisma/schema.prisma`, sem `@@ignore`.
- Não adicionar stubs nem usar DDL em runtime; manter o Prisma como fonte de verdade.

### 2.3 Aplicar mudanças
- Para novos indexes, criar uma migration Prisma versionada e validá-la pelos gates de migração do projeto.

---

## FASE 3 — Performance: Eliminar XML Runtime Parsing (branch: `perf/xml-extraction`)

**Prioridade**: ALTA | **Impacto**: Maior ganho de performance do projeto
**Estimativa**: 10-14h

### 3.1 Persistir cidade do destinatário na ingestão
- **Problema**: `customers/route.ts:152-161` faz regex em xmlContent para extrair cidade
- **Solução**: Extrair `xMun` durante ingestão e salvar em campo denormalizado (ex: `recipientCity` na Invoice ou em `contact_fiscal`)
- **Backfill**: Script para popular dados existentes

### 3.2 Persistir dados de duplicata na ingestão
- **Problema**: `financeiro-duplicatas.ts:277-294` carrega TODO xmlContent para extrair vencimentos
- **Solução**: Criar tabela `invoice_duplicata` (nDup, dVenc, vDup, invoiceId)
- Extrair durante `parseInvoiceXml` e persistir
- **Backfill**: Script para processar invoices existentes

### 3.3 Eliminar xmlContent dos queries de contagem
- **Problema**: `customers/route.ts:258-278` e `suppliers/route.ts:211-231` carregam XML completo só para contar produtos
- **Solução**: Usar `product_registry` ou `invoice_item_tax` para contagem (já têm dados parsed)

### 3.4 Eliminar xmlContent do products route
- **Problema**: `products/route.ts:462-488` carrega até 3000 XMLs para agregação
- **Solução**: Garantir que `/products/list` (que usa `product_registry`) é o endpoint padrão. Deprecar rota legacy.

### 3.5 Corrigir N+1 no backfill-tax
- **Arquivo**: `invoices/backfill-tax/route.ts:42-64`
- **Solução**: Batch-fetch 200 invoices em uma query, batch-upsert resultados

---

## FASE 4 — Code Deduplication (branch: `refactor/deduplication`)

**Prioridade**: MÉDIA-ALTA | **Impacto**: Manutenibilidade
**Estimativa**: 8-10h

### 4.1 Centralizar funções utilitárias
- Deletar cópias inline e importar de `@/lib/utils`:
  - `ensureArray()` — 6 cópias → 1 import
  - `cleanString()` — 7 cópias → 1 import
  - `extractAnvisa()` / `extractAnvisaFromFreeText()` — 3 cópias → `@/lib/product-aggregation.ts`
  - `parseCnpjResponse()` — 2 cópias → criar em `@/lib/cnpj-utils.ts`
  - `validateIEFormat()` — 3 cópias → importar de `@/lib/ie-validation.ts`
  - `val()` / `num()` / `gv()` — 3 cópias → `@/lib/xml-helpers.ts`

### 4.2 Unificar financeiro contas-pagar / contas-receber
- **Fato**: rota `installments/route.ts` é 100% idêntica entre pagar e receber
- **Solução**: Criar `@/lib/financeiro-shared.ts` com lógica comum parametrizada por direção
- Reduzir ~2300 linhas duplicadas

### 4.3 Unificar suppliers / customers
- **Fato**: ~80% idênticos (modal, routes, details)
- **Solução**: Criar abstração `ContactEntity` com lógica compartilhada
- Manter pages separadas mas com componentes compartilhados

---

## FASE 5 — API Validation & Error Handling (branch: `fix/api-validation`)

**Prioridade**: MÉDIA | **Impacto**: Robustez, segurança
**Estimativa**: 6-8h

### 5.1 Adicionar Zod schemas nas 74 rotas que faltam
- Priorizar rotas que aceitam POST/PUT/PATCH com body
- Criar schemas reutilizáveis em `@/lib/schemas/` (pagination, companyId filter, date range, etc.)

### 5.2 Padronizar error handling
- Substituir 34x `catch (e: any)` por `catch (e: unknown)` com narrowing
- Criar helper `apiError(e: unknown): NextResponse` que:
  - Loga o erro completo server-side
  - Retorna mensagem genérica ao client (sem leak de internals)

### 5.3 Substituir console.log por logger estruturado
- Instalar `pino` ou `winston`
- Criar `@/lib/logger.ts` com níveis (debug/info/warn/error)
- Substituir 189 console.log/warn/error calls
- Configurar nível por env var (`LOG_LEVEL=info` em prod)

---

## FASE 6 — Type Safety (branch: `refactor/type-safety`)

**Prioridade**: MÉDIA | **Impacto**: Prevenção de bugs
**Estimativa**: 8-10h

### 6.1 Criar interfaces para XML parsed
- `@/types/nfe-xml.ts` — NFeXml, NFeDet, NFeEmit, NFeDest, etc.
- `@/types/cte-xml.ts` — CTeXml, CTeRem, CTeDest, etc.
- `@/types/nfse-xml.ts` — NFSeXml, NFSeServico, etc.

### 6.2 Tipar funções de parsing
- `parse-invoice-xml.ts` — substituir `any` por interfaces tipadas
- `invoices/[id]/pdf/route.ts` — tipar `gv()`, `getParty()`, `normalizeCteParty()`
- `product-aggregation.ts` — tipar `extractBatches()`, `extractAnvisa()`

### 6.3 Eliminar `any` restantes
- `cadastro/produtos/page-client.tsx` — 20+ casts
- `ncm-lookup.ts` — tipar rows
- Catch blocks: `catch (e: unknown)` (coberto na Fase 5)

---

## FASE 7 — Large File Refactoring (branch: `refactor/split-files`)

**Prioridade**: MÉDIA-BAIXA | **Impacto**: Manutenibilidade
**Estimativa**: 8-12h

### 7.1 Split produtos page (3609 → ~5 arquivos)
- `ProductTable.tsx`
- `ProductFilters.tsx`
- `BulkEditModal.tsx`
- `AutoClassifyPanel.tsx`
- `ExportCSVButton.tsx`

### 7.2 Split PDF route (2291 → ~4 módulos)
- `@/lib/pdf/danfe-generator.ts`
- `@/lib/pdf/dacte-generator.ts`
- `@/lib/pdf/nfse-generator.ts`
- `@/lib/pdf/pdf-utils.ts`

### 7.3 Split modals (1575 + 1524 → componentes)
- `SupplierDetailsModal` → tabs em sub-componentes
- `CustomerDetailsModal` → tabs em sub-componentes
- Compartilhar `ContactInfoTab`, `FiscalTab`, etc.

### 7.4 Split settings page (1298 → tabs)
### 7.5 Split financeiro pages (1159 cada → shared)
### 7.6 Split local-xml-sync (1130 → módulos)

---

## FASE 8 — Performance: Search & Pagination (branch: `perf/search-pagination`)

**Prioridade**: MÉDIA | **Impacto**: UX + carga no DB
**Estimativa**: 6-8h

### 8.1 Implementar busca DB-level em invoices
- **Problema**: carrega 5000 registros e filtra em memória com `flexMatchAll`
- **Solução**: `WHERE "senderName" ILIKE $1 OR "recipientName" ILIKE $1 OR "accessKey" LIKE $1`
- Considerar `tsvector` se volume crescer

### 8.2 Adicionar paginação real ao products/list
- Adicionar `LIMIT $N OFFSET $M` na query SQL
- Retornar `pagination.pages` calculado corretamente

### 8.3 Adicionar cache headers
- Dashboard: `Cache-Control: private, max-age=30`
- Listas: `Cache-Control: private, max-age=10`
- Lookups (NCM, CNPJ): `Cache-Control: public, max-age=3600`

### 8.4 Otimizar layout client component
- **Problema**: `(painel)/layout.tsx` é 100% client, forçando CSR em todas as páginas
- **Solução**: Server component wrapper + client islands (sidebar, session)
- Remover `MutationObserver` no body → usar React context para modais

---

## FASE 9 — Major Upgrades (branch: `upgrade/major-deps`)

**Prioridade**: BAIXA (planejar separado) | **Impacto**: Segurança long-term
**Estimativa**: 15-20h (a maior fase)

### 9.1 Next.js 14 → 15 (→ 16)
- 4 CVEs no v14
- Breaking: async request APIs (`params`, `searchParams`, `cookies()`, `headers()`)
- Requer React 19
- **Estratégia**: Fazer 14→15 primeiro, estabilizar, depois 15→16

### 9.2 React 18 → 19
- Acoplado ao Next.js upgrade
- Verificar: `forwardRef` removal, new hooks

### 9.3 Prisma 5 → 7
- 2 major versions
- Verificar migration guide para schema changes
- Testar todas as queries raw

### 9.4 ESLint 8 → 9+
- Flat config obrigatório
- Reescrever `.eslintrc` → `eslint.config.mjs`

### 9.5 Minor upgrades
- `bcryptjs` 2→3, `zod` 3→4, `typescript` 5→6
- `tailwindcss` 3→4 (rewrite significativo — avaliar separado)

---

## Ordem de Execução Recomendada

```
Semana 1:  FASE 0 (Security Critical) + FASE 1 (Deps)
Semana 2:  FASE 2 (DB Schema) + FASE 4.1 (Utils dedup)
Semana 3:  FASE 3 (XML Extraction) ← maior impacto de performance
Semana 4:  FASE 4.2-4.3 (Module dedup) + FASE 5 (Validation)
Semana 5:  FASE 6 (Type Safety) + FASE 8 (Search/Pagination)
Semana 6:  FASE 7 (File Splitting)
Semana 7+: FASE 9 (Major Upgrades) ← planejar com cuidado
```

## Regras de Execução

1. **Cada fase = 1 branch + 1 PR** (exceto Fase 9 que pode ter sub-PRs)
2. **Testar em dev** antes de merge (port 3001)
3. **DB changes** (Fase 2, 3): fazer backup antes, aplicar com `prisma db push`
4. **Nunca** rodar `prisma migrate dev` ou `prisma migrate reset`
5. **Deploy** via GitHub Actions workflow_dispatch após merge na main
6. **Rollback** disponível via `npm run rollback:server`
