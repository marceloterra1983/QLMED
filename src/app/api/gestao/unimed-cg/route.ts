import { NextResponse } from 'next/server';
import { apiError } from '@/lib/api-error';
import {
  getUnimedCgIngestState,
  listUnimedCgAuthorizations,
  listUnimedCgMatchedProcessIds,
} from '@/lib/unimed-cg/store';
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

    const [rows, deliveryRows, reversalRows, preRows, prazoRows, ingest, matchedProcessIds] =
      await Promise.all([
        listUnimedCgAuthorizations(access.companyId),
        listUnimedCgDeliveries(access.companyId),
        listUnimedCgReversals(access.companyId),
        listUnimedCgPreSolicitations(access.companyId),
        listUnimedCgInvoiceDeadlines(access.companyId),
        getUnimedCgIngestState(access.companyId),
        listUnimedCgMatchedProcessIds(access.companyId),
      ]);

    const matchedAuths = rows.filter((row) => row.billedMatchStatus === 'matched');
    const openAuths = rows.filter((row) => row.billedMatchStatus !== 'matched');

    const billing = sortUnimedCgListItems(openAuths).map((row) => ({
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
      billedMatchStatus: row.billedMatchStatus ?? null,
      billedInvoiceNumber: row.billedInvoiceNumber ?? null,
    }));

    const deliveries = sortUnimedCgListItems(
      deliveryRows.filter((row) => !matchedProcessIds.has(row.processId)),
    ).map((row) => ({
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

    const reversals = sortUnimedCgListItems(
      reversalRows.filter((row) => !matchedProcessIds.has(row.processId)),
    ).map((row) => ({
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

    const invoiceDeadlines = sortUnimedCgListItems(
      prazoRows.filter((row) => !matchedProcessIds.has(row.processId)),
    ).map((row) => ({
      id: row.id,
      processId: row.processId,
      patientName: row.patientName,
      receivedAt: row.receivedAt,
      fileName: row.fileName,
      parseStatus: row.parseStatus,
    }));

    const deliveryByProcess = new Map(deliveryRows.map((r) => [r.processId, r]));
    const reversalByProcess = new Map(reversalRows.map((r) => [r.processId, r]));
    const prazoByProcess = new Map(prazoRows.map((r) => [r.processId, r]));

    const billed = sortUnimedCgListItems(matchedAuths).map((row) => {
      const delivery = deliveryByProcess.get(row.processId);
      const reversal = reversalByProcess.get(row.processId);
      const prazo = prazoByProcess.get(row.processId);
      const related: Array<{
        kind: 'faturamento' | 'entrega' | 'reversao' | 'prazo';
        id: string;
        label: string;
        fileName: string;
        parseStatus: string;
        summary: string;
      }> = [
        {
          kind: 'faturamento',
          id: row.id,
          label: 'Faturamento',
          fileName: row.fileName,
          parseStatus: row.parseStatus,
          summary: [
            row.authorizationNumber ? `Aut. ${row.authorizationNumber}` : null,
            formatUnimedCgMoney(row.totalAmount),
          ]
            .filter(Boolean)
            .join(' · '),
        },
      ];
      if (delivery) {
        related.push({
          kind: 'entrega',
          id: delivery.id,
          label: 'Entrega',
          fileName: delivery.fileName,
          parseStatus: delivery.parseStatus,
          summary: [delivery.status, delivery.supplier].filter(Boolean).join(' · ') || '—',
        });
      }
      if (reversal) {
        related.push({
          kind: 'reversao',
          id: reversal.id,
          label: 'Reversão',
          fileName: reversal.fileName,
          parseStatus: reversal.parseStatus,
          summary: reversal.procedureType ?? reversal.authorizationNumber ?? '—',
        });
      }
      if (prazo) {
        related.push({
          kind: 'prazo',
          id: prazo.id,
          label: 'Prazo NF',
          fileName: prazo.fileName,
          parseStatus: prazo.parseStatus,
          summary: prazo.patientName ?? '—',
        });
      }
      return {
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
        billedInvoiceId: row.billedInvoiceId ?? null,
        billedInvoiceNumber: row.billedInvoiceNumber ?? null,
        billedMatchedAt: row.billedMatchedAt ?? null,
        billedMatchStatus: row.billedMatchStatus ?? null,
        related,
      };
    });

    return NextResponse.json({
      lastCollectedAt: ingest?.lastSuccessAt ? ingest.lastSuccessAt.toISOString() : null,
      lastError: ingest?.lastError ?? null,
      canSync: access.canSync,
      billing,
      deliveries,
      reversals,
      preSolicitations,
      invoiceDeadlines,
      billed,
    });
  } catch (error) {
    log.error({ err: error }, 'Falha ao listar autorizações Unimed CG');
    return apiError(error, 'gestao/unimed-cg');
  }
}
