import type { Invoice } from '@/types';

export const MONTH_NAMES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

const p2 = (n: number) => String(n).padStart(2, '0');

export type MonthGroup = { key: string; label: string; invoices: Invoice[]; total: number; count: number };
export type YearGroup = { year: number; key: string; months: MonthGroup[]; total: number; count: number };
export type NfeHierarchy = {
  hoje: Invoice[]; hojeTotal: number;
  /** Sempre vazio — divisorias de semana removidas. */
  estaSemana: Invoice[]; estaSemanaTotal: number;
  /** Sempre vazio — divisorias de semana removidas. */
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
  innerRemainder: T[];
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
    /** @deprecated Semanas relativas removidas; itens devem ir em currentYearMonths. Aceito vazio por compat. */
    estaSemana?: T[];
    /** @deprecated Semanas relativas removidas; itens devem ir em currentYearMonths. Aceito vazio por compat. */
    semanaPassada?: T[];
    currentYearMonths: Array<{ key: string; label: string; items: T[]; total: number; count: number }>;
  },
  now: Date = new Date(),
): RelativeMonthSplit<T> {
  const ym = currentMonthYm(now);
  const key = monthGroupKey(ym);
  const label = monthGroupLabel(ym);
  const hoje = input.hoje ?? [];
  const weekLegacy = [...(input.estaSemana ?? []), ...(input.semanaPassada ?? [])];

  // Compat: se ainda vierem arrays de semana, funde no bucket do mês.
  const monthBuckets = new Map<string, { key: string; label: string; items: T[]; total: number; count: number }>();
  for (const m of input.currentYearMonths) {
    monthBuckets.set(m.key, { key: m.key, label: m.label, items: [...m.items], count: m.count, total: m.total });
  }
  for (const item of weekLegacy) {
    const itemYm = issueYm(item.issueDate);
    if (!itemYm || itemYm.length < 7) continue;
    const mk = monthGroupKey(itemYm);
    const existing = monthBuckets.get(mk);
    if (existing) {
      existing.items.push(item);
      existing.count += 1;
      existing.total += Number(item.totalValue) || 0;
    } else {
      monthBuckets.set(mk, {
        key: mk,
        label: monthGroupLabel(itemYm),
        items: [item],
        count: 1,
        total: Number(item.totalValue) || 0,
      });
    }
  }

  const innerHoje = inYm(hoje, ym);
  const remainderMonth = monthBuckets.get(key) ?? null;
  const otherMonths = [...monthBuckets.values()]
    .filter((m) => m.key !== key)
    .sort((a, b) => b.key.localeCompare(a.key));
  const innerRemainder = remainderMonth?.items ?? [];
  const count = innerHoje.length + innerRemainder.length;
  const total = totalOf(innerHoje) + (remainderMonth?.total ?? 0);
  return {
    currentMonth: count > 0 ? { key, label, count, total } : null,
    innerHoje,
    innerHojeTotal: totalOf(innerHoje),
    innerRemainder,
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
  const ts = (d: Date) => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
  const todayS = ts(now);
  const cy = now.getFullYear();
  const hj: Invoice[] = [];
  const mm = new Map<string, Invoice[]>();
  const ym = new Map<number, Map<string, Invoice[]>>();
  for (const inv of invoices) {
    const d = (inv.issueDate || '').substring(0, 10);
    const yr = parseInt(d.substring(0, 4), 10);
    const mo = d.substring(0, 7);
    // Só "Hoje" é bucket relativo; semanas vão para o mês calendário.
    if (d === todayS) hj.push(inv);
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
    // Mantidos vazios por compat de tipo; UI não renderiza mais essas divisorias.
    estaSemana: [], estaSemanaTotal: 0,
    semanaPassada: [], semanaPassadaTotal: 0,
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
