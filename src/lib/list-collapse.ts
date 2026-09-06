import type { Invoice } from '@/types';
import {
  buildNfeGroups,
  buildYearMonths,
  currentMonthYm,
  monthGroupKey,
  monthGroupLabel,
  issueYm,
  splitNfeGroupsForDisplay,
} from '@/lib/nfe-groups';

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


const STATIC_RELATIVE_DATE_GROUPS = new Set([
  'hoje',
  'esta_semana',
  'esta semana',
  'semana_passada',
  'semana passada',
  'proxima semana',
  'próxima semana',
]);

/** Hoje / Esta semana / Semana passada são só divisorias (SPEC-053). */
export function isCollapsibleDateGroup(keyOrLabel: string): boolean {
  return !STATIC_RELATIVE_DATE_GROUPS.has(keyOrLabel.trim().toLowerCase());
}

export function isCurrentMonthDateGroup(keyOrLabel: string, now: Date = new Date()): boolean {
  const n = keyOrLabel.trim().toLowerCase();
  if (n === 'este mês' || n === 'este mes') return true;
  const ym = currentMonthYm(now);
  return n === monthGroupKey(ym).toLowerCase() || n === monthGroupLabel(ym).toLowerCase();
}

export function dateGroupItemsVisible(
  keyOrLabel: string,
  collapsed: ReadonlySet<string>,
): boolean {
  if (!isCollapsibleDateGroup(keyOrLabel)) return true;
  return !collapsed.has(keyOrLabel);
}

export function collapsibleDateGroupKeys(keys: Iterable<string>): string[] {
  return [...keys].filter(isCollapsibleDateGroup);
}

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

/** Chaves de mês que Recolher deve fechar, incluindo o mês atual. */
export function nfeCollapsibleMonthKeys(
  invoices: Invoice[],
  selectedYear: number | null,
  now: Date = new Date(),
): string[] {
  if (selectedYear !== null) {
    return buildYearMonths(invoices).map((month) => month.key);
  }
  const split = splitNfeGroupsForDisplay(buildNfeGroups(invoices), now);
  const keys: string[] = [];
  if (split.currentMonth) keys.push(split.currentMonth.key);
  for (const month of split.otherMonths) keys.push(month.key);
  return keys;
}

export function defaultNfeCollapsedKeys(
  invoices: Invoice[],
  selectedYear: number | null,
  now: Date = new Date(),
): string[] {
  const currentKey = monthGroupKey(currentMonthYm(now));
  return nfeCollapsibleMonthKeys(invoices, selectedYear, now).filter((key) => key !== currentKey);
}

export function defaultWalkCollapsedKeys(groups: Iterable<string>, now: Date = new Date()): string[] {
  return [...groups].filter((g) => isCollapsibleDateGroup(g) && !isCurrentMonthDateGroup(g, now));
}

export type DateGroupWalkTick = {
  emitParentHeader: { key: string; label: string } | null;
  emitGroupDivider: boolean;
  showRow: boolean;
};

export function createDateGroupWalker(
  collapsed: ReadonlySet<string>,
  options: { dateGrouping?: boolean; now?: Date } = {},
) {
  const dateGrouping = options.dateGrouping !== false;
  const now = options.now ?? new Date();
  let lastGroup = '';
  let parentEmitted = false;
  const ym = currentMonthYm(now);
  const parentKey = monthGroupKey(ym);
  const parentLabel = monthGroupLabel(ym);

  return (dateStr: string | null | undefined, groupLabel: string): DateGroupWalkTick => {
    if (!dateGrouping) {
      const emitGroupDivider = groupLabel !== lastGroup;
      lastGroup = groupLabel;
      return {
        emitParentHeader: null,
        emitGroupDivider,
        showRow: dateGroupItemsVisible(groupLabel, collapsed),
      };
    }

    const inCurrentMonth = issueYm(dateStr) === ym && ym.length === 7;
    let emitParentHeader: { key: string; label: string } | null = null;
    if (inCurrentMonth && !parentEmitted) {
      emitParentHeader = { key: parentKey, label: parentLabel };
      parentEmitted = true;
    }

    const parentOpen = !inCurrentMonth || dateGroupItemsVisible(parentKey, collapsed);
    const skipEsteMes = groupLabel.trim().toLowerCase() === 'este mês';
    const emitGroupDivider = parentOpen && groupLabel !== lastGroup && !skipEsteMes;
    lastGroup = groupLabel;
    return {
      emitParentHeader,
      emitGroupDivider,
      showRow: parentOpen && dateGroupItemsVisible(groupLabel, collapsed),
    };
  };
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
