import { NextResponse } from 'next/server';
import { Decimal } from '@prisma/client-runtime-utils';
import { forbiddenResponse, requireAuth, unauthorizedResponse } from '@/lib/auth';
import { canAccessPage } from '@/lib/navigation';
import { getOrCreateSingleCompany } from '@/lib/single-company';
import { formatMoneyDecimal } from '@/lib/money';
import prisma from '@/lib/prisma';
import { UNIMED_CG_PAGE_PATH } from './constants';

export function formatUnimedCgMoney(value: unknown): string {
  if (value instanceof Decimal) {
    return formatMoneyDecimal(value);
  }
  if (value && typeof value === 'object' && 'toString' in value) {
    return formatMoneyDecimal(new Decimal(value.toString()));
  }
  return formatMoneyDecimal(new Decimal(value == null || value === '' ? 0 : String(value)));
}

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
  return role === 'admin' || role === 'editor';
}

export type UnimedCgAccess =
  | { ok: true; userId: string; role: string; canSync: boolean; companyId: string }
  | { ok: false; response: NextResponse };

export async function requireUnimedCgPage(): Promise<UnimedCgAccess> {
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
  if (!canAccessPage(user.role, user.allowedPages, UNIMED_CG_PAGE_PATH)) {
    return { ok: false, response: forbiddenResponse() };
  }

  const company = await getOrCreateSingleCompany(userId);
  return {
    ok: true,
    userId,
    role: user.role,
    canSync: canUnimedCgSync(user.role),
    companyId: company.id,
  };
}
