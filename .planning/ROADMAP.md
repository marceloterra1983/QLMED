# Roadmap: QLMED Correcao e Hardening

**Milestone:** Correcao e Hardening Completo
**Phases:** 10
**Granularity:** Fine
**Created:** 2026-04-10

## Phases

- [ ] **Phase 1: Security Critical** - Proteger PINs, rate limiting, middleware catch-all, auth em endpoints desprotegidos
- [ ] **Phase 2: Dependency Fixes** - Corrigir CVEs conhecidos (node-forge, nodemailer), substituir abandonware (xlsx), limpar deps
- [x] **Phase 3: Database Schema Hardening** - Adicionar indexes faltantes e stubs para shadow tables
- [ ] **Phase 4: XML Extraction Performance** - Persistir dados extraidos de XML na ingestao, eliminar parsing runtime
- [ ] **Phase 5: Code Deduplication** - Centralizar funcoes duplicadas, unificar financeiro e contacts
- [ ] **Phase 6: API Validation & Logging** - Zod schemas em todas as rotas, error handling padronizado, logger estruturado
- [ ] **Phase 7: Type Safety** - Interfaces tipadas para XML, funcoes de parsing tipadas, eliminar 200+ any
- [ ] **Phase 8: File Splitting** - Dividir arquivos >1000 linhas em modulos coesos
- [ ] **Phase 9: Search & Pagination** - Busca DB-level, paginacao real, cache headers, server component layout
- [x] **Phase 10: Major Upgrades** - Next.js 15, React 19, Prisma 7, ESLint 9, minor upgrades (completed 2026-04-10)

## Milestone v2.0: Remediação Pós-Revisão Arquitetural (iniciada 2026-07-11)

**Origem:** `docs/server/ARCH-REMEDIATION-PLAN.md`, Fase 4 e Fase 5.1/5.3/5.4.
Continua a numeração de fases desta mesma milestone técnica (não reinicia em 1).

- [ ] **Phase 11: Unificação de Schema** - Baseline Prisma das 9 tabelas satélite `@@ignore`, migração store-a-store para Client tipado, política expand/contract de migração
- [x] **Phase 12: Desduplicação de Código** - products/route.ts consome product-aggregation.ts (sem cópias inline), auto-sync.ts quebrado em scheduler+strategies, siscomex-client criado — concluída em 2026-07-12

## Phase Details

### Phase 1: Security Critical
**Goal**: Sistema protegido contra exploracoes conhecidas — PINs seguros, rate limiting ativo, todas as rotas API autenticadas
**Depends on**: Nothing (first phase, highest priority)
**Requirements**: SEC-01, SEC-02, SEC-03, SEC-04, SEC-05, SEC-06
**Success Criteria** (what must be TRUE):
  1. Login por PIN continua funcionando, mas PINs nao sao visiveis no codigo-fonte (movidos para env var ou DB)
  2. Tentativas de login alem de 5/min por IP sao bloqueadas com HTTP 429
  3. Qualquer rota API nao listada na allowlist publica retorna 401 sem sessao valida
  4. Health endpoint retorna apenas status basico sem auth; detalhes (memory, uptime, commit) exigem auth
  5. Tentativas falhas de login/PIN sao registradas com IP e timestamp
**Plans:** 1/3 plans executed
Plans:
- [ ] 01-PLAN-01.md — PIN protection: move PINs to env var, add failed login logging (SEC-01)
- [ ] 01-PLAN-02.md — Rate limiting: create Edge-compatible rate limiter, integrate into middleware (SEC-02)
- [ ] 01-PLAN-03.md — Middleware catch-all, ANVISA auth, health tiering, password policy fix (SEC-03, SEC-04, SEC-05, SEC-06)

