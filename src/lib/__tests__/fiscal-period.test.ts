import { describe, it, expect } from 'vitest';
import { getFiscalPeriodRange, fiscalPeriodQuerySchema } from '@/lib/fiscal-period';

const iso = (d: Date) => d.toISOString();

describe('getFiscalPeriodRange', () => {
  it('mês cobre do dia 1 ao último dia do mês', () => {
    const { startDate, endDate } = getFiscalPeriodRange('month', 2026, 2);
    expect(iso(startDate)).toBe('2026-02-01T00:00:00.000Z');
    expect(iso(endDate)).toBe('2026-02-28T23:59:59.000Z');
  });

  it('mês respeita ano bissexto', () => {
    const { endDate } = getFiscalPeriodRange('month', 2028, 2);
    expect(iso(endDate)).toBe('2028-02-29T23:59:59.000Z');
  });

  it('ano cobre 1º de janeiro a 31 de dezembro', () => {
    const { startDate, endDate } = getFiscalPeriodRange('year', 2026, 7);
    expect(iso(startDate)).toBe('2026-01-01T00:00:00.000Z');
    expect(iso(endDate)).toBe('2026-12-31T23:59:59.000Z');
  });

  it.each([
    [1, '2026-01-01T00:00:00.000Z', '2026-03-31T23:59:59.000Z'],
    [4, '2026-04-01T00:00:00.000Z', '2026-06-30T23:59:59.000Z'],
    [7, '2026-07-01T00:00:00.000Z', '2026-09-30T23:59:59.000Z'],
    [10, '2026-10-01T00:00:00.000Z', '2026-12-31T23:59:59.000Z'],
  ])('trimestre ancorado no mês %i cobre o trimestre inteiro', (month, start, end) => {
    const range = getFiscalPeriodRange('quarter', 2026, month);
    expect(iso(range.startDate)).toBe(start);
    expect(iso(range.endDate)).toBe(end);
  });

  it('qualquer mês do mesmo trimestre dá o mesmo intervalo', () => {
    const abr = getFiscalPeriodRange('quarter', 2026, 4);
    const jun = getFiscalPeriodRange('quarter', 2026, 6);
    expect(iso(abr.startDate)).toBe(iso(jun.startDate));
    expect(iso(abr.endDate)).toBe(iso(jun.endDate));
  });

  it('trimestre não é o ano inteiro — o defeito que motivou a extração', () => {
    const tri = getFiscalPeriodRange('quarter', 2026, 5);
    const ano = getFiscalPeriodRange('year', 2026, 5);
    expect(iso(tri.startDate)).not.toBe(iso(ano.startDate));
    expect(iso(tri.endDate)).not.toBe(iso(ano.endDate));
  });
});

describe('fiscalPeriodQuerySchema', () => {
  it('aceita period, year e month — os três que by-cfop ignorava', () => {
    const parsed = fiscalPeriodQuerySchema.parse({ period: 'quarter', year: '2026', month: '4' });
    expect(parsed).toEqual({ period: 'quarter', year: 2026, month: 4 });
  });

  it('recusa período fora do enum', () => {
    expect(fiscalPeriodQuerySchema.safeParse({ period: 'semester' }).success).toBe(false);
  });

  it('recusa mês fora de 1–12', () => {
    expect(fiscalPeriodQuerySchema.safeParse({ month: 13 }).success).toBe(false);
    expect(fiscalPeriodQuerySchema.safeParse({ month: 0 }).success).toBe(false);
  });

  it('sem parâmetro nenhum, cai em ano corrente', () => {
    const parsed = fiscalPeriodQuerySchema.parse({});
    expect(parsed.period).toBe('year');
    expect(parsed.year).toBe(new Date().getFullYear());
  });
});
