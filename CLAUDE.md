<!-- GSD:project-start source:PROJECT.md -->
## Project

**QLMED — Sistema Fiscal Brasileiro**

Sistema fiscal/invoice brasileiro (NF-e, CT-e, NFS-e) para gestão de notas fiscais, estoque, financeiro e cadastros. App em produção em https://app.qlmed.com.br.

**Core Value:** Sistema fiscal confiável, seguro e performático para gestão de NF-e/CT-e/NFS-e.

### Constraints

- **DB compartilhado**: Dev/prod usam mesmo PostgreSQL. Nunca `prisma migrate dev`. Apenas `prisma db push` após review.
- **Zero downtime**: App em produção com usuários. Cada mudança deve ser deployável independentemente.
- **Node 22**: Host usa nvm com Node 22. Docker usa Alpine.
- **Coolify**: Reverse proxy e SSL gerenciados pelo Coolify — não mexer em container names.
- **Deploy**: Via GitHub Actions workflow_dispatch. Rollback via `npm run rollback:server`.
- **PINs são padrão da empresa**: PIN login é intencional — nunca remover, apenas proteger.
<!-- GSD:project-end -->

<!-- GSD:stack-start source:STACK.md -->
## Technology Stack

- **Framework**: Next.js 15 (App Router, standalone output)
- **React**: 19
- **Database**: PostgreSQL 18 + Prisma 7 (PrismaPg adapter)
- **Auth**: NextAuth 4
- **Styling**: Tailwind CSS 3 + custom components (sem component library)
- **Validation**: Zod 4 (100% coverage em POST/PUT/PATCH routes)
- **Logging**: Pino (structured, configurável via LOG_LEVEL env var)
- **Icons**: Material Symbols Outlined
- **PDF**: Puppeteer (system Chromium)
- **TypeScript**: 6
- **ESLint**: 9 (flat config)
- **Node**: 22
<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->
## Conventions

### Code Patterns
- **Path alias**: `@/*` maps to `./src/*`
- **Language**: All UI text in Portuguese (pt-BR)
- **Logging**: Use `createLogger('module-name')` from `@/lib/logger` — never `console.log`
- **Error handling**: Use `apiError(e)` from `@/lib/api-error` in catch blocks — never return `e.message` directly
- **Validation**: Use Zod schemas from `@/lib/schemas/` — all POST/PUT/PATCH routes must validate input
- **Catch blocks**: Always `catch (e: unknown)` with `instanceof Error` narrowing — never `catch (e: any)`
- **XML helpers**: Use `val()`, `num()`, `gv()` from `@/lib/xml-helpers` — never inline XML accessors
- **XML types**: Use interfaces from `@/types/nfe-xml.ts`, `cte-xml.ts`, `nfse-xml.ts` — never `any` for XML
- **CNPJ parsing**: Use `parseCnpjResponse()` from `@/lib/cnpj-utils` — never inline
- **IE validation**: Use `validateIEFormat()` from `@/lib/ie-validation` — never inline

### Shared Modules
- `@/lib/financeiro-shared.ts` — parametrized handlers for contas-pagar/contas-receber
- `@/lib/contact-shared.ts` — parametrized list handler for suppliers/customers
- `@/lib/contact-details-shared.ts` — parametrized details handler for suppliers/customers
- `@/lib/cache-headers.ts` — cache profile utility (dashboard 30s, list 10s, lookup 1h)
- `@/lib/rate-limit.ts` — Edge-compatible Map-based sliding window rate limiter
- `@/lib/pdf/` — DANFE, DACTE, NFS-e generators + shared utils/css/types

### Shadow Tables (outside Prisma migrations)
These tables are managed via raw SQL `CREATE TABLE IF NOT EXISTS` in their store modules:
- `product_registry`, `stock_entry`, `nfe_entry_item`, `product_settings_catalog`, `cnpj_cache`, `cnpj_monitoring`, `invoice_duplicata`, `invoice_tax_totals`, `invoice_item_tax`, `contact_fiscal`, `ncm_cache`
- All have `@@ignore` stubs in `prisma/schema.prisma`
- **IMPORTANT**: New shadow tables MUST have backfill wired (lazy on first access or via API endpoint). Existing invoices (18k+) won't populate automatically.
- `invoice_item_tax` columns: `product_code`, `product_description` (NOT product_name/product_unit)

### Page Access Control
- `src/lib/navigation.ts` defines `VALID_PAGE_PATHS` — used by user PATCH API to validate `allowedPages`
- **MUST stay in sync** with `src/components/SidebarNav.tsx` paths — mismatch breaks page customization
- When adding sidebar pages, always add to `PAGE_GROUPS` in navigation.ts

### Prisma 7 Notes
- PrismaClient uses lazy Proxy pattern (`src/lib/prisma.ts`) for Docker build compatibility
- `prisma.config.ts` at project root with dotenv loading and fallback URL
- `prisma` is in prod dependencies (needed for `prisma migrate deploy` in container)
- `Bytes` fields return `Uint8Array` (not `Buffer`) — accept both types
<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->
## Architecture

### Source Layout (`src/`)
- `app/` — Next.js App Router pages and API routes
  - `api/` — 25+ API route groups
  - `(painel)/` — Authenticated panel pages (server layout wrapper + client island)
- `lib/` — Business logic, stores, shared handlers, utilities
  - `schemas/` — Zod validation schemas by domain (common, invoice, financeiro, etc.)
  - `pdf/` — PDF generator modules (danfe, dacte, nfse, utils, css, types)
- `components/` — React components
  - `contact-details/` — Shared supplier/customer modal components
  - `ui/` — Shared UI primitives
- `types/` — TypeScript type definitions (xml-common, nfe-xml, cte-xml, nfse-xml)
- `hooks/` — Custom React hooks

### Key Data Flow
- Invoice XML → `parseInvoiceXml()` → persists Invoice + extracts: city→contact_fiscal, duplicata→invoice_duplicata, items→invoice_item_tax, products→product_registry
- API routes read from materialized tables, NOT from xmlContent at runtime
- Financeiro duplicatas come from `invoice_duplicata` table (lazy backfill on first access if empty)
- `invoice_item_tax` fully backfilled via `/api/invoices/backfill-tax` endpoint

### Auth & Users
- PIN login via `PIN_MAP_JSON` env var — each user has a 6-digit PIN
- JWT cookie persists 7 days per device — users stay logged in
- `allowedPages` controls which sidebar pages each user can access
- Switching users on same browser requires logout first (JWT cookie conflict)
<!-- GSD:architecture-end -->

<!-- GSD:workflow-start source:GSD defaults -->
## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:
- `/gsd:quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd:debug` for investigation and bug fixing
- `/gsd:execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- GSD:workflow-end -->

<!-- GSD:profile-start -->
## Developer Profile

> Profile not yet configured. Run `/gsd:profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- GSD:profile-end -->
