import type { UnimedCgParseStatus } from '@prisma/client';
import prisma from '@/lib/prisma';
import { isUniqueViolation } from '@/lib/prisma-errors';
import type { UnimedCgParseStatus as DomainParseStatus } from './constants';

export type UnimedCgDeliveryListItem = {
  id: string;
  processId: string;
  principalAuthorization: string | null;
  status: string | null;
  authorizedAt: string | null;
  supplier: string | null;
  receivedAt: string;
  fileName: string;
  parseStatus: UnimedCgParseStatus;
};

export type UnimedCgDeliveryDetailItem = UnimedCgDeliveryListItem & {
  oneDriveItemId: string;
  sourceUrl: string | null;
};

export async function listUnimedCgDeliveries(companyId: string): Promise<UnimedCgDeliveryListItem[]> {
  const rows = await prisma.unimedCgDeliveryAuthorization.findMany({
    where: { companyId },
    orderBy: [{ receivedAt: 'desc' }, { processId: 'desc' }],
    select: {
      id: true,
      processId: true,
      principalAuthorization: true,
      status: true,
      authorizedAt: true,
      supplier: true,
      receivedAt: true,
      fileName: true,
      parseStatus: true,
    },
  });

  return rows.map((row) => ({
    id: row.id,
    processId: row.processId,
    principalAuthorization: row.principalAuthorization,
    status: row.status,
    authorizedAt: row.authorizedAt ? row.authorizedAt.toISOString() : null,
    supplier: row.supplier,
    receivedAt: row.receivedAt.toISOString(),
    fileName: row.fileName,
    parseStatus: row.parseStatus,
  }));
}

export async function getUnimedCgDelivery(
  companyId: string,
  id: string,
): Promise<UnimedCgDeliveryDetailItem | null> {
  const row = await prisma.unimedCgDeliveryAuthorization.findFirst({
    where: { id, companyId },
  });
  if (!row) return null;

  return {
    id: row.id,
    processId: row.processId,
    principalAuthorization: row.principalAuthorization,
    status: row.status,
    authorizedAt: row.authorizedAt ? row.authorizedAt.toISOString() : null,
    supplier: row.supplier,
    receivedAt: row.receivedAt.toISOString(),
    fileName: row.fileName,
    parseStatus: row.parseStatus,
    oneDriveItemId: row.oneDriveItemId,
    sourceUrl: row.sourceUrl,
  };
}

export type PersistDeliveryConfirmedInput = {
  companyId: string;
  processId: string;
  principalAuthorization: string | null;
  status: string | null;
  authorizedAt: Date | null;
  supplier: string | null;
  parseStatus: DomainParseStatus;
  fileName: string;
  oneDriveItemId: string;
  sourceUrl: string | null;
  receivedAt: Date;
  internetMessageId?: string;
  mailbox?: string;
  graphMessageId?: string;
};

export async function persistConfirmedDelivery(
  input: PersistDeliveryConfirmedInput,
): Promise<{ id: string }> {
  return prisma.$transaction(async (tx) => {
    const created = await tx.unimedCgDeliveryAuthorization.create({
      data: {
        companyId: input.companyId,
        processId: input.processId,
        principalAuthorization: input.principalAuthorization,
        status: input.status,
        authorizedAt: input.authorizedAt,
        supplier: input.supplier,
        oneDriveItemId: input.oneDriveItemId,
        fileName: input.fileName,
        sourceUrl: input.sourceUrl,
        parseStatus: input.parseStatus,
        receivedAt: input.receivedAt,
      },
      select: { id: true },
    });
    if (input.internetMessageId && input.mailbox && input.graphMessageId) {
      await tx.unimedCgDeliverySourceMessage.create({
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

export async function persistUpgradeDelivery(
  input: PersistDeliveryConfirmedInput & { authorizationId: string },
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.unimedCgDeliveryAuthorization.update({
      where: { id: input.authorizationId },
      data: {
        principalAuthorization: input.principalAuthorization,
        status: input.status,
        authorizedAt: input.authorizedAt,
        supplier: input.supplier,
        oneDriveItemId: input.oneDriveItemId,
        fileName: input.fileName,
        sourceUrl: input.sourceUrl,
        parseStatus: input.parseStatus,
      },
    });
    if (input.internetMessageId && input.mailbox && input.graphMessageId) {
      await tx.unimedCgDeliverySourceMessage.create({
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

export async function persistDeliverySourceOnly(input: {
  companyId: string;
  authorizationId: string;
  mailbox: string;
  graphMessageId: string;
  internetMessageId: string;
  receivedAt: Date;
}): Promise<void> {
  try {
    await prisma.unimedCgDeliverySourceMessage.create({
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

export const prismaUnimedCgDeliveryStore = {
  async findSourceByInternetMessageId(companyId: string, internetMessageId: string) {
    return prisma.unimedCgDeliverySourceMessage.findUnique({
      where: { companyId_internetMessageId: { companyId, internetMessageId } },
      select: { id: true, authorizationId: true, whatsappSentAt: true },
    });
  },
  async markWhatsAppSent(companyId: string, internetMessageId: string, messageId: string | null) {
    await prisma.unimedCgDeliverySourceMessage.updateMany({
      where: { companyId, internetMessageId },
      data: { whatsappSentAt: new Date(), whatsappMessageId: messageId },
    });
  },
  async findByProcessId(companyId: string, processId: string) {
    return prisma.unimedCgDeliveryAuthorization.findUnique({
      where: { companyId_processId: { companyId, processId } },
      select: {
        id: true,
        processId: true,
        parseStatus: true,
        oneDriveItemId: true,
      },
    });
  },
  persistConfirmed: persistConfirmedDelivery,
  persistUpgrade: persistUpgradeDelivery,
  persistSourceOnly: persistDeliverySourceOnly,
};
