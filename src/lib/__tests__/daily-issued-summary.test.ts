import { describe, expect, it } from 'vitest';
import {
  formatIssuedSummaryAmountLine,
  isIssuedSaleOperation,
  issuedSummaryValueSuffix,
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
