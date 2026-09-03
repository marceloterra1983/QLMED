/** Persistência do colapso por seção do SidebarNav (localStorage). */

export const SIDEBAR_COLLAPSED_GROUPS_KEY = 'qlmed-sidebar-collapsed-groups';

export function parseCollapsedGroups(raw: string | null): Set<string> {
  if (!raw) return new Set();
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(
      parsed.filter((v): v is string => typeof v === 'string' && v.length > 0),
    );
  } catch {
    return new Set();
  }
}

export function serializeCollapsedGroups(collapsed: Iterable<string>): string {
  return JSON.stringify([...collapsed].sort());
}

function browserLocalStorage(): Storage | null {
  try {
    if (typeof window === 'undefined') return null;
    return window.localStorage;
  } catch {
    return null;
  }
}

export function loadSidebarCollapsedGroups(
  storage: Pick<Storage, 'getItem'> | null | undefined = browserLocalStorage(),
): Set<string> {
  if (!storage) return new Set();
  return parseCollapsedGroups(storage.getItem(SIDEBAR_COLLAPSED_GROUPS_KEY));
}

export function saveSidebarCollapsedGroups(
  collapsed: Iterable<string>,
  storage: Pick<Storage, 'setItem'> | null | undefined = browserLocalStorage(),
): void {
  if (!storage) return;
  storage.setItem(
    SIDEBAR_COLLAPSED_GROUPS_KEY,
    serializeCollapsedGroups(collapsed),
  );
}

export function toggleSidebarCollapsedGroup(
  collapsed: Set<string>,
  section: string,
): Set<string> {
  const next = new Set(collapsed);
  if (next.has(section)) next.delete(section);
  else next.add(section);
  return next;
}

/** Garante que a seção da rota ativa não fique colapsada. */
export function ensureActiveSectionExpanded(
  collapsed: Set<string>,
  activeSection: string | null | undefined,
): Set<string> {
  if (!activeSection || !collapsed.has(activeSection)) return collapsed;
  const next = new Set(collapsed);
  next.delete(activeSection);
  return next;
}

export function sectionForPath(
  groups: { section: string | null; items: { href: string }[] }[],
  pathname: string,
): string | null {
  for (const group of groups) {
    if (!group.section) continue;
    if (group.items.some((item) => item.href === pathname)) return group.section;
  }
  return null;
}