### Phase 2: Dependency Fixes
**Goal**: Zero CVEs conhecidos nas dependencias diretas e transitivas do projeto
**Depends on**: Phase 1 (security first, then deps — node-forge update needs careful testing with NF-e signing)
**Requirements**: DEP-01, DEP-02, DEP-03, DEP-04, DEP-05
**Success Criteria** (what must be TRUE):
  1. npm audit retorna zero vulnerabilidades high/critical
  2. Upload e validacao de certificado digital A1 funciona apos update do node-forge (assinatura NF-e intacta)
  3. Export de Excel em bulk-download e import-e509 funciona com exceljs (xlsx removido)
  4. Envio de email funciona com nodemailer v8
**Plans:** 2 plans
Plans:
- [x] 02-01-PLAN.md — Update deps: npm audit fix, node-forge latest, nodemailer v8, remove html-to-image (DEP-01, DEP-02, DEP-03, DEP-05)
- [x] 02-02-PLAN.md — Replace xlsx with exceljs in all 4 usage locations (DEP-04)

### Phase 3: Database Schema Hardening
**Goal**: Schema Prisma alinhado com todas as tabelas do banco, queries de Invoice otimizadas com indexes adequados
**Depends on**: Phase 2 (deps clean before schema changes on shared DB)
**Requirements**: DB-01, DB-02
**Success Criteria** (what must be TRUE):
  1. Query por recipientCnpj na Invoice usa index (verificavel via EXPLAIN ANALYZE)
  2. prisma db push executa sem warnings de drift para as 6 shadow tables
  3. Nenhuma funcionalidade existente quebrada apos schema push (testar em dev port 3001)
**Plans:** 1 plan
Plans:
- [x] 03-01-PLAN.md — Add Invoice indexes + 6 shadow table @@ignore stubs (DB-01, DB-02)

### Phase 4: XML Extraction Performance
**Goal**: Dados criticos de invoice (cidade, duplicatas, contagem de produtos) acessiveis sem carregar xmlContent em runtime
**Depends on**: Phase 3 (indexes e schema limpo antes de adicionar colunas/tabelas)
**Requirements**: PERF-01, PERF-02, PERF-03, PERF-04, PERF-05
**Success Criteria** (what must be TRUE):
  1. Pagina de customers exibe cidade do destinatario sem carregar xmlContent (query nao inclui select xmlContent)
  2. Pagina de financeiro/duplicatas carrega dados de vencimento de tabela dedicada (nao de XML parsing)
  3. Contagem de produtos em customers/suppliers usa product_registry em vez de parsear XML
  4. Rota /api/products/list e o endpoint padrao; rota legacy /api/products esta deprecada
  5. backfill-tax processa 200 invoices em uma unica query batch (nao 200 queries sequenciais)
**Plans:** 5 plans
Plans:
- [x] 04-01-PLAN.md — Replace xmlContent product counting in customers/suppliers with invoice_item_tax queries (PERF-03)
- [x] 04-02-PLAN.md — Fix N+1 in backfill-tax with batch-fetch (PERF-05)
- [x] 04-03-PLAN.md — Deprecate legacy /api/products, migrate frontend exports to /api/products/list (PERF-04)
- [x] 04-04-PLAN.md — Add city to contact_fiscal, replace xmlContent city extraction in customers (PERF-01)
- [x] 04-05-PLAN.md — Create invoice_duplicata table, rewrite financeiro-duplicatas to use it (PERF-02)

### Phase 5: Code Deduplication
**Goal**: Funcoes utilitarias existem em um unico lugar, modulos financeiro e contacts compartilham logica em vez de duplicar
**Depends on**: Phase 4 (XML extraction pode alterar parsing code que dedup precisa consolidar)
**Requirements**: DUP-01, DUP-02, DUP-03
**Success Criteria** (what must be TRUE):
  1. ensureArray, cleanString, extractAnvisa, parseCnpjResponse, validateIEFormat, val/num/gv — cada uma existe em exatamente 1 arquivo, importada de la em todos os usos
  2. Contas-pagar e contas-receber compartilham modulo parametrizado por direcao (sem codigo duplicado entre as rotas)
  3. SupplierDetailsModal e CustomerDetailsModal usam componentes de ContactEntity compartilhados
