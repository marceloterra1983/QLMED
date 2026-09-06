# Wave 6: Trace-as-State, Unified HTTP Resilience, and ADRs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement Paper #8 (Trace-as-State) diagnostics in operator parsers, Paper #5 (CORAL / Bounded Resilience) with unified retry/jitter across external HTTP adapters, and formalize ADRs 0014-0018 for architectural governance.

**Architecture:** 
- `ParseTrace` provides an observable intermediate diagnostics record attached to operator parsing passes without altering existing schema types.
- `src/lib/resilience.ts` provides a zero-dependency retry & exponential jitter backoff engine honoring `Retry-After` headers and transient status codes, injected into WhatsApp Evolution and Microsoft Graph clients.
- Formal ADRs in `docs/decisions/` capture Waves 1 to 6 architectural decisions.

**Tech Stack:** TypeScript, Vitest, Next.js, Node.js fetch & AbortSignal.

**Spec:** DAIR.AI Top AI Papers (Paper #5 CORAL, Paper #8 Trace-as-State) & Matt Pocock Codebase Design Principles.

## Global Constraints

- 100% backward compatible: existing return fields on `ParsedCassemsOficio` and `ParsedImpcgOficio` must remain unchanged.
- Pure functions & zero external network dependencies in unit tests.
- Zero external runtime dependencies added (standard `fetch`, `AbortSignal`, `node:crypto` or `Math.random` jitter).
- Strict typing with TypeScript 5.

---

### Task 1: ParseTrace Core Engine & Value Objects

**Files:**
- Create: `src/lib/parse-trace.ts`
- Test: `src/lib/__tests__/parse-trace.test.ts`

**Interfaces:**
- Consumes: Raw text and extraction events.
- Produces: `ParseTrace`, `ParseTraceStep`, `createParseTrace(text: string): ParseTraceBuilder`.

- [ ] **Step 1: Write the failing test for ParseTrace**

```typescript
// src/lib/__tests__/parse-trace.test.ts
import { describe, expect, it } from 'vitest';
import { createParseTrace } from '@/lib/parse-trace';

describe('ParseTrace', () => {
  it('records extraction steps, warnings, and summary statistics', () => {
    const rawText = 'Linha 1\nLinha 2\nLinha 3';
    const builder = createParseTrace(rawText);

    builder.step({
      field: 'oficioNumber',
      matched: true,
      source: 'document',
      rawSnippet: '123456',
    });

    builder.step({
      field: 'patientName',
      matched: false,
      source: 'unmatched',
      warning: 'Nome ausente',
    });

    const trace = builder.build();

    expect(trace.textLength).toBe(rawText.length);
    expect(trace.lineCount).toBe(3);
    expect(trace.steps).toHaveLength(2);
    expect(trace.matchedCount).toBe(1);
    expect(trace.warnings).toEqual(['Nome ausente']);
  });
});
```

- [ ] **Step 2: Implement minimal ParseTrace builder in `src/lib/parse-trace.ts`**

```typescript
// src/lib/parse-trace.ts
export type ParseTraceSource = 'document' | 'subject' | 'fallback' | 'unmatched';

export type ParseTraceStep = {
  field: string;
  matched: boolean;
  source: ParseTraceSource;
  rawSnippet?: string;
  warning?: string;
};

export type ParseTrace = {
  textLength: number;
  lineCount: number;
  steps: ParseTraceStep[];
  matchedCount: number;
  warnings: string[];
};

export class ParseTraceBuilder {
  private readonly textLength: number;
  private readonly lineCount: number;
  private readonly steps: ParseTraceStep[] = [];
  private readonly warnings: string[] = [];

  constructor(text: string) {
    this.textLength = text.length;
    this.lineCount = text ? text.split(/\r?\n/).length : 0;
  }

  step(entry: ParseTraceStep): this {
    this.steps.push(entry);
    if (entry.warning) {
      this.warnings.push(entry.warning);
    }
    return this;
  }

  warn(warning: string): this {
    this.warnings.push(warning);
    return this;
  }

  build(): ParseTrace {
    const matchedCount = this.steps.filter((s) => s.matched).length;
    return {
      textLength: this.textLength,
      lineCount: this.lineCount,
      steps: [...this.steps],
      matchedCount,
      warnings: [...this.warnings],
    };
  }
}

export function createParseTrace(text: string): ParseTraceBuilder {
  return new ParseTraceBuilder(text);
}
```

- [ ] **Step 3: Run unit tests and commit**

---

### Task 2: Attach Trace-as-State to Cassems and IMPCG Parsers

**Files:**
- Modify: `src/lib/cassems/parse-oficio.ts`
- Modify: `src/lib/impcg/parse-oficio.ts`
- Test: `src/lib/__tests__/cassems-parse-oficio.test.ts`
- Test: `src/lib/__tests__/impcg-parse-oficio.test.ts`

**Interfaces:**
- Consumes: `createParseTrace` from `src/lib/parse-trace`.
- Produces: `trace: ParseTrace` on `ParsedCassemsOficio` and `ParsedImpcgOficio`.

- [ ] **Step 1: Update Cassems and IMPCG type definitions with optional/populated `trace?: ParseTrace`**
- [ ] **Step 2: Populate trace steps during `parseOficio` in both modules**
- [ ] **Step 3: Verify existing tests pass and add assertions verifying `trace` structure and warnings**
- [ ] **Step 4: Commit changes**

---

### Task 3: Unified HTTP Resilience Engine

**Files:**
- Create: `src/lib/resilience.ts`
- Test: `src/lib/__tests__/resilience.test.ts`

**Interfaces:**
- Consumes: Functions returning promises, or fetch requests.
- Produces: `executeWithRetry<T>(fn, options)`, `fetchWithResilience(url, init, options)`, `parseRetryAfterHeader`.

- [ ] **Step 1: Write unit tests covering retries, exponential backoff with jitter, Retry-After header, and non-retryable errors**
- [ ] **Step 2: Implement `src/lib/resilience.ts` with typed options and default retry on 429, 502, 503, 504, and network errors**
- [ ] **Step 3: Run tests and verify 100% pass rate**
- [ ] **Step 4: Commit changes**

---

### Task 4: Integrate Resilience into WhatsApp Evolution and Graph Mail Client

**Files:**
- Modify: `src/lib/whatsapp-evolution.ts`
- Modify: `src/lib/graph-mail-client.ts`
- Test: `src/lib/__tests__/whatsapp-evolution-egress.test.ts`
- Test: `src/lib/__tests__/graph-mail-attachment-cap.test.ts`

**Interfaces:**
- Consumes: `fetchWithResilience` from `src/lib/resilience`.
- Produces: Resilient network requests against external APIs.

- [ ] **Step 1: Update `sendWhatsAppDocument` and `sendWhatsAppText` in `src/lib/whatsapp-evolution.ts` to use `fetchWithResilience`**
- [ ] **Step 2: Update `graphJson` in `src/lib/graph-mail-client.ts` to retry transient 429 and 503 errors**
- [ ] **Step 3: Run test suite to verify no regressions**
- [ ] **Step 4: Commit changes**

---

### Task 5: Formalize Architecture Decision Records (ADRs 0014-0018)

**Files:**
- Modify: `docs/decisions/0014-retencao-de-dado-operacional.md` (Update status to accepted, record Wave 5 activation)
- Create: `docs/decisions/0015-ports-and-adapters-messaging.md`
- Create: `docs/decisions/0016-functional-error-handling-neverthrow.md`
- Create: `docs/decisions/0017-graceful-lifecycle-supervisor.md`
- Create: `docs/decisions/0018-trace-as-state-parsers-and-resilience.md`
- Modify: `docs/decisions/README.md`

- [ ] **Step 1: Draft each ADR adhering to repository format**
- [ ] **Step 2: Index new ADRs in `docs/decisions/README.md`**
- [ ] **Step 3: Commit ADRs**
