import { Decimal } from '@prisma/client-runtime-utils';
import type { UnimedCgParseStatus } from '@prisma/client';
import prisma from '@/lib/prisma';
import { isUniqueViolation } from '@/lib/prisma-errors';
import { centsToDecimal, formatMoneyDecimal } from '@/lib/money';
import type { UnimedCgParseStatus as DomainParseStatus } from './constants';
import { isUnimedCgBilledStatus } from './billing-match';
export { isUnimedCgBilledStatus };

export type UnimedCgListItem = {
  id: string;
  processId: string;
  authorizationNumber: string | null;
  procedureDate: string | null;
  patientName: string | null;
  location: string | null;
  totalAmount: string;
  receivedAt: string;
  fileName: string;
  parseStatus: UnimedCgParseStatus;
  billedInvoiceId?: string | null;
  billedInvoiceNumber?: string | null;
  billedMatchedAt?: string | null;
  billedMatchStatus?: string | null;
  billedCandidateInvoices?: Array<{ id: string; number: string }> | null;
};

export type UnimedCgDetailItem = UnimedCgListItem & {
  oneDriveItemId: string;
  sourceUrl: string | null;
};

function moneyString(value: Decimal): string {
  return formatMoneyDecimal(value);
}

export async function listUnimedCgAuthorizations(companyId: string): Promise<UnimedCgListItem[]> {
  const rows = await prisma.unimedCgAuthorization.findMany({
    where: { companyId },
    orderBy: [{ receivedAt: 'desc' }, { processId: 'desc' }],
    select: {
      id: true,
      processId: true,
      authorizationNumber: true,
      procedureDate: true,
      patientName: true,
      location: true,
      totalAmount: true,
      receivedAt: true,
      fileName: true,
      parseStatus: true,
      billedInvoiceId: true,
      billedInvoiceNumber: true,
      billedMatchedAt: true,
      billedMatchStatus: true,
      billedCandidateInvoices: true,
    },
  });

  return rows.map((row) => ({
    id: row.id,
    processId: row.processId,
    authorizationNumber: row.authorizationNumber,
    procedureDate: row.procedureDate ? row.procedureDate.toISOString() : null,
    patientName: row.patientName,
    location: row.location,
    totalAmount: moneyString(row.totalAmount),
    receivedAt: row.receivedAt.toISOString(),
    fileName: row.fileName,
    parseStatus: row.parseStatus,
    billedInvoiceId: row.billedInvoiceId,
    billedInvoiceNumber: row.billedInvoiceNumber,
    billedMatchedAt: row.billedMatchedAt ? row.billedMatchedAt.toISOString() : null,
    billedMatchStatus: row.billedMatchStatus,
    billedCandidateInvoices: parseBilledCandidates(row.billedCandidateInvoices),
  }));
}

function parseBilledCandidates(
  value: unknown,
): Array<{ id: string; number: string }> | null {
  if (!Array.isArray(value)) return null;
  const out: Array<{ id: string; number: string }> = [];
  for (const item of value) {
    if (!item || typeof item !== 'object') continue;
    const id = (item as { id?: unknown }).id;
    const number = (item as { number?: unknown }).number;
    if (typeof id === 'string' && typeof number === 'string') {
      out.push({ id, number });
    }
  }
  return out.length ? out : null;
}

/** Autorizações matched ou ambiguous (card PROCESSOS FATURADOS). */
export async function listUnimedCgBilledAuthorizations(companyId: string): Promise<UnimedCgListItem[]> {
  const all = await listUnimedCgAuthorizations(companyId);
  return all.filter((row) => isUnimedCgBilledStatus(row.billedMatchStatus));
}

/** processIds em Faturados (matched | ambiguous) — filtrar das seções de origem. */
export async function listUnimedCgMatchedProcessIds(companyId: string): Promise<Set<string>> {
  const rows = await prisma.unimedCgAuthorization.findMany({
    where: { companyId, billedMatchStatus: { in: ['matched', 'ambiguous'] } },
    select: { processId: true },
  });
  return new Set(rows.map((r) => r.processId));
}

export async function getUnimedCgAuthorization(
  companyId: string,
  id: string,
): Promise<UnimedCgDetailItem | null> {
  const row = await prisma.unimedCgAuthorization.findFirst({
    where: { id, companyId },
  });
  if (!row) return null;

  return {
    id: row.id,
    processId: row.processId,
    authorizationNumber: row.authorizationNumber,
    procedureDate: row.procedureDate ? row.procedureDate.toISOString() : null,
    patientName: row.patientName,
    location: row.location,
    totalAmount: moneyString(row.totalAmount),
    receivedAt: row.receivedAt.toISOString(),
    fileName: row.fileName,
    parseStatus: row.parseStatus,
    billedInvoiceId: row.billedInvoiceId,
    billedInvoiceNumber: row.billedInvoiceNumber,
    billedMatchedAt: row.billedMatchedAt ? row.billedMatchedAt.toISOString() : null,
    billedMatchStatus: row.billedMatchStatus,
    billedCandidateInvoices: parseBilledCandidates(row.billedCandidateInvoices),
    oneDriveItemId: row.oneDriveItemId,
    sourceUrl: row.sourceUrl,
  };
}

export async function getUnimedCgIngestState(companyId: string) {
  return prisma.unimedCgIngestState.findUnique({ where: { companyId } });
}