**Plans:** 3 plans
Plans:
- [x] 05-01-PLAN.md — Centralize 7 duplicated utility functions into canonical modules (DUP-01)
- [x] 05-02-PLAN.md — Unify financeiro contas-pagar/contas-receber into shared parametrized module (DUP-02)
- [x] 05-03-PLAN.md — Unify suppliers/customers API routes and verify modal shared imports (DUP-03)

### Phase 6: API Validation & Logging
**Goal**: Todas as rotas API validam input com schemas, erros sao tratados consistentemente, logs sao estruturados e configuraveis
**Depends on**: Phase 5 (dedup done first so validation/logging is applied to consolidated code, not duplicated code)
**Requirements**: API-01, API-02, API-03
**Success Criteria** (what must be TRUE):
  1. Toda rota POST/PUT/PATCH rejeita payload invalido com HTTP 400 e mensagem descritiva (Zod validation)
  2. Nenhum erro interno vaza stack trace ou detalhes de implementacao para o cliente (apiError helper ativo)
  3. Logs de producao sao JSON estruturado (pino) com nivel configuravel via LOG_LEVEL env var
  4. Zero console.log/warn/error restantes no codebase (substituidos por logger)
**Plans:** 5 plans
Plans:
- [x] 06-01-PLAN.md — Foundations: install pino, create logger.ts, apiError helper, common Zod schemas (API-01, API-02, API-03)
- [x] 06-02-PLAN.md — Replace 102 console calls in src/lib/ with structured pino logger (API-03)
- [x] 06-03-PLAN.md — Fix 34 catch(e:any) blocks + replace 92 console calls in API routes (API-02, API-03)
- [x] 06-04-PLAN.md — Zod validation batch 1: invoices, financeiro, estoque, certificate, users, companies (API-01)
- [x] 06-05-PLAN.md — Zod validation batch 2: products, nsdocs, contacts, remaining routes + 100% audit (API-01)

### Phase 7: Type Safety
**Goal**: XML parsed, funcoes de parsing e catch blocks sao tipados — any eliminado como padrao do codebase
**Depends on**: Phase 6 (catch blocks already converted to unknown in Phase 6; XML interfaces build on consolidated parsing code)
**Requirements**: TYPE-01, TYPE-02, TYPE-03
**Success Criteria** (what must be TRUE):
  1. Interfaces NFeXml, CTeXml, NFSeXml existem em @/types/ e sao usadas em todo parsing de XML
  2. parse-invoice-xml.ts, pdf route e product-aggregation retornam tipos concretos (nao any)
  3. tsc --noEmit passa sem erros e grep por ": any" retorna zero resultados no src/
**Plans:** 3 plans
Plans:
- [x] 07-01-PLAN.md — Create XML type interfaces (NFeXml, CTeXml, NFSeXml) + type xml-helpers.ts (TYPE-01)
- [x] 07-02-PLAN.md — Apply XML types to core parsing functions: parse-invoice-xml, pdf/route, details/route, product-aggregation (TYPE-02)
- [x] 07-03-PLAN.md — Eliminate remaining ~99 any across 31 files: lib modules, page-clients, API routes (TYPE-03)

### Phase 8: File Splitting
**Goal**: Nenhum arquivo de componente/rota excede 500 linhas — arquivos grandes divididos em modulos coesos
**Depends on**: Phase 7 (type safety done first so split code maintains type contracts)
**Requirements**: SPLIT-01, SPLIT-02, SPLIT-03, SPLIT-04
**Success Criteria** (what must be TRUE):
  1. produtos/page-client.tsx dividido em 5+ componentes (ProductTable, ProductFilters, BulkEditModal, AutoClassifyPanel, ExportCSV)
  2. PDF route dividida em modulos separados por tipo de documento (danfe, dacte, nfse generators + pdf-utils)
  3. SupplierDetailsModal e CustomerDetailsModal compartilham sub-componentes de tabs
  4. Nenhum arquivo em src/ excede 800 linhas (exceto schemas gerados)
