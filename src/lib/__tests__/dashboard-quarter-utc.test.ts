import { describe, expect, it } from 'vitest';
import { getFiscalPeriodRangeFromDate } from '@/lib/fiscal-period';

describe('dashboard quarter bounds (UTC)', () => {
  it('01 Apr 01:00Z is Q2 even when local TZ is still March', () => {
    const d = new Date('2026-04-01T01:00:00.000Z');
    const { startDate, endDate } = getFiscalPeriodRangeFromDate(d, 'quarter');
    expect(startDate.toISOString()).toBe('2026-04-01T00:00:00.000Z');
    expect(endDate.toISOString()).toBe('2026-06-30T23:59:59.999Z');
  });

  it('31 Dec 21:00-03 equivalent is Q4 of the UTC year, not next year', () => {
    const d = new Date('2026-12-31T23:30:00.000Z');
    const { startDate, endDate } = getFiscalPeriodRangeFromDate(d, 'quarter');
    expect(startDate.toISOString()).toBe('2026-10-01T00:00:00.000Z');
    expect(endDate.getUTCFullYear()).toBe(2026);
  });
});
