import { describe, expect, it } from 'vitest';
import { createParseTrace } from '@/lib/parse-trace';

describe('ParseTrace (Trace-as-State)', () => {
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
      warning: 'Nome ausente no documento',
    });

    builder.warn('Alerta geral');

    const trace = builder.build();

    expect(trace.textLength).toBe(rawText.length);
    expect(trace.lineCount).toBe(3);
    expect(trace.steps).toHaveLength(2);
    expect(trace.matchedCount).toBe(1);
    expect(trace.warnings).toEqual(['Nome ausente no documento', 'Alerta geral']);
  });

  it('handles empty input gracefully', () => {
    const trace = createParseTrace('').build();
    expect(trace.textLength).toBe(0);
    expect(trace.lineCount).toBe(0);
    expect(trace.steps).toEqual([]);
    expect(trace.matchedCount).toBe(0);
    expect(trace.warnings).toEqual([]);
  });
});
