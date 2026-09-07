# SOTA Performance Architecture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform the performance of `/fiscal/issued` and the entire QLMED invoice query and polling pipeline into State of the Art (SOTA), eliminating 33.6 GB/day of redundant polling data, removing TOAST sequential scans, memoizing grid highlights, and hardening Prisma 7 connection pooling.

**Architecture:** A 4-pillar architectural refactor validated by empirical research (Grok 4.6 xhigh + PostgreSQL 16/Next.js 15 primary sources):
1. **Lightweight Watermark Polling:** Replace blind 5,000-row polling every 30s with a sub-2ms index-only watermark query (`SELECT max("updatedAt"), count(*)`) returning HTTP 304 Not Modified.
2. **Elimination of XML TOAST Scans:** Remove `xmlContent` from `WHERE` clauses in list routes (`searchXmlContent: false`), reserving XML decompression only for document download/DANFE.
3. **Regex & Highlight Hoisting:** Cache compiled search regexes and token expansions in `<Highlight>` so 2,400 cells/render don't freeze the main thread.
4. **Prisma 7 Connection Pool Hardening:** Explicit `pg.Pool` configuration with `max: 8`, `connectionTimeoutMillis: 5000` (eliminating infinite wait hangs), and `idleTimeoutMillis: 30000`.

**Tech Stack:** Next.js 15 (App Router), React 19, Prisma 7 (`@prisma/adapter-pg`), PostgreSQL 16, TypeScript, Vitest.

**Spec:** Validated findings from `task-4010` (Grok 4.6 SOTA research) and PostgreSQL 16 documentation (§ 24.2.2.4 & GIN-tips).

## Global Constraints
- Preserve all existing business logic and contracts in `/fiscal/issued`.
- Strictly adhere to UI token requirements (no custom rounded utilities, only `rounded-lg`, `rounded-xl`, `rounded-full`).
- No new external dependencies (YAGNI / Ponytail principle).
- Zero regression in search accuracy: all structured columns (`number`, `recipientName`, `patientName`, `doctorName`, `convenioName`, `senderName`, `accessKey`, and contact nicknames) remain fully searchable.

---

### Task 1: Eliminate XML TOAST Scans in List Query
**Files:**
- Modify: `src/app/api/invoices/route.ts:284-290`
- Test: `tests/unit/api/invoices-search-xml-flag.test.ts`

**Interfaces:**
- Consumes: `buildInvoiceSearchConditions` from `@/lib/nfe/search-engine`
- Produces: `GET /api/invoices` without `xmlContent` in search `WHERE` clause for list views.

- [ ] **Step 1: Write the test verifying `searchXmlContent: false` in list queries**
```typescript
import { describe, it, expect } from 'vitest';
import { buildInvoiceSearchConditions, tokenizeInvoiceSearch } from '@/lib/nfe/search-engine';

describe('Invoice List Search Condition Optimization', () => {
  it('does not include xmlContent when searchXmlContent is false', () => {
    const criteria = tokenizeInvoiceSearch('hospital unimed');
    const conditions = buildInvoiceSearchConditions(criteria, { searchXmlContent: false });
    const jsonStr = JSON.stringify(conditions);
    expect(jsonStr).not.toContain('xmlContent');
  });
});
```

- [ ] **Step 2: Run test to verify it passes**
Run: `npm test tests/unit/api/invoices-search-xml-flag.test.ts`
Expected: PASS

- [ ] **Step 3: Modify `src/app/api/invoices/route.ts`**
Change `searchXmlContent: true` to `searchXmlContent: false` on line 287 of `src/app/api/invoices/route.ts`.

- [ ] **Step 4: Verify full test suite passes**
Run: `npm test`
Expected: PASS

- [ ] **Step 5: Commit**
```bash
git add src/app/api/invoices/route.ts tests/unit/api/invoices-search-xml-flag.test.ts
git commit -m "perf(invoices): disable xmlContent search in list query to eliminate TOAST seq-scan"
```

---

### Task 2: Create Lightweight Watermark Endpoint (`GET /api/invoices/watermark`)
**Files:**
- Create: `src/app/api/invoices/watermark/route.ts`
- Test: `tests/unit/api/invoices-watermark.test.ts`

**Interfaces:**
- Consumes: `prisma.invoice` and query parameters `companyId`, `type`, `direction`, `dateFrom`, `dateTo`.
- Produces: `GET /api/invoices/watermark` returning `304 Not Modified` with ETag or `{ changed: true, updatedAt, count }`.

- [ ] **Step 1: Write test for watermark ETag & 304 response**
Test that given matching `If-None-Match`, the handler returns 304 without body.

- [ ] **Step 2: Run test to verify it fails**
Expected: FAIL (file not found)

