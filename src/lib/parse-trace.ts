/**
 * Trace-as-State (Paper #8): Observable intermediate parsing state and diagnostics.
 * Records the extraction progression of each field, matched confidence, regex snippet,
 * and parsing warnings without modifying core database storage schemas.
 */

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
    this.textLength = text ? text.length : 0;
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
