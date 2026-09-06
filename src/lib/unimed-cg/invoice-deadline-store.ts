import type { UnimedCgParseStatus } from '@prisma/client';
import prisma from '@/lib/prisma';
import { isUniqueViolation } from '@/lib/prisma-errors';
import type { UnimedCgParseStatus as DomainParseStatus } from './constants';

export type UnimedCgInvoiceDeadlineListItem = {
  id: string;
  processId: string;
  patientName: string | null;
  receivedAt: string;
  fileName: string;
  parseStatus: UnimedCgParseStatus;
};

export type UnimedCgInvoiceDeadlineDetailItem = UnimedCgInvoiceDeadlineListItem & {
  oneDriveItemId: string;
  sourceUrl: string | null;
};

export async function listUnimedCgInvoiceDeadlines(
  companyId: string,
): Promise<UnimedCgInvoiceDeadlineListItem[]> {
  const rows = await prisma.unimedCgInvoiceDeadline.findMany({
    where: { companyId },
    orderBy: [{ receivedAt: 'desc' }, { processId: 'desc' }],
    select: {
      id: true,
      processId: true,
      patientName: true,
      receivedAt: true,
      fileName: true,
      parseStatus: true,
    },
  });

  return rows.map((row) => ({
    id: row.id,
    processId: row.processId,
    patientName: row.patientName,
    receivedAt: row.receivedAt.toISOString(),
    fileName: row.fileName,
    parseStatus: row.parseStatus,
  }));
}

export async function getUnimedCgInvoiceDeadline(
  companyId: string,
  id: string,
): Promise<UnimedCgInvoiceDeadlineDetailItem | null> {
  const row = await prisma.unimedCgInvoiceDeadline.findFirst({
    where: { id, companyId },
  });
  if (!row) return null;

  return {
    id: row.id,
    processId: row.processId,
    patientName: row.patientName,
    receivedAt: row.receivedAt.toISOString(),
    fileName: row.fileName,
    parseStatus: row.parseStatus,
    oneDriveItemId: row.oneDriveItemId,
    sourceUrl: row.sourceUrl,
  };
}

export type PersistInvoiceDeadlineConfirmedInput = {
  companyId: string;
  processId: string;
  patientName: string | null;
  parseStatus: DomainParseStatus;
  fileName: string;
  oneDriveItemId: string;
  sourceUrl: string | null;
  receivedAt: Date;
  internetMessageId?: string;
  mailbox?: string;
  graphMessageId?: string;
};

export async function persistConfirmedInvoiceDeadline(
  input: PersistInvoiceDeadlineConfirmedInput,
): Promise<{ id: string }> {
  return prisma.$transaction(async (tx) => {
    const created = await tx.unimedCgInvoiceDeadline.create({
      data: {
        companyId: input.companyId,
        processId: input.processId,
        patientName: input.patientName,
        oneDriveItemId: input.oneDriveItemId,
        fileName: input.fileName,
        sourceUrl: input.sourceUrl,
        parseStatus: input.parseStatus,
        receivedAt: input.receivedAt,
      },
      select: { id: true },
    });
    if (input.internetMessageId && input.mailbox && input.graphMessageId) {
      await tx.unimedCgInvoiceDeadlineSourceMessage.create({
        data: {
          companyId: input.companyId,
          deadlineId: created.id,
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

export async function persistUpgradeInvoiceDeadline(
  input: PersistInvoiceDeadlineConfirmedInput & { deadlineId: string },
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.unimedCgInvoiceDeadline.update({
      where: { id: input.deadlineId },
      data: {
        patientName: input.patientName,
        oneDriveItemId: input.oneDriveItemId,
        fileName: input.fileName,
        sourceUrl: input.sourceUrl,
        parseStatus: input.parseStatus,
        receivedAt: input.receivedAt,
      },
    });
    if (input.internetMessageId && input.mailbox && input.graphMessageId) {
      await tx.unimedCgInvoiceDeadlineSourceMessage.create({
        data: {
          companyId: input.companyId,
          deadlineId: input.deadlineId,
          mailbox: input.mailbox,
          graphMessageId: input.graphMessageId,
          internetMessageId: input.internetMessageId,
          receivedAt: input.receivedAt,
        },
      });
    }
  });
}

export async function persistInvoiceDeadlineSourceOnly(input: {
  companyId: string;
  deadlineId: string;
  mailbox: string;
  graphMessageId: string;
  internetMessageId: string;
  receivedAt: Date;
}): Promise<void> {
  try {
    await prisma.unimedCgInvoiceDeadlineSourceMessage.create({
      data: {
        companyId: input.companyId,
        deadlineId: input.deadlineId,
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

export const prismaUnimedCgInvoiceDeadlineStore = {
  async findSourceByInternetMessageId(companyId: string, internetMessageId: string) {
    return prisma.unimedCgInvoiceDeadlineSourceMessage.findUnique({
      where: { companyId_internetMessageId: { companyId, internetMessageId } },
      select: { id: true, deadlineId: true, whatsappSentAt: true },
    });
  },
  async markWhatsAppSent(companyId: string, internetMessageId: string, messageId: string | null) {
    await prisma.unimedCgInvoiceDeadlineSourceMessage.updateMany({
      where: { companyId, internetMessageId },
      data: { whatsappSentAt: new Date(), whatsappMessageId: messageId },
    });
  },
  async findByProcessId(companyId: string, processId: string) {
    return prisma.unimedCgInvoiceDeadline.findUnique({
      where: { companyId_processId: { companyId, processId } },
      select: {
        id: true,
        processId: true,
        parseStatus: true,
        oneDriveItemId: true,
        receivedAt: true,
      },
    });
  },
  persistConfirmed: persistConfirmedInvoiceDeadline,
  persistUpgrade: persistUpgradeInvoiceDeadline,
  persistSourceOnly: persistInvoiceDeadlineSourceOnly,
};