**Plans:** 4 plans
Plans:
- [x] 08-01-PLAN.md — Split produtos/page-client.tsx into 5+ components (SPLIT-01)
- [x] 08-02-PLAN.md — Split PDF route into danfe/dacte/nfse generators + pdf-utils (SPLIT-02)
- [x] 08-03-PLAN.md — Extract shared contact-details sub-components from modals (SPLIT-03)
- [x] 08-04-PLAN.md — Split settings, financeiro pages, local-xml-sync into modules (SPLIT-04)
**UI hint**: yes

### Phase 9: Search & Pagination
**Goal**: Busca e listagem usam queries DB eficientes com paginacao real e cache HTTP adequado
**Depends on**: Phase 8 (split files before optimizing search/pagination within them)
**Requirements**: PERF-06, PERF-07, PERF-08, PERF-09
**Success Criteria** (what must be TRUE):
  1. Busca de invoices executa WHERE ILIKE no DB (nao carrega 5000 records em memoria)
  2. products/list retorna paginas com LIMIT/OFFSET e total correto de paginas
  3. Responses de API incluem Cache-Control headers (dashboard 30s, listas 10s, lookups 3600s)
  4. Layout do painel usa server component wrapper — client code apenas nos islands interativos (sidebar, session)
**Plans:** 3 plans
Plans:
- [x] 09-01-PLAN.md — Replace invoices in-memory flexMatchAll search with DB-level WHERE ILIKE (PERF-06)
- [x] 09-02-PLAN.md — Add real LIMIT/OFFSET pagination to products/list (PERF-07)
- [x] 09-03-PLAN.md — Add Cache-Control headers to API routes + refactor layout to server/client split (PERF-08, PERF-09)
**UI hint**: yes

### Phase 10: Major Upgrades
**Goal**: Stack atualizada para versoes correntes — Next.js 15, React 19, Prisma 7 — eliminando CVEs de framework
**Depends on**: Phase 9 (all code corrections done before major framework changes)
**Requirements**: UPG-01, UPG-02, UPG-03, UPG-04, UPG-05
**Success Criteria** (what must be TRUE):
  1. Next.js 15 rodando com todas as async request APIs migradas (params, searchParams, cookies, headers)
  2. React 19 funcional — forwardRef removidos onde necessario, novos hooks verificados
  3. Prisma 7 funcional — todas as raw queries testadas, schema changes aplicados
  4. ESLint 9 com flat config (eslint.config.mjs) passando sem erros
  5. Build completo (npm run build) passa sem erros e app funciona end-to-end em dev
**Plans:** 4/4 plans complete
Plans:
- [x] 10-01-PLAN.md — Upgrade ESLint 8 to 9 with flat config migration (UPG-04)
- [x] 10-02-PLAN.md — Minor upgrades: bcryptjs 3, zod 4, typescript 6 (UPG-05)
- [x] 10-03-PLAN.md — Upgrade Prisma 5 to 7, verify 188 raw queries (UPG-03)
- [x] 10-04-PLAN.md — Upgrade Next.js 14 to 15 + React 18 to 19, migrate async APIs (UPG-01, UPG-02)

## Coverage

