import { describe, it, expect } from 'vitest';
import {
  splitRelativeGroupsByCurrentMonth,
  monthGroupKey,
  monthGroupLabel,
  currentMonthYm,
} from '@/lib/nfe-groups';

type Row = { issueDate: string; totalValue: number };

function row(issueDate: string, totalValue = 10): Row {
  return { issueDate, totalValue };
}

describe('splitRelativeGroupsByCurrentMonth', () => {
  it('envolve o mês atual e deixa dia da semana do mês anterior fora', () => {
    const now = new Date(2026, 8, 6, 15, 0, 0);
    const split = splitRelativeGroupsByCurrentMonth({
      hoje: [row('2026-09-06T12:00:00')],
      estaSemana: [row('2026-09-02T12:00:00'), row('2026-08-31T12:00:00')],
      semanaPassada: [row('2026-08-28T12:00:00')],
      currentYearMonths: [{
        key: 'mes_2026-08',
        label: 'Agosto/2026',
        items: [row('2026-08-10T12:00:00')],
        count: 1,
        total: 10,
      }],
    }, now);

    expect(split.currentMonth).toEqual({
      key: 'mes_2026-09',
      label: 'Setembro/2026',
      count: 2,
      total: 20,
    });
    expect(split.innerHoje.map((r) => r.issueDate)).toEqual(['2026-09-06T12:00:00']);
    expect(split.innerEstaSemana.map((r) => r.issueDate)).toEqual(['2026-09-02T12:00:00']);
    expect(split.outerEstaSemana.map((r) => r.issueDate)).toEqual(['2026-08-31T12:00:00']);
    expect(split.innerSemanaPassada).toEqual([]);
    expect(split.outerSemanaPassada.map((r) => r.issueDate)).toEqual(['2026-08-28T12:00:00']);
    expect(split.otherMonths.map((m) => m.key)).toEqual(['mes_2026-08']);
  });

  it('soma resto do mês atual (antes da semana passada) no shell', () => {
    const now = new Date(2026, 8, 20, 15, 0, 0);
    const split = splitRelativeGroupsByCurrentMonth({
      hoje: [row('2026-09-20T12:00:00')],
      estaSemana: [row('2026-09-16T12:00:00')],
      semanaPassada: [row('2026-09-10T12:00:00')],
      currentYearMonths: [{
        key: 'mes_2026-09',
        label: 'Setembro/2026',
        items: [row('2026-09-03T12:00:00', 40)],
        count: 1,
        total: 40,
      }],
    }, now);

    expect(split.currentMonth?.key).toBe('mes_2026-09');
    expect(split.currentMonth?.count).toBe(4);
    expect(split.currentMonth?.total).toBe(70);
    expect(split.innerRemainder).toHaveLength(1);
    expect(split.otherMonths).toEqual([]);
  });

  it('não cria shell quando não há item do mês atual', () => {
    const now = new Date(2026, 8, 6, 15, 0, 0);
    const split = splitRelativeGroupsByCurrentMonth({
      estaSemana: [],
      semanaPassada: [row('2026-08-28T12:00:00')],
      currentYearMonths: [{
        key: 'mes_2026-08',
        label: 'Agosto/2026',
        items: [row('2026-08-10T12:00:00')],
        count: 1,
        total: 10,
      }],
    }, now);
    expect(split.currentMonth).toBeNull();
    expect(split.otherMonths).toHaveLength(1);
  });
});

describe('monthGroupKey/label', () => {
  it('usa mes_YYYY-MM e nome em pt-BR', () => {
    const now = new Date(2026, 8, 6);
    const ym = currentMonthYm(now);
    expect(ym).toBe('2026-09');
    expect(monthGroupKey(ym)).toBe('mes_2026-09');
    expect(monthGroupLabel(ym)).toBe('Setembro/2026');
  });
});
