import type { Invoice } from '@/types';

export const MONTH_NAMES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

const p2 = (n: number) => String(n).padStart(2, '0');

export type MonthGroup = { key: string; label: string; invoices: Invoice[]; total: number; count: number };
export type YearGroup = { year: number; key: string; months: MonthGroup[]; total: number; count: number };
export type NfeHierarchy = {
  hoje: Invoice[]; hojeTotal: number;
  estaSemana: Invoice[]; estaSemanaTotal: number;
  semanaPassada: Invoice[]; semanaPassadaTotal: number;
  currentYearMonths: MonthGroup[];
  previousYears: YearGroup[];
};

export function currentMonthYm(now: Date = new Date()): string {
  return `${now.getFullYear()}-${p2(now.getMonth() + 1)}`;
}

export function monthGroupKey(ym: string): string {
  return `mes_${ym}`;
}

export function monthGroupLabel(ym: string): string {
  const [y, m] = ym.split('-');
  return `${MONTH_NAMES[parseInt(m, 10) - 1]}/${y}`;
}

export function issueYm(issueDate: string | null | undefined): string {
  return (issueDate || '').substring(0, 7);
}

export type DatedItem = { issueDate?: string | null; totalValue?: number | null };

export type MonthBucket<T> = {
  key: string;
  label: string;
  items: T[];
  count: number;
  total: number;
};

export type RelativeMonthSplit<T> = {
  currentMonth: Omit<MonthBucket<T>, 'items'> | null;
  innerHoje: T[];
  innerHojeTotal: number;
  innerEstaSemana: T[];
  innerEstaSemanaTotal: number;
  innerSemanaPassada: T[];
  innerSemanaPassadaTotal: number;
  innerRemainder: T[];
  outerEstaSemana: T[];
  outerEstaSemanaTotal: number;
  outerSemanaPassada: T[];
  outerSemanaPassadaTotal: number;
  otherMonths: MonthBucket<T>[];
};

function totalOf<T extends DatedItem>(items: T[]): number {
  return items.reduce((s, i) => s + (Number(i.totalValue) || 0), 0);
}

function inYm<T extends DatedItem>(items: T[], ym: string): T[] {
  return items.filter((i) => issueYm(i.issueDate) === ym);
}

export function splitRelativeGroupsByCurrentMonth<T extends DatedItem>(
  input: {
    hoje?: T[];
    estaSemana: T[];
    semanaPassada: T[];
    currentYearMonths: Array<{ key: string; label: string; items: T[]; total: number; count: number }>;
  },
  now: Date = new Date(),
): RelativeMonthSplit<T> {
  const ym = currentMonthYm(now);
  const key = monthGroupKey(ym);
  const label = monthGroupLabel(ym);
  const hoje = input.hoje ?? [];
  const innerHoje = inYm(hoje, ym);
  const innerEstaSemana = inYm(input.estaSemana, ym);
  const outerEstaSemana = input.estaSemana.filter((i) => issueYm(i.issueDate) !== ym);
  const innerSemanaPassada = inYm(input.semanaPassada, ym);
  const outerSemanaPassada = input.semanaPassada.filter((i) => issueYm(i.issueDate) !== ym);
  const remainderMonth = input.currentYearMonths.find((m) => m.key === key) ?? null;
  const otherMonths = input.currentYearMonths
    .filter((m) => m.key !== key)
    .map((m) => ({ key: m.key, label: m.label, items: m.items, count: m.count, total: m.total }));
  const innerRemainder = remainderMonth?.items ?? [];
  const count = innerHoje.length + innerEstaSemana.length + innerSemanaPassada.length + innerRemainder.length;
  const total = totalOf(innerHoje) + totalOf(innerEstaSemana) + totalOf(innerSemanaPassada) + (remainderMonth?.total ?? 0);
  return {
    currentMonth: count > 0 ? { key, label, count, total } : null,
    innerHoje,
    innerHojeTotal: totalOf(innerHoje),
    innerEstaSemana,
    innerEstaSemanaTotal: totalOf(innerEstaSemana),
    innerSemanaPassada,
    innerSemanaPassadaTotal: totalOf(innerSemanaPassada),
    innerRemainder,
    outerEstaSemana,
    outerEstaSemanaTotal: totalOf(outerEstaSemana),
    outerSemanaPassada,
    outerSemanaPassadaTotal: totalOf(outerSemanaPassada),
    otherMonths,
  };
}

