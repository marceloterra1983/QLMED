import { formatCurrency } from '@/lib/money';
import { requireFeatureAccess, canWriteRole, type FeatureAccess } from '@/lib/feature-access';
import { sortOperatorListItems } from '@/lib/operator-sort';
import { CASSEMS_PAGE_PATH } from './constants';

export const formatCassemsMoney = formatCurrency;
export const sortCassemsListItems = sortOperatorListItems;

export function canCassemsSync(role: string): boolean {
  return canWriteRole(role);
}

export type CassemsAccess = FeatureAccess;

export async function requireCassemsPage(): Promise<CassemsAccess> {
  return requireFeatureAccess({ pagePath: CASSEMS_PAGE_PATH });
}
