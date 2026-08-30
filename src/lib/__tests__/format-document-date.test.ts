import { describe, expect, it } from 'vitest';
import { formatDocumentDate } from '@/lib/utils';

describe('formatDocumentDate', () => {
  it('mostra 10/08/2023 para a data UTC do ofício 17673', () => {
    expect(formatDocumentDate('2023-08-10T00:00:00.000Z')).toBe('10/08/2023');
  });

  it('não inventa data quando o campo está vazio', () => {
    expect(formatDocumentDate(null)).toBe('—');
    expect(formatDocumentDate(undefined)).toBe('—');
    expect(formatDocumentDate('')).toBe('—');
  });

  it('aceita Date além de ISO string', () => {
    expect(formatDocumentDate(new Date(Date.UTC(2023, 7, 10)))).toBe('10/08/2023');
  });
});
