import type { Invoice } from '@/types';

export const MONTH_NAMES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

const p2 = (n: number) => String(n).padStart(2, '0');

export type MonthGroup = { key: string; label: string; invoices: Invoice[]; total: number; count: number };
export type YearGroup = { year: number; key: string; months: MonthGroup[]; total: number; count: number };
export type NfeHierarchy = {
  estaSemana: Invoice[]; estaSemanaTotal: number;
  semanaPassada: Invoice[]; semanaPassadaTotal: number;
  currentYearMonths: MonthGroup[];
  previousYears: YearGroup[];
};

export function buildNfeGroups(invoices: Invoice[]): NfeHierarchy {
  const now = new Date();
  const dow = now.getDay();
  const dfm = dow === 0 ? 6 : dow - 1;
  const ws = new Date(now); ws.setDate(now.getDate() - dfm);
  const we = new Date(ws); we.setDate(ws.getDate() + 6);
  const pwe = new Date(ws); pwe.setDate(ws.getDate() - 1);
  const pws = new Date(pwe); pws.setDate(pwe.getDate() - 6);
  const ts = (d: Date) => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
  const [wsS, weS, pwsS, pweS] = [ts(ws), ts(we), ts(pws), ts(pwe)];
  const cy = now.getFullYear();
  const es: Invoice[] = [], sp: Invoice[] = [];
  const mm = new Map<string, Invoice[]>();
  const ym = new Map<number, Map<string, Invoice[]>>();
  for (const inv of invoices) {
    const d = (inv.issueDate || '').substring(0, 10);
    const yr = parseInt(d.substring(0, 4));
    const mo = d.substring(0, 7);
    if (d >= wsS && d <= weS) es.push(inv);
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
    estaSemana: es, estaSemanaTotal: es.reduce((s, i) => s + i.totalValue, 0),
    semanaPassada: sp, semanaPassadaTotal: sp.reduce((s, i) => s + i.totalValue, 0),
    currentYearMonths: cym, previousYears: py,
  };
}
