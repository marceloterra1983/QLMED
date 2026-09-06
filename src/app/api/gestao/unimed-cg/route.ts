import { NextResponse } from 'next/server';
import { apiError } from '@/lib/api-error';
import { getUnimedCgIngestState, listUnimedCgAuthorizations } from '@/lib/unimed-cg/store';
import { listUnimedCgDeliveries } from '@/lib/unimed-cg/delivery-store';
import { listUnimedCgInvoiceDeadlines } from '@/lib/unimed-cg/invoice-deadline-store';
import { listUnimedCgPreSolicitations } from '@/lib/unimed-cg/pre-solicitation-store';
import { listUnimedCgReversals } from '@/lib/unimed-cg/reversal-store';
import { formatUnimedCgMoney, requireUnimedCgPage, sortUnimedCgListItems } from '@/lib/unimed-cg/access';
import { createLogger } from '@/lib/logger';

const log = createLogger('gestao/unimed-cg');

export async function GET(_req: Request) {
  try {
    const access = await requireUnimedCgPage();
    if (!access.ok) return access.response;

    const [rows, deliveryRows, reversalRows, preRows, prazoRows, ingest] = await Promise.all([
      listUnimedCgAuthorizations(access.companyId),
      listUnimedCgDeliveries(access.companyId),
      listUnimedCgReversals(access.companyId),
      listUnimedCgPreSolicitations(access.companyId),
      listUnimedCgInvoiceDeadlines(access.companyId),
      getUnimedCgIngestState(access.companyId),
    ]);

    const billing = sortUnimedCgListItems(rows).map((row) => ({
      id: row.id,
      processId: row.processId,
      authorizationNumber: row.authorizationNumber,
      procedureDate: row.procedureDate,
      patientName: row.patientName,
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
      patientName: row.patientName,
      supplier: row.supplier,
      receivedAt: row.receivedAt,
      fileName: row.fileName,
      parseStatus: row.parseStatus,
    }));

    const reversals = sortUnimedCgListItems(reversalRows).map((row) => ({
      id: row.id,
      processId: row.processId,
      authorizationNumber: row.authorizationNumber,
      procedureDate: row.procedureDate,
      patientName: row.patientName,
      location: row.location,
      procedureType: row.procedureType,
      receivedAt: row.receivedAt,
      fileName: row.fileName,
      parseStatus: row.parseStatus,
    }));

    const preSolicitations = sortUnimedCgListItems(
      preRows.map((row) => ({ ...row, processId: row.preSolicitationId })),
    ).map((row) => ({
      id: row.id,
      preSolicitationId: row.preSolicitationId,
      patientName: row.patientName,
      procedureType: row.procedureType,
      quoteDeadlineDays: row.quoteDeadlineDays,
      receivedAt: row.receivedAt,
      fileName: row.fileName,
      parseStatus: row.parseStatus,
    }));

    const invoiceDeadlines = sortUnimedCgListItems(prazoRows).map((row) => ({
      id: row.id,
      processId: row.processId,
      patientName: row.patientName,
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
      reversals,
      preSolicitations,
      invoiceDeadlines,
    });
  } catch (error) {
    log.error({ err: error }, 'Falha ao listar autorizações Unimed CG');
    return apiError(error, 'gestao/unimed-cg');
  }
}
