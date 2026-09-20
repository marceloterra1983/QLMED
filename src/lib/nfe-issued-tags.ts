export function isVendaTag(tag?: string | null): boolean {
  return tag === 'Venda';
}

export function issuedTagClasses(tag?: string | null, highlighted?: boolean): string {
  if (tag === 'Venda') return 'bg-emerald-200 text-emerald-900 dark:bg-emerald-500/35 dark:text-emerald-100';
  if (tag === 'Compra') return 'bg-rose-200 text-rose-900 dark:bg-rose-500/30 dark:text-rose-100';
  if (highlighted) return 'bg-amber-200 text-amber-900 dark:bg-amber-500/40 dark:text-amber-100';
  return 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300';
}
