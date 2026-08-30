import { NextResponse } from 'next/server';
import { apiError } from '@/lib/api-error';
import { getCassemsIngestState, listCassemsAuthorizations } from '@/lib/cassems/store';
import { formatCassemsMoney, requireCassemsPage, sortCassemsListItems } from '@/lib/cassems/access';
import { createLogger } from '@/lib/logger';

const log = createLogger('gestao/cassems');

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
      parseMissingReason: row.parseMissingReason ?? null,
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
