# NF-e Search Relevance Ranking, Highlighting, and Cross-Year Discovery

> **Goal:** Enhance issued invoices search so that:
> 1. Invoices closest to the search term (exact numbers, exact names, prefix matches) appear at the top via a relevance scoring engine.
> 2. Matched terms are visually highlighted with contrast-safe markers in table and card views, including matched product descriptions from XML.
> 3. Active searches automatically search across all historical years without requiring users to switch years manually, displaying older results directly on the front page with visible year indicators.

---

### Task 1: Relevancy Scoring & Product Snippet Extractor
- Enhance `src/lib/nfe/search-engine.ts`:
  - `scoreInvoiceRelevance(invoice: Partial<Invoice>, criteria: ParsedSearchCriteria): number`
  - `extractMatchedProductSnippet(xmlContent: string | null | undefined, tokens: string[]): string | null`
  - `sortInvoicesByRelevance(invoices: Invoice[], search: string): Invoice[]`
- Add unit tests in `src/lib/__tests__/nfe-search-engine.test.ts`.

### Task 2: Accessible Design-Compliant `<Highlight />` Component
- Create `src/components/ui/Highlight.tsx`:
  - Token/accent aware highlighting without XSS risks.
  - Safe contrast in both light mode and dark mode (`bg-amber-100 dark:bg-amber-900/40 text-slate-900 dark:text-slate-100`).
  - Unit test in `src/components/ui/__tests__/Highlight.test.tsx`.

### Task 3: Automatic Cross-Year Search & Search Mode UI
- Update `src/app/(painel)/fiscal/issued/page-client.tsx`:
  - When `search` is populated, automatically search all years without applying `dateFrom`/`dateTo` year restrictions.
  - Rank results with `sortInvoicesByRelevance`.
  - When searching, render flat relevance-ranked view with complete emission dates (`DD/MM/AAAA HH:mm`), `<Highlight />` on number, recipient, patient, and doctor, and a badge for product matches.
  - When search is cleared, restore standard chronological grouped view.

### Task 4: Full CI Validation, PR Creation, and Merge
- Run unit tests and UI token audits.
- Open PR, watch GitHub Actions until green, squash merge to `main`.