export type PersistConfirmedInput = {
  companyId: string;
  processId: string;
  authorizationNumber: string | null;
  procedureDate: Date | null;
  patientName: string | null;
  location: string | null;
  totalCents: number;
  parseStatus: DomainParseStatus;
  fileName: string;
  oneDriveItemId: string;
  sourceUrl: string | null;
  receivedAt: Date;
  internetMessageId?: string;
  mailbox?: string;
  graphMessageId?: string;
};

export async function persistConfirmedAuthorization(input: PersistConfirmedInput): Promise<{ id: string }> {
  return prisma.$transaction(async (tx) => {
    const created = await tx.unimedCgAuthorization.create({
      data: {
        companyId: input.companyId,
        processId: input.processId,
        authorizationNumber: input.authorizationNumber,
        procedureDate: input.procedureDate,
        patientName: input.patientName,
        location: input.location,
        totalAmount: centsToDecimal(input.totalCents),
        oneDriveItemId: input.oneDriveItemId,
        fileName: input.fileName,
        sourceUrl: input.sourceUrl,
        parseStatus: input.parseStatus,
        receivedAt: input.receivedAt,
      },
      select: { id: true },
    });
    if (input.internetMessageId && input.mailbox && input.graphMessageId) {
      await tx.unimedCgSourceMessage.create({
        data: {
          companyId: input.companyId,
          authorizationId: created.id,
          mailbox: input.mailbox,
          graphMessageId: input.graphMessageId,
          internetMessageId: input.internetMessageId,
          receivedAt: input.receivedAt,
        },
      });
    }
    return created;
  });
}

export async function persistUpgradeAuthorization(
  input: PersistConfirmedInput & { authorizationId: string },
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.unimedCgAuthorization.update({
      where: { id: input.authorizationId },
      data: {
        authorizationNumber: input.authorizationNumber,
        procedureDate: input.procedureDate,
        patientName: input.patientName,
        location: input.location,
        totalAmount: centsToDecimal(input.totalCents),
        oneDriveItemId: input.oneDriveItemId,
        fileName: input.fileName,
        sourceUrl: input.sourceUrl,
        parseStatus: input.parseStatus,
      },
    });
    if (input.internetMessageId && input.mailbox && input.graphMessageId) {
      await tx.unimedCgSourceMessage.create({
        data: {
          companyId: input.companyId,
          authorizationId: input.authorizationId,
          mailbox: input.mailbox,
          graphMessageId: input.graphMessageId,
          internetMessageId: input.internetMessageId,
          receivedAt: input.receivedAt,
        },
      });
    }
  });
}

export async function persistSourceOnly(input: {
  companyId: string;
  authorizationId: string;
  mailbox: string;
  graphMessageId: string;
  internetMessageId: string;
  receivedAt: Date;
}): Promise<void> {
  try {
    await prisma.unimedCgSourceMessage.create({
      data: {
        companyId: input.companyId,
        authorizationId: input.authorizationId,
        mailbox: input.mailbox,
        graphMessageId: input.graphMessageId,
        internetMessageId: input.internetMessageId,
        receivedAt: input.receivedAt,
      },
    });
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
  }
}

export const prismaUnimedCgStore = {
  async findSourceByInternetMessageId(companyId: string, internetMessageId: string) {
    return prisma.unimedCgSourceMessage.findUnique({
      where: { companyId_internetMessageId: { companyId, internetMessageId } },
      select: { id: true, authorizationId: true, whatsappSentAt: true },
    });
  },
  async markWhatsAppSent(companyId: string, internetMessageId: string, messageId: string | null) {
    await prisma.unimedCgSourceMessage.updateMany({
      where: { companyId, internetMessageId },
      data: { whatsappSentAt: new Date(), whatsappMessageId: messageId },
    });
  },
  async findByProcessId(companyId: string, processId: string) {
    return prisma.unimedCgAuthorization.findUnique({
      where: { companyId_processId: { companyId, processId } },
      select: {
        id: true,
        processId: true,
        parseStatus: true,
        oneDriveItemId: true,
      },
    });
  },
  persistConfirmed: persistConfirmedAuthorization,
  persistUpgrade: persistUpgradeAuthorization,
  persistSourceOnly,
  async loadIngestState(companyId: string) {
    const row = await prisma.unimedCgIngestState.findUnique({ where: { companyId } });
    return row
      ? {
          lastSuccessAt: row.lastSuccessAt,
          backfillCompletedAt: row.backfillCompletedAt,
          lastError: row.lastError,
        }
      : null;
  },
  async saveIngestState(
    companyId: string,
    patch: { lastSuccessAt?: Date | null; backfillCompletedAt?: Date | null; lastError?: string | null },
  ) {
    await prisma.unimedCgIngestState.upsert({
      where: { companyId },
      create: {
        companyId,
        lastSuccessAt: patch.lastSuccessAt ?? null,
        backfillCompletedAt: patch.backfillCompletedAt ?? null,
        lastError: patch.lastError ?? null,
        lastErrorAt: patch.lastError ? new Date() : null,
      },
      update: {
        ...(patch.lastSuccessAt !== undefined ? { lastSuccessAt: patch.lastSuccessAt } : {}),
        ...(patch.backfillCompletedAt !== undefined ? { backfillCompletedAt: patch.backfillCompletedAt } : {}),
        ...(patch.lastError !== undefined
          ? { lastError: patch.lastError, lastErrorAt: patch.lastError ? new Date() : null }
          : {}),
      },
    });
  },
};
