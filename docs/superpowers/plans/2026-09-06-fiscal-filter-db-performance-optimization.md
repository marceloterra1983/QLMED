# Fiscal Filter & Database Query Performance Optimization

> **Goal:** Eliminate reading and filtering latency across the site by:
> 1. Decoupling blocking OneDrive/XML sync from user `GET /api/invoices` requests.
> 2. Adding targeted PostgreSQL indexes for invoice numbers, recipient names, and compound CFOP/date queries.
> 3. Eliminating redundant `count(*)` queries when results fit in the first page.
> 4. Optimizing XML content search so pure-numeric/document queries avoid 500 MB TOAST scans.
> 5. Caching contact nicknames in the frontend and adding `AbortController` to prevent concurrent request congestion.

---

### Task 1: Non-Blocking Background Sync on `GET /api/invoices`
- **Target:** `src/app/api/invoices/route.ts`
- **Change:** Replace `await ensureLocalXmlSyncNow()` with non-blocking `void ensureLocalXmlSyncNow().catch(...)`.
- **Impact:** Eliminates 2 to 6 seconds of OneDrive / Graph API network delay from user filter requests.

### Task 2: Targeted PostgreSQL Indexes & Migration Window
- **Target:** `prisma/schema.prisma` and `prisma/migrations/20260906230000_invoice_query_performance_indexes/migration.sql`
- **New Indexes:**
  - `Invoice_number_idx` ON `"Invoice"("number")`
  - `Invoice_companyId_number_idx` ON `"Invoice"("companyId", "number")`
  - `Invoice_recipientName_idx` ON `"Invoice"("recipientName")`
  - `Invoice_companyId_recipientName_idx` ON `"Invoice"("companyId", "recipientName")`
  - `Invoice_companyId_type_direction_cfop_issueDate_idx` ON `"Invoice"("companyId", "type", "direction", "cfop", "issueDate")`
- **Contract:** Register migration in `scripts/verify-production-migration-window.cjs` with exact SHA-256 digest.

### Task 3: Database Query Optimization
- **Target:** `src/app/api/invoices/route.ts` and `src/lib/nfe/search-engine.ts`
- **Eliminate Redundant Count:**
  - If `page === 1` and `invoices.length < limit`: `total = invoices.length` without firing a second `prisma.invoice.count` query.
- **Smart XML Search Filter:**
  - Skip `xmlContent` ILIKE scan when query tokens are purely numeric / document numbers.
- **Unit Tests:**
  - Update `src/lib/__tests__/nfe-search-engine.test.ts`.

### Task 4: Frontend Nickname Cache & Request Cancellation
- **Target:** `src/app/(painel)/fiscal/issued/page-client.tsx`
- **Nickname Cache:**
  - Only query `/api/contacts/nickname/batch` for CNPJs not already stored in state.
- **AbortController:**
  - Cancel previous in-flight requests when filters change rapidly.

### Task 5: CI Validation, PR & Deployment
- Verify all CI gates (`Typecheck`, `Lint`, `UI tokens`, `Test`, `Build`).
- Open PR, monitor CI, and merge.
