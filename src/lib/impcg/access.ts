import { formatCurrency } from '@/lib/money';
import { requireFeatureAccess, canWriteRole, type FeatureAccess } from '@/lib/feature-access';
import { sortOperatorListItems } from '@/lib/operator-sort';
import { IMPCG_PAGE_PATH } from './constants';

export const formatImpcgMoney = formatCurrency;
export const sortImpcgListItems = sortOperatorListItems;

export function canImpcgSync(role: string): boolean {
  return canWriteRole(role);
}

export type ImpcgAccess = FeatureAccess;

export async function requireImpcgPage(): Promise<ImpcgAccess> {
  return requireFeatureAccess({ pagePath: IMPCG_PAGE_PATH });
}
