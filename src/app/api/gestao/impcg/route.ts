import { NextResponse } from 'next/server';
import { apiError } from '@/lib/api-error';
import { getImpcgIngestState, listImpcgAuthorizations } from '@/lib/impcg/store';
import { formatImpcgMoney, requireImpcgPage, sortImpcgListItems } from '@/lib/impcg/access';
import { createLogger } from '@/lib/logger';

const log = createLogger('gestao/impcg');

export async function GET(_req?: Request) {
  try {
    const access = await requireImpcgPage();
    if (!access.ok) return access.response;

    const [rows, ingest] = await Promise.all([
      listImpcgAuthorizations(access.companyId),
      getImpcgIngestState(access.companyId),
    ]);

    const items = sortImpcgListItems(rows).map((row) => ({
      id: row.id,
      issuedAt: row.issuedAt,
      oficioNumber: row.oficioNumber,
      patientName: row.patientName,
      doctorName: row.doctorName,
      hospitalName: row.hospitalName,
      totalAmount: formatImpcgMoney(row.totalAmount),
      fileName: row.fileName,
      parseStatus: row.parseStatus,
      parseMissingReason: row.parseMissingReason ?? null,
    }));

    return NextResponse.json({
      lastCollectedAt: ingest?.lastSuccessAt ? ingest.lastSuccessAt.toISOString() : null,
      lastError: ingest?.lastError ?? null,
      canSync: access.canSync,
      canEdit: access.canSync,
      items,
    });
  } catch (error) {
    log.error({ err: error }, 'Falha ao listar autorizações IMPCG');
    return apiError(error, 'gestao/impcg');
  }
}
