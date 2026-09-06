import type { UnimedCgParseStatus } from '@prisma/client';
import prisma from '@/lib/prisma';
import { isUniqueViolation } from '@/lib/prisma-errors';
import type { UnimedCgParseStatus as DomainParseStatus } from './constants';

export type UnimedCgPreSolicitationListItem = {
  id: string;
  preSolicitationId: string;
  patientName: string | null;
  procedureType: string | null;
  quoteDeadlineDays: number | null;
  receivedAt: string;
  fileName: string;
  parseStatus: UnimedCgParseStatus;
};

export type UnimedCgPreSolicitationDetailItem = UnimedCgPreSolicitationListItem & {
  oneDriveItemId: string;
  sourceUrl: string | null;
};

export async function listUnimedCgPreSolicitations(
  companyId: string,
): Promise<UnimedCgPreSolicitationListItem[]> {
  const rows = await prisma.unimedCgPreSolicitation.findMany({
    where: { companyId },
    orderBy: [{ receivedAt: 'desc' }, { preSolicitationId: 'desc' }],
    select: {
      id: true,
      preSolicitationId: true,
      patientName: true,
      procedureType: true,
      quoteDeadlineDays: true,
      receivedAt: true,
      fileName: true,
      parseStatus: true,
    },
  });

  return rows.map((row) => ({
    id: row.id,
    preSolicitationId: row.preSolicitationId,
    patientName: row.patientName,
    procedureType: row.procedureType,
    quoteDeadlineDays: row.quoteDeadlineDays,
    receivedAt: row.receivedAt.toISOString(),
    fileName: row.fileName,
    parseStatus: row.parseStatus,
  }));
}

export async function getUnimedCgPreSolicitation(
  companyId: string,
  id: string,
): Promise<UnimedCgPreSolicitationDetailItem | null> {
  const row = await prisma.unimedCgPreSolicitation.findFirst({
    where: { id, companyId },
  });
  if (!row) return null;

  return {
    id: row.id,
    preSolicitationId: row.preSolicitationId,
    patientName: row.patientName,
    procedureType: row.procedureType,
    quoteDeadlineDays: row.quoteDeadlineDays,
    receivedAt: row.receivedAt.toISOString(),
    fileName: row.fileName,
    parseStatus: row.parseStatus,
    oneDriveItemId: row.oneDriveItemId,
    sourceUrl: row.sourceUrl,
  };
}

export type PersistPreSolicitationConfirmedInput = {
  companyId: string;
  preSolicitationId: string;
  patientName: string | null;
  procedureType: string | null;
  quoteDeadlineDays: number | null;
  parseStatus: DomainParseStatus;
  fileName: string;
  oneDriveItemId: string;
  sourceUrl: string | null;
  receivedAt: Date;
  internetMessageId?: string;
  mailbox?: string;
  graphMessageId?: string;
};

export async function persistConfirmedPreSolicitation(
  input: PersistPreSolicitationConfirmedInput,
): Promise<{ id: string }> {
  return prisma.$transaction(async (tx) => {
    const created = await tx.unimedCgPreSolicitation.create({
      data: {
        companyId: input.companyId,
        preSolicitationId: input.preSolicitationId,
        patientName: input.patientName,
        procedureType: input.procedureType,
        quoteDeadlineDays: input.quoteDeadlineDays,
        oneDriveItemId: input.oneDriveItemId,
        fileName: input.fileName,
        sourceUrl: input.sourceUrl,
        parseStatus: input.parseStatus,
        receivedAt: input.receivedAt,
      },
      select: { id: true },
    });
    if (input.internetMessageId && input.mailbox && input.graphMessageId) {
      await tx.unimedCgPreSolicitationSourceMessage.create({
        data: {
          companyId: input.companyId,
          preSolicitationRefId: created.id,
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

export async function persistUpgradePreSolicitation(
  input: PersistPreSolicitationConfirmedInput & { recordId: string },
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.unimedCgPreSolicitation.update({
      where: { id: input.recordId },
      data: {
        patientName: input.patientName,
        procedureType: input.procedureType,
        quoteDeadlineDays: input.quoteDeadlineDays,
        oneDriveItemId: input.oneDriveItemId,
        fileName: input.fileName,
        sourceUrl: input.sourceUrl,
        parseStatus: input.parseStatus,
        receivedAt: input.receivedAt,
      },
    });
    if (input.internetMessageId && input.mailbox && input.graphMessageId) {
      await tx.unimedCgPreSolicitationSourceMessage.create({
        data: {
          companyId: input.companyId,
          preSolicitationRefId: input.recordId,
          mailbox: input.mailbox,
          graphMessageId: input.graphMessageId,
          internetMessageId: input.internetMessageId,
          receivedAt: input.receivedAt,
        },
      });
    }
  });
}

export async function persistPreSolicitationSourceOnly(input: {
  companyId: string;
  recordId: string;
  mailbox: string;
  graphMessageId: string;
  internetMessageId: string;
  receivedAt: Date;
}): Promise<void> {
  try {
    await prisma.unimedCgPreSolicitationSourceMessage.create({
      data: {
        companyId: input.companyId,
        preSolicitationRefId: input.recordId,
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

export const prismaUnimedCgPreSolicitationStore = {
  async findSourceByInternetMessageId(companyId: string, internetMessageId: string) {
    return prisma.unimedCgPreSolicitationSourceMessage.findUnique({
      where: { companyId_internetMessageId: { companyId, internetMessageId } },
      select: { id: true, preSolicitationRefId: true, whatsappSentAt: true },
    });
  },
  async markWhatsAppSent(companyId: string, internetMessageId: string, messageId: string | null) {
    await prisma.unimedCgPreSolicitationSourceMessage.updateMany({
      where: { companyId, internetMessageId },
      data: { whatsappSentAt: new Date(), whatsappMessageId: messageId },
    });
  },
  async findByPreSolicitationId(companyId: string, preSolicitationId: string) {
    return prisma.unimedCgPreSolicitation.findUnique({
      where: { companyId_preSolicitationId: { companyId, preSolicitationId } },
      select: {
        id: true,
        preSolicitationId: true,
        parseStatus: true,
        oneDriveItemId: true,
        receivedAt: true,
      },
    });
  },
  persistConfirmed: persistConfirmedPreSolicitation,
  persistUpgrade: persistUpgradePreSolicitation,
  persistSourceOnly: persistPreSolicitationSourceOnly,
};
