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
- [ ] **Phase 10: Major Upgrades** - Next.js 15, React 19, Prisma 7, ESLint 9, minor upgrades

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
- [ ] 05-02-PLAN.md — Unify financeiro contas-pagar/contas-receber into shared parametrized module (DUP-02)
- [ ] 05-03-PLAN.md — Unify suppliers/customers API routes and verify modal shared imports (DUP-03)

### Phase 6: API Validation & Logging
**Goal**: Todas as rotas API validam input com schemas, erros sao tratados consistentemente, logs sao estruturados e configuraveis
**Depends on**: Phase 5 (dedup done first so validation/logging is applied to consolidated code, not duplicated code)
**Requirements**: API-01, API-02, API-03
**Success Criteria** (what must be TRUE):
  1. Toda rota POST/PUT/PATCH rejeita payload invalido com HTTP 400 e mensagem descritiva (Zod validation)
  2. Nenhum erro interno vaza stack trace ou detalhes de implementacao para o cliente (apiError helper ativo)
  3. Logs de producao sao JSON estruturado (pino) com nivel configuravel via LOG_LEVEL env var
  4. Zero console.log/warn/error restantes no codebase (substituidos por logger)
**Plans**: TBD

### Phase 7: Type Safety
**Goal**: XML parsed, funcoes de parsing e catch blocks sao tipados — any eliminado como padrao do codebase
**Depends on**: Phase 6 (catch blocks already converted to unknown in Phase 6; XML interfaces build on consolidated parsing code)
**Requirements**: TYPE-01, TYPE-02, TYPE-03
**Success Criteria** (what must be TRUE):
  1. Interfaces NFeXml, CTeXml, NFSeXml existem em @/types/ e sao usadas em todo parsing de XML
  2. parse-invoice-xml.ts, pdf route e product-aggregation retornam tipos concretos (nao any)
  3. tsc --noEmit passa sem erros e grep por ": any" retorna zero resultados no src/
**Plans**: TBD

### Phase 8: File Splitting
**Goal**: Nenhum arquivo de componente/rota excede 500 linhas — arquivos grandes divididos em modulos coesos
**Depends on**: Phase 7 (type safety done first so split code maintains type contracts)
**Requirements**: SPLIT-01, SPLIT-02, SPLIT-03, SPLIT-04
**Success Criteria** (what must be TRUE):
  1. produtos/page-client.tsx dividido em 5+ componentes (ProductTable, ProductFilters, BulkEditModal, AutoClassifyPanel, ExportCSV)
  2. PDF route dividida em modulos separados por tipo de documento (danfe, dacte, nfse generators + pdf-utils)
  3. SupplierDetailsModal e CustomerDetailsModal compartilham sub-componentes de tabs
  4. Nenhum arquivo em src/ excede 800 linhas (exceto schemas gerados)
**Plans**: TBD
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
**Plans**: TBD
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
**Plans**: TBD

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

## Progress

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Security Critical | 1/3 | In Progress|  |
| 2. Dependency Fixes | 0/2 | Planned | - |
| 3. Database Schema Hardening | 1/1 | Complete | 2026-04-10 |
| 4. XML Extraction Performance | 0/5 | Planned | - |
| 5. Code Deduplication | 0/3 | Planned | - |
| 6. API Validation & Logging | 0/? | Not started | - |
| 7. Type Safety | 0/? | Not started | - |
| 8. File Splitting | 0/? | Not started | - |
| 9. Search & Pagination | 0/? | Not started | - |
| 10. Major Upgrades | 0/? | Not started | - |

---
*Last updated: 2026-04-10 after Phase 5 planning*
