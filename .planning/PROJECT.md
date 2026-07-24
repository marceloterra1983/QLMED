# QLMED — Correção e Hardening Completo

## What This Is

Projeto de correção completa do QLMED — sistema fiscal/invoice brasileiro (NF-e, CT-e, NFS-e) built with Next.js 14, Prisma, PostgreSQL. Este milestone foca em resolver todos os problemas identificados em 4 audits paralelos (Security, Dependencies, Tech Debt, Performance) sem adicionar funcionalidades novas.

## Core Value

Garantir que o QLMED em produção seja **seguro, performático e manutenível** — corrigindo vulnerabilidades críticas, eliminando debt acumulado e preparando a base para evolução futura.

## Requirements

### Validated

- ✓ Sistema fiscal NF-e/CT-e/NFS-e funcionando — existing
- ✓ Autenticação NextAuth com PINs (padrão empresa) — existing
- ✓ Integração Sefaz, NSDocs, Receita Federal — existing
- ✓ Integração WhatsApp (Evolution API) — existing
- ✓ Workflow automation (n8n) — existing
- ✓ OneDrive XML sync — existing
- ✓ Gestão de estoque, financeiro, cadastros — existing
- ✓ PDF generation (DANFE, DACTE, NFS-e) — existing
- ✓ Deploy via GitHub Actions — existing

### Active

- ✓ **SEC-01**: Sistema de PINs protegido (env var + logging) — Phase 1
- ✓ **SEC-02**: Rate limiting em endpoints críticos — Phase 1
- ✓ **SEC-03**: Middleware catch-all com allowlist — Phase 1
- ✓ **SEC-04**: Endpoints ANVISA protegidos com auth — Phase 1
- ✓ **SEC-05**: Health endpoint com resposta tiered — Phase 1
- ✓ **SEC-06**: Password policy consistente min(6) — Phase 1
- [ ] **DEP-01**: npm audit fix (transitive vulnerabilities)
- [ ] **DEP-02**: Atualizar node-forge (4 CVEs, signature forgery)
- [ ] **DEP-03**: Atualizar nodemailer para v8 (SMTP injection)
- [ ] **DEP-04**: Substituir xlsx por exceljs (abandonware)
- [ ] **DEP-05**: Remover dependências não usadas (html-to-image)
- [ ] **DB-01**: Adicionar @@index recipientCnpj na Invoice
- [ ] **DB-02**: Adicionar @@ignore stubs para 6 shadow tables
- [ ] **PERF-01**: Persistir cidade do destinatário na ingestão (não extrair de XML em runtime)
- [ ] **PERF-02**: Persistir dados de duplicata na ingestão
- [ ] **PERF-03**: Eliminar xmlContent de queries de contagem (customers/suppliers)
- [ ] **PERF-04**: Usar product_registry como endpoint padrão de produtos
- [ ] **PERF-05**: Corrigir N+1 no backfill-tax
- [ ] **PERF-06**: Implementar busca DB-level em invoices (substituir flexMatchAll)
- [ ] **PERF-07**: Paginação real em products/list
- [ ] **PERF-08**: Cache headers em API routes
- [ ] **PERF-09**: Otimizar layout client component (server wrapper + client islands)
- [ ] **DUP-01**: Centralizar funções utilitárias (ensureArray, cleanString, etc.)
- [ ] **DUP-02**: Unificar financeiro contas-pagar/contas-receber
- [ ] **DUP-03**: Unificar suppliers/customers (ContactEntity)
- [ ] **API-01**: Adicionar Zod schemas nas 74 rotas sem validação
- [ ] **API-02**: Padronizar error handling (catch unknown + apiError helper)
- [ ] **API-03**: Substituir 189 console.log por logger estruturado (pino)
- [ ] **TYPE-01**: Criar interfaces tipadas para XML parsed (NFeXml, CTeXml, NFSeXml)
- [ ] **TYPE-02**: Tipar funções de parsing (parse-invoice-xml, pdf route)
- [ ] **TYPE-03**: Eliminar 200+ usos de `any`
- [ ] **SPLIT-01**: Split produtos page (3609 linhas → componentes)
- [ ] **SPLIT-02**: Split PDF route (2291 → módulos)
- [ ] **SPLIT-03**: Split modals SupplierDetails/CustomerDetails
- [ ] **SPLIT-04**: Split settings, financeiro, local-xml-sync
- [ ] **UPG-01**: Next.js 14 → 15 (4 CVEs)
- [ ] **UPG-02**: React 18 → 19
- [ ] **UPG-03**: Prisma 5 → 7
- [ ] **UPG-04**: ESLint 8 → 9+ (flat config)
- [ ] **UPG-05**: Minor upgrades (bcryptjs, zod, typescript)

### Out of Scope

- Novas funcionalidades de negócio — este milestone é exclusivamente correção/hardening
- Tailwind 3→4 — rewrite muito grande, avaliar em milestone separado
- Migração de banco de dados — usar apenas `prisma db push`, nunca `migrate dev`
- Redesign de UI — manter visual atual, apenas refatorar código

## Context

- **Produção ativa**: app.qlmed.com.br com usuários reais
- **DB compartilhado**: dev e produção usam o mesmo PostgreSQL — cuidado extremo com schema changes
- **4 audits realizados** (2026-04-10): Security, Dependencies, Tech Debt, Performance
- **Vulnerabilidades críticas**: node-forge (assinatura NF-e), PINs hardcoded, zero rate limiting
- **Performance**: rotas carregam xmlContent completo (50-200KB/invoice) para extrair dados via regex em runtime
- **Tech debt**: 200+ `any`, 7 funções duplicadas 3-7x, 10 arquivos >1000 linhas, contas-pagar/receber 100% duplicados
- **PINs são padrão da empresa** — manter funcionalidade, proteger implementação

## Constraints

- **DB compartilhado**: Dev/prod usam mesmo PostgreSQL. Nunca `prisma migrate dev`. Apenas `prisma db push` após review.
- **Zero downtime**: App em produção com usuários. Cada fase deve ser deployável independentemente.
- **Node 22**: Host usa nvm com Node 22. Docker usa Alpine.
- **Coolify**: Reverse proxy e SSL gerenciados pelo Coolify — não mexer em container names.
- **Deploy**: Via GitHub Actions workflow_dispatch. Rollback disponível.
- **Assinaturas NF-e**: node-forge é usado para certificados digitais A1 — testar cuidadosamente após update.

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Manter PINs como login | Padrão da empresa, todos os usuários usam | — Pending |
| Mover PINs para env var | Proteger contra leak de código-fonte | — Pending |
| Substituir xlsx por exceljs | xlsx é abandonware com prototype pollution sem fix | — Pending |
| Persistir dados XML na ingestão | Eliminar parsing runtime que carrega 100MB+ por request | — Pending |
| Não migrar Tailwind 3→4 | Rewrite muito grande, baixo ROI para este milestone | — Pending |
| .planning/ local-only | Não poluir repositório QLMED com docs de planejamento | ✓ Good |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd:transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd:complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-04-10 after Phase 1 completion*