| Requirement | Phase | Status |
|-------------|-------|--------|
| SEC-01 | Phase 1 | Pending |
| SEC-02 | Phase 1 | Pending |
| SEC-03 | Phase 1 | Pending |
| SEC-04 | Phase 1 | Pending |
| SEC-05 | Phase 1 | Pending |
| SEC-06 | Phase 1 | Pending |
| DEP-01 | Phase 2 | Pending |
| DEP-02 | Phase 2 | Pending |
| DEP-03 | Phase 2 | Pending |
| DEP-04 | Phase 2 | Pending |
| DEP-05 | Phase 2 | Pending |
| DB-01 | Phase 3 | Pending |
| DB-02 | Phase 3 | Pending |
| PERF-01 | Phase 4 | Pending |
| PERF-02 | Phase 4 | Pending |
| PERF-03 | Phase 4 | Pending |
| PERF-04 | Phase 4 | Pending |
| PERF-05 | Phase 4 | Pending |
| DUP-01 | Phase 5 | Pending |
| DUP-02 | Phase 5 | Pending |
| DUP-03 | Phase 5 | Pending |
| API-01 | Phase 6 | Pending |
| API-02 | Phase 6 | Pending |
| API-03 | Phase 6 | Pending |
| TYPE-01 | Phase 7 | Pending |
| TYPE-02 | Phase 7 | Pending |
| TYPE-03 | Phase 7 | Pending |
| SPLIT-01 | Phase 8 | Pending |
| SPLIT-02 | Phase 8 | Pending |
| SPLIT-03 | Phase 8 | Pending |
| SPLIT-04 | Phase 8 | Pending |
| PERF-06 | Phase 9 | Pending |
| PERF-07 | Phase 9 | Pending |
| PERF-08 | Phase 9 | Pending |
| PERF-09 | Phase 9 | Pending |
| UPG-01 | Phase 10 | Pending |
| UPG-02 | Phase 10 | Pending |
| UPG-03 | Phase 10 | Pending |
| UPG-04 | Phase 10 | Pending |
| UPG-05 | Phase 10 | Pending |

**Total: 40/40 requirements mapped. Zero orphans.**

| Requirement | Phase |
|-------------|-------|
| SCHEMA-01 | Phase 11 | Pending |
| SCHEMA-02 | Phase 11 | Pending |
| SCHEMA-03 | Phase 11 | Pending |
| CODEDUP-01 | Phase 12 | Complete |
| CODEDUP-02 | Phase 12 | Complete |
| CODEDUP-03 | Phase 12 | Complete |

**Milestone v2.0: 6/6 requirements mapped. Zero orphans.**

### Phase 11: Unificação de Schema
**Goal**: As 11 tabelas satélite hoje `@@ignore` + DDL manual nas stores (9 originalmente listadas + `nfe_entry_item` + `cnpj_monitoring`, achado verificado ao vivo em 2026-07-11) passam a ser schema Prisma versionado; migrações voltam a ser seguras agora que dev roda em banco isolado (depende de `server-hardening` Phase 2 no repo `/home/marce`, concluída)
**Depends on**: Phase 10 (código deve estar limpo/atualizado antes); externamente, `server-hardening` workstream Phase 2 em `/home/marce` — **CONFIRMADO CONCLUÍDA em 2026-07-11** (`qlmed_dev` provisionado, `.env` de dev repontado, isolamento comprovado ao vivo: marker count=1 em dev, count=0 em produção). Bloqueio removido, fase liberada para planejamento/execução.
**Requirements**: SCHEMA-01, SCHEMA-02, SCHEMA-03
**Success Criteria** (o que precisa ser verdade):
  1. As 11 tabelas (invoice_tax_totals, invoice_item_tax, contact_fiscal, invoice_duplicata, product_registry, stock_entry, nfe_entry_item, ncm_cache, cnpj_cache, cnpj_monitoring, product_settings_catalog) têm modelo Prisma sem `@@ignore`, com migração baseline aplicada em produção sem perda de dados
  2. Ao menos a store de menor tráfego (cnpj_cache) foi migrada para Prisma Client tipado, com `ensureXxxTable()` correspondente removido
  3. Existe uma política expand/contract documentada (CLAUDE.md ou spec) para migrações futuras
  4. `deploy-production.yml` documenta explicitamente que rollback de imagem não desfaz migração de banco
