import type { UnimedCgParseStatus } from '@prisma/client';
import prisma from '@/lib/prisma';
import { isUniqueViolation } from '@/lib/prisma-errors';
import type { UnimedCgParseStatus as DomainParseStatus } from './constants';

export type UnimedCgReversalListItem = {
  id: string;
  processId: string;
  authorizationNumber: string | null;
  procedureDate: string | null;
  patientName: string | null;
  location: string | null;
  procedureType: string | null;
  receivedAt: string;
  fileName: string;
  parseStatus: UnimedCgParseStatus;
};

export type UnimedCgReversalDetailItem = UnimedCgReversalListItem & {
  oneDriveItemId: string;
  sourceUrl: string | null;
};

export async function listUnimedCgReversals(companyId: string): Promise<UnimedCgReversalListItem[]> {
  const rows = await prisma.unimedCgProcessReversal.findMany({
    where: { companyId },
    orderBy: [{ receivedAt: 'desc' }, { processId: 'desc' }],
    select: {
      id: true,
      processId: true,
      authorizationNumber: true,
      procedureDate: true,
      patientName: true,
      location: true,
      procedureType: true,
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
    patientName: row.patientName,
    location: row.location,
    procedureType: row.procedureType,
    receivedAt: row.receivedAt.toISOString(),
    fileName: row.fileName,
    parseStatus: row.parseStatus,
  }));
}

export async function getUnimedCgReversal(
  companyId: string,
  id: string,
): Promise<UnimedCgReversalDetailItem | null> {
  const row = await prisma.unimedCgProcessReversal.findFirst({
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
    procedureType: row.procedureType,
    receivedAt: row.receivedAt.toISOString(),
    fileName: row.fileName,
    parseStatus: row.parseStatus,
    oneDriveItemId: row.oneDriveItemId,
    sourceUrl: row.sourceUrl,
  };
}

export type PersistReversalConfirmedInput = {
  companyId: string;
  processId: string;
  authorizationNumber: string | null;
  procedureDate: Date | null;
  patientName: string | null;
  location: string | null;
  procedureType: string | null;
  parseStatus: DomainParseStatus;
  fileName: string;
  oneDriveItemId: string;
  sourceUrl: string | null;
  receivedAt: Date;
  internetMessageId?: string;
  mailbox?: string;
  graphMessageId?: string;
};

export async function persistConfirmedReversal(
  input: PersistReversalConfirmedInput,
): Promise<{ id: string }> {
  return prisma.$transaction(async (tx) => {
    const created = await tx.unimedCgProcessReversal.create({
      data: {
        companyId: input.companyId,
        processId: input.processId,
        authorizationNumber: input.authorizationNumber,
        procedureDate: input.procedureDate,
        patientName: input.patientName,
        location: input.location,
        procedureType: input.procedureType,
        oneDriveItemId: input.oneDriveItemId,
        fileName: input.fileName,
        sourceUrl: input.sourceUrl,
        parseStatus: input.parseStatus,
        receivedAt: input.receivedAt,
      },
      select: { id: true },
    });
    if (input.internetMessageId && input.mailbox && input.graphMessageId) {
      await tx.unimedCgProcessReversalSourceMessage.create({
        data: {
          companyId: input.companyId,
          reversalId: created.id,
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

export async function persistUpgradeReversal(
  input: PersistReversalConfirmedInput & { reversalId: string },
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.unimedCgProcessReversal.update({
      where: { id: input.reversalId },
      data: {
        authorizationNumber: input.authorizationNumber,
        procedureDate: input.procedureDate,
        patientName: input.patientName,
        location: input.location,
        procedureType: input.procedureType,
        oneDriveItemId: input.oneDriveItemId,
        fileName: input.fileName,
        sourceUrl: input.sourceUrl,
        parseStatus: input.parseStatus,
        receivedAt: input.receivedAt,
      },
    });
    if (input.internetMessageId && input.mailbox && input.graphMessageId) {
      await tx.unimedCgProcessReversalSourceMessage.create({
        data: {
          companyId: input.companyId,
          reversalId: input.reversalId,
          mailbox: input.mailbox,
          graphMessageId: input.graphMessageId,
          internetMessageId: input.internetMessageId,
          receivedAt: input.receivedAt,
        },
      });
    }
  });
}

export async function persistReversalSourceOnly(input: {
  companyId: string;
  reversalId: string;
  mailbox: string;
  graphMessageId: string;
  internetMessageId: string;
  receivedAt: Date;
}): Promise<void> {
  try {
    await prisma.unimedCgProcessReversalSourceMessage.create({
      data: {
        companyId: input.companyId,
        reversalId: input.reversalId,
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

export const prismaUnimedCgReversalStore = {
  async findSourceByInternetMessageId(companyId: string, internetMessageId: string) {
    return prisma.unimedCgProcessReversalSourceMessage.findUnique({
      where: { companyId_internetMessageId: { companyId, internetMessageId } },
      select: { id: true, reversalId: true, whatsappSentAt: true },
    });
  },
  async markWhatsAppSent(companyId: string, internetMessageId: string, messageId: string | null) {
    await prisma.unimedCgProcessReversalSourceMessage.updateMany({
      where: { companyId, internetMessageId },
      data: { whatsappSentAt: new Date(), whatsappMessageId: messageId },
    });
  },
  async findByProcessId(companyId: string, processId: string) {
    return prisma.unimedCgProcessReversal.findUnique({
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
  persistConfirmed: persistConfirmedReversal,
  persistUpgrade: persistUpgradeReversal,
  persistSourceOnly: persistReversalSourceOnly,
};
