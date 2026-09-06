import { formatCurrency } from '@/lib/money';
import { requireFeatureAccess, canWriteRole, type FeatureAccess } from '@/lib/feature-access';
import { IMPCG_PAGE_PATH } from './constants';

export const formatImpcgMoney = formatCurrency;

export function sortImpcgListItems<T extends { issuedAt: Date | string | null; oficioNumber: string }>(
  items: T[],
): T[] {
  return [...items].sort((a, b) => {
    const at = a.issuedAt ? new Date(a.issuedAt).getTime() : 0;
    const bt = b.issuedAt ? new Date(b.issuedAt).getTime() : 0;
    if (bt !== at) return bt - at;
    return b.oficioNumber.localeCompare(a.oficioNumber, undefined, { numeric: true });
  });
}

export function canImpcgSync(role: string): boolean {
  return canWriteRole(role);
}

export type ImpcgAccess = FeatureAccess;

export async function requireImpcgPage(): Promise<ImpcgAccess> {
  return requireFeatureAccess({ pagePath: IMPCG_PAGE_PATH });
}
