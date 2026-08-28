import { describe, expect, it } from 'vitest';
import {
  formatIssuedSummaryAmountLine,
  formatIssuedSummarySalesHeaderLines,
  isIssuedSaleOperation,
  issuedSummaryValueSuffix,
  summarizeIssuedDailySalesHeader,
} from '@/lib/daily-issued-summary';

describe('issued daily summary suffix', () => {
  it('keeps sale lines without (CONSIG.) (AC-001)', () => {
    expect(issuedSummaryValueSuffix('5102')).toBe('');
    expect(issuedSummaryValueSuffix('6102')).toBe('');
    expect(isIssuedSaleOperation('5102')).toBe(true);
    expect(formatIssuedSummaryAmountLine('R$ 4.800,00', '5102')).toBe('R$ 4.800,00');
  });

  it('marks consignment return and non-sale operations (AC-002)', () => {
    expect(issuedSummaryValueSuffix('1918')).toBe(' (CONSIG.)');
    expect(issuedSummaryValueSuffix('5554')).toBe(' (CONSIG.)');
    expect(issuedSummaryValueSuffix('5917')).toBe(' (CONSIG.)');
    expect(formatIssuedSummaryAmountLine('R$ 5.890,85', '1918')).toBe('R$ 5.890,85 (CONSIG.)');
    expect(formatIssuedSummaryAmountLine('R$ 15.000,00', '5554')).toBe('R$ 15.000,00 (CONSIG.)');
  });

  it('treats missing or unknown CFOP as non-sale (FAIL-001)', () => {
    expect(issuedSummaryValueSuffix(null)).toBe(' (CONSIG.)');
    expect(issuedSummaryValueSuffix('')).toBe(' (CONSIG.)');
    expect(issuedSummaryValueSuffix('9999')).toBe(' (CONSIG.)');
  });

  it('honors an explicit cfopTag from the invoice list (AC-004, AC-005)', () => {
    expect(issuedSummaryValueSuffix('1918', 'Venda')).toBe('');
    expect(issuedSummaryValueSuffix('5102', 'Consignação')).toBe(' (CONSIG.)');
  });
});

describe('issued daily summary sale-only header', () => {
  const venda = { number: '65159', totalValue: 4800, cfop: '5102', cfopTag: 'Venda' };
  const consig = { number: '65160', totalValue: 5890.85, cfop: '1918', cfopTag: 'Consignação' };

  it('sale-only header totals exclude non-sale (SPEC-021 AC-002)', () => {
    const header = summarizeIssuedDailySalesHeader([venda, consig]);
    expect(header.saleTotal).toBe(4800);
  });

  it('sale-only header count excludes non-sale (SPEC-021 AC-001)', () => {
    const header = summarizeIssuedDailySalesHeader([venda, consig]);
    expect(header.saleCount).toBe(1);
  });

  it('non-sale excluded from header even when listed (SPEC-021 AC-003, AC-004)', () => {
    expect(summarizeIssuedDailySalesHeader([consig])).toEqual({ saleCount: 0, saleTotal: 0 });
    expect(formatIssuedSummaryAmountLine('R$ 5.890,85', consig.cfop, consig.cfopTag)).toBe(
      'R$ 5.890,85 (CONSIG.)',
    );
  });

  it('treats empty or unknown CFOP as non-sale excluded from header (FAIL-001)', () => {
    expect(summarizeIssuedDailySalesHeader([
      { totalValue: 100, cfop: null, cfopTag: null },
      { totalValue: 200, cfop: '', cfopTag: '' },
      { totalValue: 300, cfop: '9999' },
    ])).toEqual({ saleCount: 0, saleTotal: 0 });
  });

  it('sums multiple sales with money helper precision', () => {
    const header = summarizeIssuedDailySalesHeader([
      { totalValue: 4800, cfopTag: 'Venda' },
      { totalValue: 19.9, cfop: '6102', cfopTag: 'Venda' },
      consig,
    ]);
    expect(header).toEqual({ saleCount: 2, saleTotal: 4819.9 });
  });

  it('excludes cancelled sale from header when cancelledAt is present', () => {
    const header = summarizeIssuedDailySalesHeader([
      venda,
      { ...venda, number: '65161', totalValue: 1000, cancelledAt: '2026-08-28T12:00:00.000Z' },
    ]);
    expect(header).toEqual({ saleCount: 1, saleTotal: 4800 });
  });

  it('labels the header as sales, not all issued (FR-005)', () => {
    const lines = formatIssuedSummarySalesHeaderLines(1, 'R$ 4.800,00');
    expect(lines).toBe('*Notas de venda:* 1\n*Valor de vendas:* R$ 4.800,00');
    expect(lines).not.toMatch(/Notas emitidas/);
    expect(lines).not.toMatch(/Valor total/);
  });
});
