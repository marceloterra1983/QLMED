import { NextResponse } from 'next/server';
import { forbiddenResponse, requireAuth, unauthorizedResponse } from '@/lib/auth';
import { apiError } from '@/lib/api-error';
import { getUnimedCgIngestState, listUnimedCgAuthorizations } from '@/lib/unimed-cg/store';
import { listUnimedCgDeliveries } from '@/lib/unimed-cg/delivery-store';
import { formatUnimedCgMoney, requireUnimedCgPage, sortUnimedCgListItems } from '@/lib/unimed-cg/access';
import { createLogger } from '@/lib/logger';

const log = createLogger('gestao/unimed-cg');

export async function GET(_req: Request) {
  try {
    await requireAuth();
  } catch (error) {
    if (error instanceof Error && error.message === 'FORBIDDEN') return forbiddenResponse();
    return unauthorizedResponse();
  }

  try {
    const access = await requireUnimedCgPage();
    if (!access.ok) return access.response;

    const [rows, deliveryRows, ingest] = await Promise.all([
      listUnimedCgAuthorizations(access.companyId),
      listUnimedCgDeliveries(access.companyId),
      getUnimedCgIngestState(access.companyId),
    ]);

    const billing = sortUnimedCgListItems(rows).map((row) => ({
      id: row.id,
      processId: row.processId,
      authorizationNumber: row.authorizationNumber,
      procedureDate: row.procedureDate,
      location: row.location,
      totalAmount: formatUnimedCgMoney(row.totalAmount),
      receivedAt: row.receivedAt,
      fileName: row.fileName,
      parseStatus: row.parseStatus,
    }));

    const deliveries = sortUnimedCgListItems(deliveryRows).map((row) => ({
      id: row.id,
      processId: row.processId,
      principalAuthorization: row.principalAuthorization,
      status: row.status,
      authorizedAt: row.authorizedAt,
      supplier: row.supplier,
      receivedAt: row.receivedAt,
      fileName: row.fileName,
      parseStatus: row.parseStatus,
    }));

    return NextResponse.json({
      lastCollectedAt: ingest?.lastSuccessAt ? ingest.lastSuccessAt.toISOString() : null,
      lastError: ingest?.lastError ?? null,
      canSync: access.canSync,
      billing,
      deliveries,
    });
  } catch (error) {
    log.error({ err: error }, 'Falha ao listar autorizações Unimed CG');
    return apiError(error, 'gestao/unimed-cg');
  }
}
