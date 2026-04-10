# Requirements: QLMED Correção e Hardening

**Defined:** 2026-04-10
**Core Value:** Garantir que o QLMED em produção seja seguro, performático e manutenível

## v1 Requirements

Requirements para este milestone. Cada um mapeia para fases do roadmap.

### Security

- [x] **SEC-01**: Sistema de PINs protegido (movido do código-fonte para env var/DB, com rate limiting e logging de falhas)
- [x] **SEC-02**: Rate limiting em endpoints críticos (login max 5/min, upload max 10/min, webhooks max 60/min)
- [x] **SEC-03**: Middleware expandido para cobrir todas as rotas API via catch-all com allowlist
- [x] **SEC-04**: Endpoints que escrevem no DB exigem autenticação (/api/anvisa/validate, /api/anvisa/embed-status)
- [x] **SEC-05**: Health endpoint retorna detalhes (memory, uptime, commit) apenas com auth
- [x] **SEC-06**: Password policy consistente — Zod schema e runtime check ambos min(6)

### Dependencies

- [x] **DEP-01**: Vulnerabilidades transitivas corrigidas via npm audit fix
- [x] **DEP-02**: node-forge atualizado (4 CVEs corrigidos, incluindo signature forgery)
- [x] **DEP-03**: nodemailer atualizado para v8 (SMTP injection corrigido)
- [x] **DEP-04**: xlsx substituído por exceljs em bulk-download e import-e509
- [x] **DEP-05**: html-to-image removido (zero imports no codebase)

### Database Schema

- [x] **DB-01**: Index @@index([recipientCnpj]) e @@index([companyId, recipientCnpj]) adicionados ao Invoice
- [x] **DB-02**: 6 shadow tables com @@ignore model stubs no schema.prisma (product_registry, stock_entry, nfe_entry_item, product_settings_catalog, cnpj_cache, cnpj_monitoring)

### Performance — XML Extraction

- [x] **PERF-01**: Cidade do destinatário extraída e persistida durante ingestão de invoice (não mais regex em runtime)
- [x] **PERF-02**: Dados de duplicata (nDup, dVenc, vDup) persistidos em tabela dedicada durante ingestão
- [x] **PERF-03**: Queries de customers/suppliers não carregam xmlContent para contagem de produtos
- [x] **PERF-04**: /api/products rota legacy deprecada — /api/products/list (product_registry) como padrão
- [x] **PERF-05**: backfill-tax usa batch-fetch em vez de 200+ queries sequenciais (N+1 eliminado)

### Code Deduplication

- [x] **DUP-01**: Funções utilitárias centralizadas — ensureArray, cleanString, extractAnvisa, parseCnpjResponse, validateIEFormat, val/num/gv importadas de módulos compartilhados
- [x] **DUP-02**: Financeiro contas-pagar/contas-receber unificados com módulo compartilhado parametrizado por direção
- [x] **DUP-03**: Suppliers/customers compartilham lógica via abstração ContactEntity

### API Validation & Logging

- [x] **API-01**: Zod schemas em todas as rotas que aceitam POST/PUT/PATCH (schemas reutilizáveis em @/lib/schemas/)
- [x] **API-02**: Error handling padronizado — catch (e: unknown) com apiError() helper que loga server-side e retorna msg genérica
- [x] **API-03**: Logger estruturado (pino) substituindo 189 console.log/warn/error com níveis configuráveis por env var

### Type Safety

- [x] **TYPE-01**: Interfaces tipadas para XML parsed — NFeXml, CTeXml, NFSeXml em @/types/
- [x] **TYPE-02**: Funções de parsing tipadas (parse-invoice-xml, pdf route, product-aggregation)
- [x] **TYPE-03**: 200+ usos de `any` eliminados, incluindo 34 catch blocks usando `unknown`

### File Splitting

- [x] **SPLIT-01**: produtos/page-client.tsx (3609→~5 componentes) — ProductTable, ProductFilters, BulkEditModal, AutoClassifyPanel, ExportCSV
- [x] **SPLIT-02**: invoices/[id]/pdf/route.ts (2291→~4 módulos) — danfe, dacte, nfse generators + pdf-utils
- [x] **SPLIT-03**: SupplierDetailsModal e CustomerDetailsModal compartilham sub-componentes de tabs
- [x] **SPLIT-04**: settings/page-client, financeiro pages, local-xml-sync divididos em módulos

### Performance — Search & Pagination

- [x] **PERF-06**: Busca de invoices usa WHERE ILIKE no DB em vez de carregar 5000 records e filtrar em memória
- [x] **PERF-07**: products/list tem paginação real com LIMIT/OFFSET
- [ ] **PERF-08**: Cache headers em API routes (dashboard 30s, listas 10s, lookups 3600s)
- [ ] **PERF-09**: Layout (painel) usa server component wrapper com client islands (sem MutationObserver no body)

### Major Upgrades

- [ ] **UPG-01**: Next.js 14→15 (4 CVEs corrigidos, async request APIs migrados)
- [ ] **UPG-02**: React 18→19 (acoplado ao Next.js upgrade)
- [ ] **UPG-03**: Prisma 5→7 (schema changes, raw queries testados)
- [ ] **UPG-04**: ESLint 8→9+ (flat config, eslint.config.mjs)
- [ ] **UPG-05**: Minor upgrades — bcryptjs 2→3, zod 3→4, typescript 5→6

## v2 Requirements

Deferred para milestone futuro.

- **XMLSTORE-01**: Extrair xmlContent da tabela Invoice para storage externo (S3/filesystem) — referenciado em memory
- **TW4-01**: Migração Tailwind CSS 3→4 — rewrite significativo
- **TEST-01**: Implementar test suite (unit + integration) para rotas API críticas

## Out of Scope

| Feature | Reason |
|---------|--------|
| Novas funcionalidades de negócio | Milestone exclusivamente de correção/hardening |
| Tailwind 3→4 | Rewrite muito grande, baixo ROI para este milestone |
| prisma migrate dev | DB compartilhado dev/prod, usar apenas db push |
| Redesign de UI | Manter visual atual, apenas refatorar código |
| Test suite completo | Foco em correção, não em testes — defer para v2 |

## Traceability

| Requirement | Phase |
|-------------|-------|
| SEC-01..SEC-06 | Phase 1: Security Critical |
| DEP-01..DEP-05 | Phase 2: Dependency Fixes |
| DB-01..DB-02 | Phase 3: Database Schema |
| PERF-01..PERF-05 | Phase 4: XML Extraction |
| DUP-01..DUP-03 | Phase 5: Code Deduplication |
| API-01..API-03 | Phase 6: API Validation & Logging |
| TYPE-01..TYPE-03 | Phase 7: Type Safety |
| SPLIT-01..SPLIT-04 | Phase 8: File Splitting |
| PERF-06..PERF-09 | Phase 9: Search & Pagination |
| UPG-01..UPG-05 | Phase 10: Major Upgrades |

---
*Last updated: 2026-04-10 after initialization*
