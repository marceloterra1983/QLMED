import prisma from '@/lib/prisma';
import { createLogger } from '@/lib/logger';

const log = createLogger('unimed-cg/backfill-patient-names');

export const UNIMED_CG_PATIENT_NAME_BACKFILL_LIMIT = 12;

export type PatientNameFetch = (processId: string) => Promise<string | null>;

export type BackfillPatientNamesResult = {
  copiedFromRelated: number;
  updatedFromPortal: number;
  missed: number;
};

function isBlank(name: string | null | undefined): boolean {
  return !name || !name.trim();
}

/**
 * Rows already ingested with existingSource are skipped forever by ingest.
 * This fills patientName gaps incrementally each tick (portal session reuse).
 */
export async function backfillMissingUnimedCgPatientNames(input: {
  companyId: string;
  fetchBeneficiario: PatientNameFetch;
  limitPerKind?: number;
}): Promise<BackfillPatientNamesResult> {
  const limit = Math.max(
    0,
    Math.min(input.limitPerKind ?? UNIMED_CG_PATIENT_NAME_BACKFILL_LIMIT, 50),
  );
  let copiedFromRelated = 0;
  let updatedFromPortal = 0;
  let missed = 0;

  // 1) Copy known names from reversal → auth/delivery (same processId)
  const reversals = await prisma.unimedCgProcessReversal.findMany({
    where: {
      companyId: input.companyId,
      patientName: { not: null },
    },
    select: { processId: true, patientName: true },
  });
  for (const row of reversals) {
    const name = row.patientName?.trim();
    if (!name) continue;
    const auth = await prisma.unimedCgAuthorization.updateMany({
      where: {
        companyId: input.companyId,
        processId: row.processId,
        OR: [{ patientName: null }, { patientName: '' }],
      },
      data: { patientName: name },
    });
    const delivery = await prisma.unimedCgDeliveryAuthorization.updateMany({
      where: {
        companyId: input.companyId,
        processId: row.processId,
        OR: [{ patientName: null }, { patientName: '' }],
      },
      data: { patientName: name },
    });
    copiedFromRelated += auth.count + delivery.count;
  }

  // 2) Portal fetch for remaining nulls (auth → delivery → pré), capped per kind
  const kinds: Array<{
    label: 'authorization' | 'delivery' | 'pre_solicitation';
    list: () => Promise<Array<{ id: string; processId: string }>>;
    update: (id: string, patientName: string) => Promise<void>;
  }> = [
    {
      label: 'authorization',
      list: async () =>
        prisma.unimedCgAuthorization.findMany({
          where: {
            companyId: input.companyId,
            OR: [{ patientName: null }, { patientName: '' }],
          },
          orderBy: { createdAt: 'asc' },
          take: limit,
          select: { id: true, processId: true },
        }),
      update: async (id, patientName) => {
        await prisma.unimedCgAuthorization.update({
          where: { id },
          data: { patientName },
        });
      },
    },
    {
      label: 'delivery',
      list: async () =>
        prisma.unimedCgDeliveryAuthorization.findMany({
          where: {
            companyId: input.companyId,
            OR: [{ patientName: null }, { patientName: '' }],
          },
          orderBy: { createdAt: 'asc' },
          take: limit,
          select: { id: true, processId: true },
        }),
      update: async (id, patientName) => {
        await prisma.unimedCgDeliveryAuthorization.update({
          where: { id },
          data: { patientName },
        });
      },
    },
    {
      label: 'pre_solicitation',
      list: async () => {
        const rows = await prisma.unimedCgPreSolicitation.findMany({
          where: {
            companyId: input.companyId,
            OR: [{ patientName: null }, { patientName: '' }],
          },
          orderBy: { createdAt: 'asc' },
          take: limit,
          select: { id: true, preSolicitationId: true },
        });
        return rows.map((r) => ({ id: r.id, processId: r.preSolicitationId }));
      },
      update: async (id, patientName) => {
        await prisma.unimedCgPreSolicitation.update({
          where: { id },
          data: { patientName },
        });
      },
    },
  ];

  for (const kind of kinds) {
    const rows = await kind.list();
    for (const row of rows) {
      if (isBlank(row.processId)) {
        missed += 1;
        continue;
      }
      try {
        const name = (await input.fetchBeneficiario(row.processId))?.trim() || null;
        if (!name) {
          missed += 1;
          log.info(
            { kind: kind.label, processId: row.processId },
            'unimed_cg_patient_name_backfill_miss',
          );
          continue;
        }
        await kind.update(row.id, name);
        updatedFromPortal += 1;
        log.info(
          { kind: kind.label, processId: row.processId },
          'unimed_cg_patient_name_backfill_ok',
        );
      } catch (error) {
        missed += 1;
        log.warn(
          {
            kind: kind.label,
            processId: row.processId,
            err: error instanceof Error ? error.message.slice(0, 200) : 'backfill',
          },
          'unimed_cg_patient_name_backfill_failed',
        );
      }
    }
  }

  if (copiedFromRelated || updatedFromPortal || missed) {
    log.info(
      { copiedFromRelated, updatedFromPortal, missed },
      'unimed_cg_patient_name_backfill_done',
    );
  }

  return { copiedFromRelated, updatedFromPortal, missed };
}
