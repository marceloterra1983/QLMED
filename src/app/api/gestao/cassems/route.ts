import { NextResponse } from 'next/server';
import { Decimal } from '@prisma/client-runtime-utils';
import { forbiddenResponse, requireAuth, unauthorizedResponse } from '@/lib/auth';
import { canAccessPage } from '@/lib/navigation';
import { getOrCreateSingleCompany } from '@/lib/single-company';
import { formatMoneyDecimal } from '@/lib/money';
import { apiError } from '@/lib/api-error';
import prisma from '@/lib/prisma';
import { CASSEMS_PAGE_PATH } from '@/lib/cassems/constants';
import { getCassemsIngestState, listCassemsAuthorizations } from '@/lib/cassems/store';
import { createLogger } from '@/lib/logger';

const log = createLogger('gestao/cassems');

export function formatCassemsMoney(value: unknown): string {
  if (value instanceof Decimal) {
    return formatMoneyDecimal(value);
  }
  if (value && typeof value === 'object' && 'toString' in value) {
    return formatMoneyDecimal(new Decimal(value.toString()));
  }
  return formatMoneyDecimal(new Decimal(value == null || value === '' ? 0 : String(value)));
}

export function sortCassemsListItems<T extends { issuedAt: Date | string | null; oficioNumber: string }>(
  items: T[],
): T[] {
  return [...items].sort((a, b) => {
    const at = a.issuedAt ? new Date(a.issuedAt).getTime() : 0;
    const bt = b.issuedAt ? new Date(b.issuedAt).getTime() : 0;
    if (bt !== at) return bt - at;
    return b.oficioNumber.localeCompare(a.oficioNumber, undefined, { numeric: true });
  });
}

export function canCassemsSync(role: string): boolean {
  return role === 'admin' || role === 'editor';
}

export type CassemsAccess =
  | { ok: true; userId: string; role: string; canSync: boolean; companyId: string }
  | { ok: false; response: NextResponse };

export async function requireCassemsPage(): Promise<CassemsAccess> {
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
  if (!canAccessPage(user.role, user.allowedPages, CASSEMS_PAGE_PATH)) {
    return { ok: false, response: forbiddenResponse() };
  }

  const company = await getOrCreateSingleCompany(userId);
  return {
    ok: true,
    userId,
    role: user.role,
    canSync: canCassemsSync(user.role),
    companyId: company.id,
  };
}

export async function GET(_req?: Request) {
  try {
    const access = await requireCassemsPage();
    if (!access.ok) return access.response;

    const [rows, ingest] = await Promise.all([
      listCassemsAuthorizations(access.companyId),
      getCassemsIngestState(access.companyId),
    ]);

    const items = sortCassemsListItems(rows).map((row) => ({
      id: row.id,
      issuedAt: row.issuedAt,
      oficioNumber: row.oficioNumber,
      patientName: row.patientName,
      doctorName: row.doctorName,
      hospitalName: row.hospitalName,
      totalAmount: formatCassemsMoney(row.totalAmount),
      fileName: row.fileName,
      parseStatus: row.parseStatus,
    }));

    return NextResponse.json({
      lastCollectedAt: ingest?.lastSuccessAt ? ingest.lastSuccessAt.toISOString() : null,
      lastError: ingest?.lastError ?? null,
      canSync: access.canSync,
      items,
    });
  } catch (error) {
    log.error({ err: error }, 'Falha ao listar autorizações CASSEMS');
    return apiError(error, 'gestao/cassems');
  }
}
