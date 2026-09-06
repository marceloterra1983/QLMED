import { describe, it, expect } from 'vitest';
import {
  splitRelativeGroupsByCurrentMonth,
  buildNfeGroups,
  monthGroupKey,
  monthGroupLabel,
  currentMonthYm,
} from '@/lib/nfe-groups';
import type { Invoice } from '@/types';

type Row = { issueDate: string; totalValue: number };

function row(issueDate: string, totalValue = 10): Row {
  return { issueDate, totalValue };
}

function invoice(id: string, issueDate: string, totalValue = 10): Invoice {
  return {
    id,
    accessKey: id,
    type: 'NFE',
    direction: 'issued',
    number: id,
    series: '1',
    issueDate,
    senderCnpj: '00000000000000',
    senderName: 'Emitente',
    recipientCnpj: null,
    recipientName: null,
    totalValue,
    status: 'confirmed',
  };
}

describe('splitRelativeGroupsByCurrentMonth', () => {
  it('envolve o mês atual; itens de semana legados fundem no mês', () => {
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
    expect(split.innerRemainder.map((r) => r.issueDate)).toEqual(['2026-09-02T12:00:00']);
    expect(split.otherMonths.map((m) => m.key)).toEqual(['mes_2026-08']);
    expect(split.otherMonths[0].items.map((r) => r.issueDate).sort()).toEqual([
      '2026-08-10T12:00:00',
      '2026-08-28T12:00:00',
      '2026-08-31T12:00:00',
    ]);
  });

  it('soma resto do mês atual no shell sem buckets de semana', () => {
    const now = new Date(2026, 8, 20, 15, 0, 0);
    const split = splitRelativeGroupsByCurrentMonth({
      hoje: [row('2026-09-20T12:00:00')],
      currentYearMonths: [{
        key: 'mes_2026-09',
        label: 'Setembro/2026',
        items: [
          row('2026-09-16T12:00:00'),
          row('2026-09-10T12:00:00'),
          row('2026-09-03T12:00:00', 40),
        ],
        count: 3,
        total: 60,
      }],
    }, now);

    expect(split.currentMonth?.key).toBe('mes_2026-09');
    expect(split.currentMonth?.count).toBe(4);
    expect(split.currentMonth?.total).toBe(70);
    expect(split.innerRemainder).toHaveLength(3);
    expect(split.otherMonths).toEqual([]);
  });

  it('não cria shell quando não há item do mês atual', () => {
    const now = new Date(2026, 8, 6, 15, 0, 0);
    const split = splitRelativeGroupsByCurrentMonth({
      currentYearMonths: [{
        key: 'mes_2026-08',
        label: 'Agosto/2026',
        items: [row('2026-08-10T12:00:00'), row('2026-08-28T12:00:00')],
        count: 2,
        total: 20,
      }],
    }, now);
    expect(split.currentMonth).toBeNull();
    expect(split.otherMonths.map((m) => m.key)).toEqual(['mes_2026-08']);
  });
});

describe('buildNfeGroups', () => {
  it('coloca dias da semana no mês e deixa estaSemana/semanaPassada vazios', () => {
    const now = new Date();
    const iso = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const today = iso(now);
    const earlierThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    // Se dia 1 for hoje, use dia 2 se existir; senão use ontem no mês se possível
    let mid: Date;
    if (now.getDate() > 1) {
      mid = earlierThisMonth;
    } else {
      mid = new Date(now.getFullYear(), now.getMonth() - 1, 15);
    }
    const midIso = iso(mid);
    const groups = buildNfeGroups([
      invoice('t', today + 'T12:00:00'),
      invoice('m', midIso + 'T12:00:00'),
    ]);
    expect(groups.hoje).toHaveLength(1);
    expect(groups.estaSemana).toEqual([]);
    expect(groups.semanaPassada).toEqual([]);
    const allMonthItems = [
      ...groups.currentYearMonths.flatMap((m) => m.invoices),
      ...groups.previousYears.flatMap((y) => y.months.flatMap((m) => m.invoices)),
    ];
    expect(allMonthItems.some((i) => i.id === 'm')).toBe(true);
    expect(currentMonthYm(now)).toBe(monthGroupKey(currentMonthYm(now)).replace('mes_', ''));
    expect(monthGroupLabel(currentMonthYm(now))).toContain('/');
  });
});
