import { describe, expect, it } from 'vitest';
import { formatQuoteNumber, lineTotalOf, quoteTotalsOf, todayYmd, unknownProductIds } from '../orcamentos/totals';

describe('SPEC-085 — totais Decimal do orçamento', () => {
  it('1 UN a 3800.00 sem desconto e frete 0 totaliza 3800.00', () => {
    const totals = quoteTotalsOf([{ quantity: '1', unitPrice: '3800.00' }], '0');
    expect(totals.subtotal.toFixed(2)).toBe('3800.00');
    expect(totals.total.toFixed(2)).toBe('3800.00');
    expect(totals.lineTotals[0].toFixed(2)).toBe('3800.00');
  });

  it('arredonda half-up e soma linhas sem IEEE-754', () => {
    const totals = quoteTotalsOf([
      { quantity: '1', unitPrice: '0.015' },
      { quantity: '1', unitPrice: '0.015' },
    ]);
    expect(totals.lineTotals.map((v) => v.toFixed(2))).toEqual(['0.02', '0.02']);
    expect(totals.subtotal.toFixed(2)).toBe('0.04');
  });

  it('desconto em valor reduz a linha e recusa desconto maior que o bruto', () => {
    expect(lineTotalOf({ quantity: 2, unitPrice: '10.00', discount: '1.50' }).toFixed(2)).toBe('18.50');
    expect(() => lineTotalOf({ quantity: 1, unitPrice: '10.00', discount: '10.01' })).toThrow(/Desconto/);
  });

  it('recusa quantidade ≤ 0 e lista vazia', () => {
    expect(() => lineTotalOf({ quantity: 0, unitPrice: '10' })).toThrow(/Quantidade/);
    expect(() => quoteTotalsOf([])).toThrow(/item/);
  });

  it('formata o número com 8 dígitos', () => {
    expect(formatQuoteNumber(8318)).toBe('00008318');
    expect(() => formatQuoteNumber(0)).toThrow();
  });

  it('todayYmd devolve YYYY-MM-DD civil em America/Sao_Paulo', () => {
    expect(todayYmd(new Date('2026-09-21T02:30:00.000Z'))).toBe('2026-09-20');
    expect(todayYmd(new Date('2026-09-21T12:00:00.000Z'))).toBe('2026-09-21');
  });

  it('unknownProductIds recusa IDs que a empresa não possui', () => {
    expect(unknownProductIds(['a', 'b'], ['a', 'b', null])).toEqual([]);
    expect(unknownProductIds(['a'], ['a', 'foreign', 'foreign'])).toEqual(['foreign']);
  });
});
