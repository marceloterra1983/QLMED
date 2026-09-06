import { formatMoneyDecimalString } from '@/lib/money';
import { requireFeatureAccess, canWriteRole, type FeatureAccess } from '@/lib/feature-access';
import { UNIMED_CG_PAGE_PATH } from './constants';

export const formatUnimedCgMoney = formatMoneyDecimalString;

export function sortUnimedCgListItems<T extends { receivedAt: Date | string | null; processId: string }>(
  items: T[],
): T[] {
  return [...items].sort((a, b) => {
    const at = a.receivedAt ? new Date(a.receivedAt).getTime() : 0;
    const bt = b.receivedAt ? new Date(b.receivedAt).getTime() : 0;
    if (bt !== at) return bt - at;
    return b.processId.localeCompare(a.processId, undefined, { numeric: true });
  });
}

export function canUnimedCgSync(role: string): boolean {
  return canWriteRole(role);
}

export type UnimedCgAccess = FeatureAccess;

export async function requireUnimedCgPage(): Promise<UnimedCgAccess> {
  return requireFeatureAccess({ pagePath: UNIMED_CG_PAGE_PATH });
}
