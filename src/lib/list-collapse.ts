import type { Invoice } from '@/types';
import { buildNfeGroups, buildYearMonths } from '@/lib/nfe-groups';

export type CollapseAfterFetchInput = {
  preserve: boolean;
  resetToExpanded: boolean;
  alreadyInitialized: boolean;
  defaultCollapsed: Iterable<string>;
};

export type CollapseAfterFetchResult = {
  collapsed: Set<string> | null;
  initialized: boolean;
};

/** Poll/refetch silencioso não mexe no que o usuário abriu. */
export function resolveCollapsedGroupsAfterFetch(
  input: CollapseAfterFetchInput,
): CollapseAfterFetchResult {
  if (input.preserve) {
    return { collapsed: null, initialized: input.alreadyInitialized };
  }
  if (input.resetToExpanded) {
    return { collapsed: new Set(), initialized: input.alreadyInitialized };
  }
  if (!input.alreadyInitialized) {
    return { collapsed: new Set(input.defaultCollapsed), initialized: true };
  }
  return { collapsed: null, initialized: true };
}

export function defaultNfeCollapsedKeys(
  invoices: Invoice[],
  selectedYear: number | null,
): string[] {
  if (selectedYear !== null) {
    return buildYearMonths(invoices).map((month) => month.key);
  }
  const groups = buildNfeGroups(invoices);
  const keys: string[] = [];
  if (groups.semanaPassada.length > 0) keys.push('semana_passada');
  for (const month of groups.currentYearMonths) keys.push(month.key);
  return keys;
}

export function retainExpandedIds(
  expanded: Iterable<string>,
  available: Iterable<string>,
): Set<string> {
  const avail = new Set(available);
  return new Set([...expanded].filter((id) => avail.has(id)));
}

export function nfeProdutoExpandKey(prod: { num?: string; codigo?: string }): string {
  const num = (prod.num || '').trim();
  const codigo = (prod.codigo || '').trim();
  if (num && codigo) return `${num}:${codigo}`;
  if (num) return `n:${num}`;
  if (codigo) return `c:${codigo}`;
  return '';
}
