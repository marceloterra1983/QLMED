# NF-e Search Engine Modernization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Overhaul the search method for issued invoices (NF-e Emitidas), fixing accent mismatches in PostgreSQL, unmasking CNPJ/CPF and 44-digit access keys, stripping noise words (NF, Dr.), supporting product/item text in XML, currency amounts, and upgrading UI/UX.

**Architecture:** 
- `src/lib/nfe/search-engine.ts` provides pure tokenization, Portuguese accent variant expansion, and Prisma search query construction.
- `src/app/api/invoices/route.ts` integrates the new search engine to resolve search across `recipientName`, `patientName`, `convenioName`, `doctorName`, `number`, `accessKey`, `recipientCnpj`, `xmlContent` (products), and `totalValue`.
- `src/app/(painel)/fiscal/issued/page-client.tsx` updates UI with modern labels, inline clear button, and cross-year fallback when year filter returns zero results.

**Tech Stack:** TypeScript, Vitest, Prisma, Next.js, Tailwind CSS.

---

### Task 1: Core Search Tokenizer & Accent Variant Engine

**Files:**
- Create: `src/lib/nfe/search-engine.ts`
- Test: `src/lib/__tests__/nfe-search-engine.test.ts`

**Interfaces:**
- Consumes: Raw search string.
- Produces: `expandAccentVariants(term: string): string[]`, `tokenizeInvoiceSearch(search: string): ParsedSearchCriteria`, `buildInvoiceSearchConditions(criteria: ParsedSearchCriteria, nicknameCnpjs?: string[]): Record<string, unknown>`.

- [x] **Step 1: Write comprehensive unit tests for tokenizer, accent expansion, and document/number detection**
- [x] **Step 2: Implement `src/lib/nfe/search-engine.ts`**
- [x] **Step 3: Run unit tests to verify 100% pass**
- [x] **Step 4: Commit Task 1**

---

### Task 2: Backend Integration in `/api/invoices`

**Files:**
- Modify: `src/app/api/invoices/route.ts`
- Test: `src/lib/__tests__/nfe-search-engine.test.ts`

**Interfaces:**
- Consumes: `tokenizeInvoiceSearch`, `buildInvoiceSearchConditions` from `src/lib/nfe/search-engine.ts`.
- Produces: Enhanced search response supporting accents, masked documents, numbers without leading zeros, products, and values.

- [x] **Step 1: Wire search engine into `src/app/api/invoices/route.ts`**
- [x] **Step 2: Test edge cases (accents, CNPJ with dots, NF prefix, Dr. prefix, products, values)**
- [x] **Step 3: Commit Task 2**

---

### Task 3: UI & UX Enhancements in NF-e Emitidas

**Files:**
- Modify: `src/app/(painel)/fiscal/issued/page-client.tsx`

**Interfaces:**
- Consumes: Enhanced `/api/invoices?search=...`.
- Produces: Polished search input with inline clear button (`X`), descriptive label/placeholder, and "Buscar em todos os anos" prompt when year filter restricts results.

- [x] **Step 1: Update input label, placeholder, and add inline clear icon**
- [x] **Step 2: Add cross-year search recommendation when filtered year has 0 results**
- [x] **Step 3: Verify build and components**
- [x] **Step 4: Commit Task 3**

---

### Task 4: Full CI Validation, PR Creation, and Merge

- [ ] **Step 1: Create git branch `feat/nfe-search-engine-overhaul`**
- [ ] **Step 2: Push to origin and open Pull Request**
- [ ] **Step 3: Monitor CI gates (types, lint, unit tests, E2E, build)**
- [ ] **Step 4: Merge PR into main**
