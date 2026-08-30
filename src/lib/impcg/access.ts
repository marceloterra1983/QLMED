import { NextResponse } from 'next/server';
import { Decimal } from '@prisma/client-runtime-utils';
import { forbiddenResponse, requireAuth, unauthorizedResponse } from '@/lib/auth';
import { canAccessPage } from '@/lib/navigation';
import { getOrCreateSingleCompany } from '@/lib/single-company';
import { formatMoneyDecimal } from '@/lib/money';
import prisma from '@/lib/prisma';
import { IMPCG_PAGE_PATH } from './constants';

export function formatImpcgMoney(value: unknown): string {
  if (value instanceof Decimal) {
    return formatMoneyDecimal(value);
  }
  if (value && typeof value === 'object' && 'toString' in value) {
    return formatMoneyDecimal(new Decimal(value.toString()));
  }
  return formatMoneyDecimal(new Decimal(value == null || value === '' ? 0 : String(value)));
}

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
  return role === 'admin' || role === 'editor';
}

export type ImpcgAccess =
  | { ok: true; userId: string; role: string; canSync: boolean; companyId: string }
  | { ok: false; response: NextResponse };

export async function requireImpcgPage(): Promise<ImpcgAccess> {
  let userId: string;
  try {
    userId = await requireAuth();
  } catch (error) {
    if (error instanceof Error && error.message === 'FORBIDDEN') {
      return { ok: false, response: forbiddenResponse() };
    }
    return { ok: false, response: unauthorizedResponse() };
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true, allowedPages: true },
  });
  if (!user) {
    return { ok: false, response: unauthorizedResponse() };
  }
  if (!canAccessPage(user.role, user.allowedPages, IMPCG_PAGE_PATH)) {
    return { ok: false, response: forbiddenResponse() };
  }

  const company = await getOrCreateSingleCompany(userId);
  return {
    ok: true,
    userId,
    role: user.role,
    canSync: canImpcgSync(user.role),
    companyId: company.id,
  };
}