export function splitNfeGroupsForDisplay(h: NfeHierarchy, now: Date = new Date()): RelativeMonthSplit<Invoice> {
  return splitRelativeGroupsByCurrentMonth({
    hoje: h.hoje,
    estaSemana: h.estaSemana,
    semanaPassada: h.semanaPassada,
    currentYearMonths: h.currentYearMonths.map((m) => ({
      key: m.key,
      label: m.label,
      items: m.invoices,
      total: m.total,
      count: m.count,
    })),
  }, now);
}

export function currentMonthItemCount(dates: Array<string | null | undefined>, now: Date = new Date()): number {
  const ym = currentMonthYm(now);
  return dates.filter((d) => issueYm(d) === ym).length;
}

export function buildNfeGroups(invoices: Invoice[]): NfeHierarchy {
  const now = new Date();
  const dow = now.getDay();
  const dfm = dow === 0 ? 6 : dow - 1;
  const ws = new Date(now); ws.setDate(now.getDate() - dfm);
  const we = new Date(ws); we.setDate(ws.getDate() + 6);
  const pwe = new Date(ws); pwe.setDate(ws.getDate() - 1);
  const pws = new Date(pwe); pws.setDate(pwe.getDate() - 6);
  const ts = (d: Date) => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
  const todayS = ts(now);
  const [wsS, weS, pwsS, pweS] = [ts(ws), ts(we), ts(pws), ts(pwe)];
  const cy = now.getFullYear();
  const hj: Invoice[] = [], es: Invoice[] = [], sp: Invoice[] = [];
  const mm = new Map<string, Invoice[]>();
  const ym = new Map<number, Map<string, Invoice[]>>();
  for (const inv of invoices) {
    const d = (inv.issueDate || '').substring(0, 10);
    const yr = parseInt(d.substring(0, 4));
    const mo = d.substring(0, 7);
    if (d === todayS) hj.push(inv);
    else if (d >= wsS && d <= weS) es.push(inv);
    else if (d >= pwsS && d <= pweS) sp.push(inv);
    else if (yr === cy) { if (!mm.has(mo)) mm.set(mo, []); mm.get(mo)!.push(inv); }
    else if (!isNaN(yr) && yr > 1900) { if (!ym.has(yr)) ym.set(yr, new Map()); const y2 = ym.get(yr)!; if (!y2.has(mo)) y2.set(mo, []); y2.get(mo)!.push(inv); }
  }
  const toMG = (mo: string, invs: Invoice[]): MonthGroup => {
    const [y, m] = mo.split('-');
    return { key: `mes_${mo}`, label: `${MONTH_NAMES[parseInt(m) - 1]}/${y}`, invoices: invs, total: invs.reduce((s, i) => s + i.totalValue, 0), count: invs.length };
  };
  const cym = Array.from(mm.keys()).sort((a, b) => b.localeCompare(a)).map(m => toMG(m, mm.get(m)!));
  const py = Array.from(ym.keys()).sort((a, b) => b - a).map(yr => {
    const ms = Array.from(ym.get(yr)!.keys()).sort((a, b) => b.localeCompare(a)).map(m => toMG(m, ym.get(yr)!.get(m)!));
    return { year: yr, key: `year_${yr}`, months: ms, total: ms.reduce((s, m) => s + m.total, 0), count: ms.reduce((s, m) => s + m.count, 0) };
  });
  return {
    hoje: hj, hojeTotal: hj.reduce((s, i) => s + i.totalValue, 0),
    estaSemana: es, estaSemanaTotal: es.reduce((s, i) => s + i.totalValue, 0),
    semanaPassada: sp, semanaPassadaTotal: sp.reduce((s, i) => s + i.totalValue, 0),
    currentYearMonths: cym, previousYears: py,
  };
}

export function buildYearMonths(invoices: Invoice[]): MonthGroup[] {
  const mm = new Map<string, Invoice[]>();
  for (const inv of invoices) {
    const mo = (inv.issueDate || '').substring(0, 7);
    if (!mm.has(mo)) mm.set(mo, []);
    mm.get(mo)!.push(inv);
  }
  return Array.from(mm.keys()).sort((a, b) => b.localeCompare(a)).map(mo => {
    const [y, m] = mo.split('-');
    const invs = mm.get(mo)!;
    return { key: `mes_${mo}`, label: `${MONTH_NAMES[parseInt(m) - 1]}/${y}`, invoices: invs, total: invs.reduce((s, i) => s + i.totalValue, 0), count: invs.length };
  });
}