- [ ] **Step 3: Implement `src/app/api/invoices/watermark/route.ts`**
```typescript
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth, unauthorizedResponse, forbiddenResponse } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { getOrCreateSingleCompany } from '@/lib/single-company';

const watermarkQuerySchema = z.object({
  type: z.enum(['NFE', 'CTE', 'NFSE', '']).catch(''),
  direction: z.enum(['received', 'issued', '']).catch(''),
  dateFrom: z.string().max(10).catch(''),
  dateTo: z.string().max(10).catch(''),
});

export async function GET(req: Request) {
  try {
    let userId: string;
    try {
      userId = await requireAuth({ apiKeyScope: 'invoices:read' });
    } catch (e) {
      if (e instanceof Error && e.message === 'FORBIDDEN') return forbiddenResponse();
      return unauthorizedResponse();
    }
    const company = await getOrCreateSingleCompany(userId);
    const { searchParams } = new URL(req.url);
    const params = watermarkQuerySchema.parse({
      type: searchParams.get('type') ?? undefined,
      direction: searchParams.get('direction') ?? undefined,
      dateFrom: searchParams.get('dateFrom') || '',
      dateTo: searchParams.get('dateTo') || '',
    });

    const where: Record<string, unknown> = { companyId: company.id };
    if (params.type) where.type = params.type;
    if (params.direction) where.direction = params.direction;
    if (params.dateFrom || params.dateTo) {
      const issueDate: Record<string, Date> = {};
      if (params.dateFrom) issueDate.gte = new Date(params.dateFrom + 'T00:00:00.000Z');
      if (params.dateTo) issueDate.lte = new Date(params.dateTo + 'T23:59:59.999Z');
      where.issueDate = issueDate;
    }

    const [aggregate, count] = await Promise.all([
      prisma.invoice.aggregate({
        where,
        _max: { updatedAt: true },
      }),
      prisma.invoice.count({ where }),
    ]);

    const maxUpdatedAt = aggregate._max.updatedAt?.getTime() ?? 0;
    const etag = `W/"${maxUpdatedAt}-${count}"`;
    const ifNoneMatch = req.headers.get('if-none-match');

    if (ifNoneMatch === etag) {
      return new Response(null, {
        status: 304,
        headers: {
          ETag: etag,
          'Cache-Control': 'private, no-cache',
        },
      });
    }

    return NextResponse.json(
      { changed: true, updatedAt: aggregate._max.updatedAt, count },
      {
        headers: {
          ETag: etag,
          'Cache-Control': 'private, no-cache',
        },
      }
    );
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
```

- [ ] **Step 4: Run test to verify it passes**
Run: `npm test tests/unit/api/invoices-watermark.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**
```bash
git add src/app/api/invoices/watermark/route.ts tests/unit/api/invoices-watermark.test.ts
git commit -m "feat(api): add lightweight invoice watermark endpoint with ETag/304 support"
```

---

### Task 3: Integrate Watermark Polling in `/fiscal/issued`
**Files:**
- Modify: `src/app/(painel)/fiscal/issued/page-client.tsx:104-111`
- Test: Manual / component tests

**Interfaces:**
- Consumes: `/api/invoices/watermark`
- Produces: Polling every 30s checks watermark first; skips full 5,000-row payload when data is unchanged.

- [ ] **Step 1: Update `page-client.tsx` to store watermark ETag in ref**
Add `watermarkEtagRef = useRef<string | null>(null)`.

- [ ] **Step 2: Update 30s polling effect**
Replace blind `loadInvoices({ silent: true })` with watermark check:
```typescript
  useEffect(() => {
    const timer = setInterval(async () => {
      // If user is searching or viewing a single year, query watermark for that slice
      const query = new URLSearchParams();
      if (dateFrom) query.set('dateFrom', dateFrom);
      if (dateTo) query.set('dateTo', dateTo);
      query.set('type', 'NFE');
      query.set('direction', 'issued');

      try {
        const headers: HeadersInit = {};
        if (watermarkEtagRef.current) {
          headers['If-None-Match'] = watermarkEtagRef.current;
        }
        const res = await fetch(`/api/invoices/watermark?${query.toString()}`, {
          cache: 'no-store',
          headers,
        });

        if (res.status === 304) {
          // Unchanged - zero bandwidth, zero re-render!
          return;
        }

        if (res.ok) {
          watermarkEtagRef.current = res.headers.get('etag');
          const data = await res.json();
          if (data.changed) {
            loadInvoices({ silent: true });
          }
        }
      } catch {
        // Silent catch on poll
      }
    }, AUTO_REFRESH_MS);
    return () => clearInterval(timer);
  }, [dateFrom, dateTo]);
```

- [ ] **Step 3: Verify tests and types**
Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 4: Commit**
```bash
git add src/app/\(painel\)/fiscal/issued/page-client.tsx
git commit -m "perf(fiscal): replace blind 5k invoice polling with 304 watermark check"
```

---

### Task 4: Memoize Search Regex in `<Highlight>` Component
**Files:**
- Modify: `src/components/ui/Highlight.tsx`
- Test: `tests/unit/components/highlight-memo.test.ts`

**Interfaces:**
- Consumes: `text`, `query`, `className`
- Produces: Fast cell rendering by reusing compiled `RegExp` pattern from a shared module-level cache for identical queries.

- [ ] **Step 1: Write test verifying Highlight handles special characters, accents, and produces correct marks**

- [ ] **Step 2: Implement regex compilation cache in `Highlight.tsx`**
```typescript
const regexPatternCache = new Map<string, RegExp | null>();

