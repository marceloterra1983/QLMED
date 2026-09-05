import { Decimal } from '@prisma/client-runtime-utils';
import type { UnimedCgParseStatus } from '@prisma/client';
import prisma from '@/lib/prisma';
import { isUniqueViolation } from '@/lib/prisma-errors';
import { centsToDecimal, formatMoneyDecimal } from '@/lib/money';
import type { UnimedCgParseStatus as DomainParseStatus } from './constants';

export type UnimedCgListItem = {
  id: string;
  processId: string;
  authorizationNumber: string | null;
  procedureDate: string | null;
  location: string | null;
  totalAmount: string;
  receivedAt: string;
  fileName: string;
  parseStatus: UnimedCgParseStatus;
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
      location: true,
      totalAmount: true,
      receivedAt: true,
      fileName: true,
      parseStatus: true,
    },
  });

  return rows.map((row) => ({
    id: row.id,
    processId: row.processId,
    authorizationNumber: row.authorizationNumber,
    procedureDate: row.procedureDate ? row.procedureDate.toISOString() : null,
    location: row.location,
    totalAmount: moneyString(row.totalAmount),
    receivedAt: row.receivedAt.toISOString(),
    fileName: row.fileName,
    parseStatus: row.parseStatus,
  }));
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
    location: row.location,
    totalAmount: moneyString(row.totalAmount),
    receivedAt: row.receivedAt.toISOString(),
    fileName: row.fileName,
    parseStatus: row.parseStatus,
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
