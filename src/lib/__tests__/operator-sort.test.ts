import { describe, expect, it } from 'vitest';
import { sortOperatorListItems } from '@/lib/operator-sort';

describe('operator-sort', () => {
  it('ordena itens decrescente por issuedAt', () => {
    const items = [
      { oficioNumber: '1', issuedAt: '2026-08-01' },
      { oficioNumber: '2', issuedAt: '2026-09-01' },
      { oficioNumber: '3', issuedAt: '2026-07-01' },
    ];

    const sorted = sortOperatorListItems(items);
    expect(sorted.map((i) => i.oficioNumber)).toEqual(['2', '1', '3']);
  });

  it('desempata decrescente por número de ofício numérico natural quando datas são iguais', () => {
    const items = [
      { oficioNumber: '2', issuedAt: '2026-09-01' },
      { oficioNumber: '10', issuedAt: '2026-09-01' },
      { oficioNumber: '1', issuedAt: '2026-09-01' },
    ];

    const sorted = sortOperatorListItems(items);
    expect(sorted.map((i) => i.oficioNumber)).toEqual(['10', '2', '1']);
  });

  it('posiciona datas nulas ao final da lista', () => {
    const items = [
      { oficioNumber: '1', issuedAt: null },
      { oficioNumber: '2', issuedAt: '2026-09-01' },
    ];

    const sorted = sortOperatorListItems(items);
    expect(sorted[0].oficioNumber).toBe('2');
    expect(sorted[1].oficioNumber).toBe('1');
  });
});