function getCompiledPattern(query: string): RegExp | null {
  const trimmed = query.trim();
  if (!trimmed) return null;
  const cached = regexPatternCache.get(trimmed);
  if (cached !== undefined) return cached;

  const criteria = tokenizeInvoiceSearch(trimmed);
  const words = criteria.tokens.length > 0 ? criteria.tokens : [trimmed];
  const variants = Array.from(
    new Set(
      words
        .flatMap(expandAccentVariants)
        .filter((w) => w.length >= 2),
    ),
  );

  const rawDigits = trimmed.replace(/\D/g, '');
  if (rawDigits.length >= 2 && !variants.includes(rawDigits)) {
    variants.push(rawDigits);
    const unpadded = rawDigits.replace(/^0+/, '');
    if (unpadded.length >= 2 && !variants.includes(unpadded)) {
      variants.push(unpadded);
    }
  }

  if (variants.length === 0) {
    regexPatternCache.set(trimmed, null);
    return null;
  }

  variants.sort((a, b) => b.length - a.length);
  // Cap cache size to avoid memory leak
  if (regexPatternCache.size > 50) regexPatternCache.clear();

  const pattern = new RegExp(`(${variants.map(escapeRegExp).join('|')})`, 'gi');
  regexPatternCache.set(trimmed, pattern);
  return pattern;
}
```
In `Highlight`:
```typescript
  const pattern = getCompiledPattern(query);
  if (!pattern) return <span className={className}>{text}</span>;
  // Use pattern.source to create isolated instance with zero regex compilation overhead
  const localRe = new RegExp(pattern.source, 'gi');
  const parts = text.split(localRe);
```

- [ ] **Step 3: Run unit tests**
Run: `npm test tests/unit/components/highlight-memo.test.ts`
Expected: PASS

- [ ] **Step 4: Commit**
```bash
git add src/components/ui/Highlight.tsx tests/unit/components/highlight-memo.test.ts
git commit -m "perf(ui): memoize regex compilation in Highlight component across grid cells"
```

---

### Task 5: Harden Prisma 7 Connection Pool Settings
**Files:**
- Modify: `src/lib/prisma.ts`
- Test: `tests/unit/lib/prisma-pool-config.test.ts`

**Interfaces:**
- Consumes: `getCanonicalDatabaseUrl()`
- Produces: `PrismaPg` configured with explicit timeouts: `max: 8`, `connectionTimeoutMillis: 5000`, `idleTimeoutMillis: 30000`, `keepAlive: true`.

- [ ] **Step 1: Write test verifying pool config values**

- [ ] **Step 2: Update `src/lib/prisma.ts`**
```typescript
function createPrismaClient(): PrismaClient {
  const connectionString = getCanonicalDatabaseUrl();
  const adapter = new PrismaPg(
    {
      connectionString,
      max: 8,
      connectionTimeoutMillis: 5000,
      idleTimeoutMillis: 30000,
      keepAlive: true,
      application_name: 'qlmed-web',
    },
    {
      onPoolError: (err) => {
        log.error({ err }, 'Prisma PostgreSQL pool error');
      },
    }
  );
  return new PrismaClient({ adapter });
}
```

- [ ] **Step 3: Run typecheck and existing tests**
Run: `npm run typecheck && npm test`
Expected: PASS

- [ ] **Step 4: Commit**
```bash
git add src/lib/prisma.ts tests/unit/lib/prisma-pool-config.test.ts
git commit -m "perf(prisma): configure explicit connection pool with 5s timeout and keepalive"
```

---

### Task 6: Database Index Migration for Watermark Query
**Files:**
- Create: `prisma/migrations/20260907030000_invoice_watermark_idx/migration.sql`
- Modify: `scripts/verify-production-migration-window.cjs`

**SQL:**
```sql
CREATE INDEX IF NOT EXISTS "Invoice_company_type_dir_updated_idx"
  ON "Invoice" ("companyId", "type", "direction", "updatedAt" DESC);
```

- [ ] **Step 1: Create migration file**
- [ ] **Step 2: Register SHA-256 in verify-production-migration-window.cjs**
- [ ] **Step 3: Run verification script**
Run: `node scripts/verify-production-migration-window.cjs`
Expected: PASS

- [ ] **Step 4: Commit**
```bash
git add prisma/migrations/20260907030000_invoice_watermark_idx scripts/verify-production-migration-window.cjs
git commit -m "feat(db): add index on Invoice(companyId, type, direction, updatedAt DESC) for watermark"
```