**Plans:** 3 plans preparados no candidato; execução de produção continua bloqueada pelo checkpoint humano T007. As 10 tabelas satélite restantes ficam para um followup "Fase 11b" após a observação do piloto.
Plans:
- [ ] 11-01-PLAN.md — Baseline Prisma das 11 tabelas satélite (remove @@ignore, migra `_prisma_migrations` em qlmed_dev e produção via `migrate resolve --applied`, checkpoint humano antes de tocar produção) (SCHEMA-01)
- [ ] 11-02-PLAN.md — PoC: migrar CnpjCache (cnpj_cache) de raw SQL/`ensureCnpjCacheTable()` para Prisma Client tipado (SCHEMA-02)
- [ ] 11-03-PLAN.md — Documentar política expand/contract em CLAUDE.md + comentário explícito no deploy-production.yml sobre rollback não desfazer migração (SCHEMA-03)

### Phase 12: Desduplicação de Código
**Goal**: Eliminar a duplicação divergente entre `products/route.ts` e `product-aggregation.ts`, e quebrar o god module `auto-sync.ts`
**Depends on**: Nothing dentro deste repo (independente da Phase 11), mas roda depois dela para não competir por atenção com migração de schema
**Requirements**: CODEDUP-01, CODEDUP-02, CODEDUP-03
**Success Criteria** (o que precisa ser verdade):
  1. `products/route.ts` não contém mais `UNIT_ALIASES`, `normalizeUnit`, `buildProductKey`, `extractProductsFromXml` inline — importa de `product-aggregation.ts`
  2. Resposta da API de produtos é idêntica antes/depois (snapshot comparado)
  3. `auto-sync.ts` está dividido em `sync-scheduler` + `sync-strategies/{sefaz,nsdocs,receita-nfse}` com um contrato de estratégia comum
  4. `siscomex-client` existe (fecha o `fetch` direto em `ncm/bulk-sync`); `products/sync-anvisa` elimina seu `fetch()` de loopback interno para `/api/products`, chamando `buildProductsListPayload()` diretamente em processo — **correção pós-planejamento**: o `fetch` original não era uma chamada externa à ANVISA (verificado no código durante o plan-check), não há `anvisa-api` para rotear ali
**Plans:** 3/3 plans complete
Plans:
- [x] 12-01-PLAN.md — Dedup products/route.ts against product-aggregation.ts + behavior-preservation snapshot test (CODEDUP-01) — completed 2026-07-11
- [x] 12-02-PLAN.md — Split auto-sync.ts into sync-scheduler.ts + sync-strategies/{sefaz,nsdocs,receita-nfse}.ts with common contract (CODEDUP-02) — completed 2026-07-11
- [x] 12-03-PLAN.md — Create siscomex-client.ts (ncm/bulk-sync) + replace products/sync-anvisa's internal loopback fetch with in-process buildProductsListPayload() call (CODEDUP-03) — completed 2026-07-12, smoke test passed against real SEFAZ/NSDocs/SISCOMEX/ANVISA (see 12-03-SUMMARY.md)

## Progress

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Security Critical | 1/3 | In Progress|  |
| 2. Dependency Fixes | 0/2 | Planned | - |
| 3. Database Schema Hardening | 1/1 | Complete | 2026-04-10 |
| 4. XML Extraction Performance | 0/5 | Planned | - |
| 5. Code Deduplication | 0/3 | Planned | - |
| 6. API Validation & Logging | 0/5 | Not started | - |
| 7. Type Safety | 0/3 | Not started | - |
| 8. File Splitting | 0/4 | Planned | - |
| 9. Search & Pagination | 0/3 | Planned | - |
| 10. Major Upgrades | 4/4 | Complete   | 2026-04-10 |
| 11. Unificação de Schema | 0/3 | SCHEMA-01..03 closed 2026-07-26 (baseline+PoC CnpjCache+policy) | - |
| 12. Desduplicação de Código | 3/3 | Complete | 2026-07-12 |

---
*Last updated: 2026-07-13 — estado reconciliado com o candidato Phase05: Phase 12 concluída; Phase 11 preparada, mas não executada em produção.*
