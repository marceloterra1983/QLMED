import { Decimal } from '@prisma/client-runtime-utils';
import type { ImpcgParseStatus } from '@prisma/client';
import prisma from '@/lib/prisma';
import { centsToDecimal, decimalToCents, formatMoneyDecimal } from '@/lib/money';
import type { ImpcgParseStatus as DomainParseStatus } from './constants';
import {
  computeImpcgParseStatus,
  presentImpcgReadStatus,
  type ParsedImpcgItem,
} from './parse-oficio';
import { mergeEditedFields, shouldPreserveEditedItems, type OficioEditableField } from '@/lib/gestao-oficio-edits';

export type ImpcgListItem = {
  id: string;
  issuedAt: string | null;
  oficioNumber: string;
  patientName: string;
  doctorName: string | null;
  hospitalName: string | null;
  totalAmount: string;
  fileName: string;
  parseStatus: ImpcgParseStatus;
  parseMissingReason: string | null;
};

export type ImpcgDetailItem = ImpcgListItem & {
  patientRegistry: string | null;
  doctorCrm: string | null;
  procedureName: string | null;
  oneDriveItemId: string;
  editedFields: string[];
  items: Array<{
    anvisaCode: string | null;
    description: string;
    brand: string | null;
    reference: string | null;
    quantity: string;
    unitAmount: string;
    lineTotal: string;
  }>;
};

function moneyString(value: Decimal): string {
  return formatMoneyDecimal(value);
}

function parseGapFromRow(row: {
  parseStatus: ImpcgParseStatus;
  oficioNumber: string;
  issuedAt: Date | null;
  patientName: string;
  doctorName: string | null;
  doctorCrm: string | null;
  procedureName: string | null;
  hospitalName: string | null;
  totalAmount: Decimal;
  items: Array<{ lineTotal: Decimal }>;
}): { parseStatus: ImpcgParseStatus; parseMissingReason: string | null } {
  return presentImpcgReadStatus({
    parseStatus: row.parseStatus,
    oficioNumber: row.oficioNumber,
    issuedAt: row.issuedAt,
    patientName: row.patientName,
    doctorName: row.doctorName,
    doctorCrm: row.doctorCrm,
    procedureName: row.procedureName,
    hospitalName: row.hospitalName,
    totalCents: decimalToCents(row.totalAmount),
    items: row.items.map((item) => ({ lineCents: decimalToCents(item.lineTotal) })),
  });
}

export async function listImpcgAuthorizations(companyId: string): Promise<ImpcgListItem[]> {
  const rows = await prisma.impcgAuthorization.findMany({
    where: { companyId },
    orderBy: [{ issuedAt: 'desc' }, { oficioNumber: 'desc' }],
    select: {
      id: true,
      issuedAt: true,
      oficioNumber: true,
      patientName: true,
      doctorName: true,
      doctorCrm: true,
      procedureName: true,
      hospitalName: true,
      totalAmount: true,
      fileName: true,
      parseStatus: true,
      items: { select: { lineTotal: true } },
    },
  });

  return rows.map((row) => {
    const presented = parseGapFromRow(row);
    return {
      id: row.id,
      issuedAt: row.issuedAt ? row.issuedAt.toISOString() : null,
      oficioNumber: row.oficioNumber,
      patientName: row.patientName,
      doctorName: row.doctorName,
      hospitalName: row.hospitalName,
      totalAmount: moneyString(row.totalAmount),
      fileName: row.fileName,
      parseStatus: presented.parseStatus,
      parseMissingReason: presented.parseMissingReason,
    };
  });
}

export async function getImpcgAuthorization(
  companyId: string,
  id: string,
): Promise<ImpcgDetailItem | null> {
  const row = await prisma.impcgAuthorization.findFirst({
    where: { id, companyId },
    include: { items: { orderBy: { sortOrder: 'asc' } } },
  });
  if (!row) return null;

  const presented = parseGapFromRow(row);
  return {
    id: row.id,
    issuedAt: row.issuedAt ? row.issuedAt.toISOString() : null,
    oficioNumber: row.oficioNumber,
    patientName: row.patientName,
    patientRegistry: row.patientRegistry,
    doctorName: row.doctorName,
    doctorCrm: row.doctorCrm,
    procedureName: row.procedureName,
    hospitalName: row.hospitalName,
    totalAmount: moneyString(row.totalAmount),
    fileName: row.fileName,
    oneDriveItemId: row.oneDriveItemId,
    parseStatus: presented.parseStatus,
    parseMissingReason: presented.parseMissingReason,
    editedFields: row.editedFields,
    items: row.items.map((item) => ({
      anvisaCode: item.anvisaCode,
      description: item.description,
      brand: item.brand,
      reference: item.reference,
      quantity: new Decimal(item.quantity).toFixed(),
      unitAmount: moneyString(item.unitAmount),
      lineTotal: moneyString(item.lineTotal),
    })),
  };
}

export async function getImpcgIngestState(companyId: string) {
  return prisma.impcgIngestState.findUnique({ where: { companyId } });
}

export type ImpcgMissingFieldsPatch = {
  issuedAt?: Date;
  patientName?: string;
  patientRegistry?: string | null;
  doctorName?: string | null;
  doctorCrm?: string | null;
  procedureName?: string | null;
  hospitalName?: string | null;
  totalCents?: number;
  items?: ParsedImpcgItem[];
};

/** Editor corrige o campo lido. Marca como editado para a coleta não sobrescrever. */
export async function updateImpcgMissingFields(
  companyId: string,
  id: string,
  patch: ImpcgMissingFieldsPatch,
): Promise<ImpcgDetailItem | null> {
  const row = await prisma.impcgAuthorization.findFirst({
    where: { id, companyId },
    include: { items: { orderBy: { sortOrder: 'asc' } } },
  });
  if (!row) return null;

  const next = {
    oficioNumber: row.oficioNumber,
    issuedAt: row.issuedAt,
    patientName: row.patientName,
    patientRegistry: row.patientRegistry,
    doctorName: row.doctorName,
    doctorCrm: row.doctorCrm,
    procedureName: row.procedureName,
    hospitalName: row.hospitalName,
    totalCents: decimalToCents(row.totalAmount),
    items: row.items.map((item) => ({
      anvisaCode: item.anvisaCode,
      description: item.description,
      brand: item.brand,
      reference: item.reference,
      quantity: new Decimal(item.quantity).toFixed(),
      unitCents: decimalToCents(item.unitAmount),
      lineCents: decimalToCents(item.lineTotal),
    })),
  };
  const touched: OficioEditableField[] = [];

  if (patch.issuedAt) {
    next.issuedAt = patch.issuedAt;
    touched.push('issuedAt');
  }
  if (patch.patientName?.trim()) {
    next.patientName = patch.patientName.trim().toUpperCase();
    touched.push('patientName');
  }
  if (patch.patientRegistry !== undefined) {
    const registry = patch.patientRegistry?.trim() || null;
    next.patientRegistry = registry;
    touched.push('patientRegistry');
  }
  if (patch.doctorName?.trim()) {
    next.doctorName = patch.doctorName.trim().toUpperCase();
    touched.push('doctorName');
  }
  if (patch.doctorCrm !== undefined) {
    next.doctorCrm = patch.doctorCrm?.replace(/\D/g, '') || null;
    touched.push('doctorCrm');
  }
  if (patch.procedureName?.trim()) {
    next.procedureName = patch.procedureName.trim().toUpperCase();
    touched.push('procedureName');
  }
  if (patch.hospitalName?.trim()) {
    next.hospitalName = patch.hospitalName.trim().toUpperCase();
    touched.push('hospitalName');
  }
  if (patch.totalCents !== undefined) {
    next.totalCents = patch.totalCents;
    touched.push('totalAmount');
  }
  if (patch.items) {
    next.items = patch.items;
    touched.push('items');
  }

  const parseStatus = computeImpcgParseStatus(next);
  await prisma.$transaction(async (tx) => {
    await tx.impcgAuthorization.update({
      where: { id: row.id },
      data: {
        issuedAt: next.issuedAt,
        patientName: next.patientName,
        patientRegistry: next.patientRegistry,
        doctorName: next.doctorName,
        doctorCrm: next.doctorCrm,
        procedureName: next.procedureName,
        hospitalName: next.hospitalName,
        totalAmount: centsToDecimal(next.totalCents),
        parseStatus,
        editedFields: mergeEditedFields(row.editedFields, touched),
      },
    });
    if (patch.items) {
      await tx.impcgAuthorizationItem.deleteMany({ where: { authorizationId: row.id } });
      if (patch.items.length > 0) {
        await tx.impcgAuthorizationItem.createMany({ data: itemRows(row.id, patch.items) });
      }
    }
  });

  return getImpcgAuthorization(companyId, id);
}

function itemRows(authorizationId: string, items: ParsedImpcgItem[]) {
  return items.map((item, index) => ({
    authorizationId,
    anvisaCode: item.anvisaCode,
    description: item.description,
    brand: item.brand,
    reference: item.reference,
    quantity: new Decimal(item.quantity),
    unitAmount: centsToDecimal(item.unitCents),
    lineTotal: centsToDecimal(item.lineCents),
    sortOrder: index,
  }));
}

export type PersistConfirmedInput = {
  companyId: string;
  oficioNumber: string;
  issuedAt: Date | null;
  patientName: string;
  patientRegistry: string | null;
  doctorName: string | null;
  doctorCrm: string | null;
  procedureName: string | null;
  hospitalName: string | null;
  totalCents: number;
  parseStatus: DomainParseStatus;
  fileName: string;
  oneDriveItemId: string;
  receivedAt: Date;
  items: ParsedImpcgItem[];
  internetMessageId?: string;
  mailbox?: string;
  graphMessageId?: string;
};

export async function persistConfirmedAuthorization(input: PersistConfirmedInput): Promise<{ id: string }> {
  return prisma.$transaction(async (tx) => {
    const created = await tx.impcgAuthorization.create({
      data: {
        companyId: input.companyId,
        oficioNumber: input.oficioNumber,
        issuedAt: input.issuedAt,
        patientName: input.patientName,
        patientRegistry: input.patientRegistry,
        doctorName: input.doctorName,
        doctorCrm: input.doctorCrm,
        procedureName: input.procedureName,
        hospitalName: input.hospitalName,
        totalAmount: centsToDecimal(input.totalCents),
        oneDriveItemId: input.oneDriveItemId,
        fileName: input.fileName,
        parseStatus: input.parseStatus,
        receivedAt: input.receivedAt,
      },
      select: { id: true },
    });
    if (input.items.length > 0) {
      await tx.impcgAuthorizationItem.createMany({ data: itemRows(created.id, input.items) });
    }
    if (input.internetMessageId && input.mailbox && input.graphMessageId) {
      await tx.impcgSourceMessage.create({
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
    const current = await tx.impcgAuthorization.findUnique({
      where: { id: input.authorizationId },
      select: {
        editedFields: true,
        issuedAt: true,
        patientName: true,
        patientRegistry: true,
        doctorName: true,
        doctorCrm: true,
        procedureName: true,
        hospitalName: true,
        totalAmount: true,
      },
    });
    const edited = current?.editedFields ?? [];
    const issuedAt = edited.includes('issuedAt') ? current?.issuedAt ?? null : input.issuedAt;
    const patientName = edited.includes('patientName')
      ? current?.patientName ?? input.patientName
      : input.patientName;
    const patientRegistry = edited.includes('patientRegistry')
      ? current?.patientRegistry ?? null
      : input.patientRegistry;
    const doctorName = edited.includes('doctorName') ? current?.doctorName ?? null : input.doctorName;
    const doctorCrm = edited.includes('doctorCrm') ? current?.doctorCrm ?? null : input.doctorCrm;
    const procedureName = edited.includes('procedureName')
      ? current?.procedureName ?? null
      : input.procedureName;
    const hospitalName = edited.includes('hospitalName')
      ? current?.hospitalName ?? null
      : input.hospitalName;
    const totalCents = edited.includes('totalAmount') && current?.totalAmount
      ? decimalToCents(current.totalAmount)
      : input.totalCents;

    let itemsForStatus = input.items;
    if (shouldPreserveEditedItems(edited)) {
      const existingItems = await tx.impcgAuthorizationItem.findMany({
        where: { authorizationId: input.authorizationId },
        orderBy: { sortOrder: 'asc' },
      });
      itemsForStatus = existingItems.map((item) => ({
        anvisaCode: item.anvisaCode,
        description: item.description,
        brand: item.brand,
        reference: item.reference,
        quantity: new Decimal(item.quantity).toFixed(),
        unitCents: decimalToCents(item.unitAmount),
        lineCents: decimalToCents(item.lineTotal),
      }));
    } else {
      await tx.impcgAuthorizationItem.deleteMany({ where: { authorizationId: input.authorizationId } });
      if (input.items.length > 0) {
        await tx.impcgAuthorizationItem.createMany({ data: itemRows(input.authorizationId, input.items) });
      }
    }

    const parseStatus = computeImpcgParseStatus({
      oficioNumber: input.oficioNumber,
      issuedAt,
      patientName,
      patientRegistry,
      doctorName,
      doctorCrm,
      procedureName,
      hospitalName,
      totalCents,
      items: itemsForStatus,
    });

    await tx.impcgAuthorization.update({
      where: { id: input.authorizationId },
      data: {
        issuedAt,
        patientName,
        patientRegistry,
        doctorName,
        doctorCrm,
        procedureName,
        hospitalName,
        totalAmount: centsToDecimal(totalCents),
        oneDriveItemId: input.oneDriveItemId,
        fileName: input.fileName,
        parseStatus,
      },
    });
    if (input.internetMessageId && input.mailbox && input.graphMessageId) {
      await tx.impcgSourceMessage.create({
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

export async function persistIssuedAt(
  authorizationId: string,
  issuedAt: Date,
): Promise<void> {
  const row = await prisma.impcgAuthorization.findUnique({
    where: { id: authorizationId },
    select: { editedFields: true },
  });
  if (row?.editedFields.includes('issuedAt')) return;
  await prisma.impcgAuthorization.update({
    where: { id: authorizationId },
    data: { issuedAt },
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
    await prisma.impcgSourceMessage.create({
      data: {
        companyId: input.companyId,
        authorizationId: input.authorizationId,
        mailbox: input.mailbox,
        graphMessageId: input.graphMessageId,
        internetMessageId: input.internetMessageId,
        receivedAt: input.receivedAt,
      },
    });
  } catch {
    // unique (companyId, internetMessageId) — segunda caixa
  }
}

export const prismaImpcgStore = {
  async findSourceByInternetMessageId(companyId: string, internetMessageId: string) {
    return prisma.impcgSourceMessage.findUnique({
      where: { companyId_internetMessageId: { companyId, internetMessageId } },
      select: { id: true, authorizationId: true, whatsappSentAt: true },
    });
  },
  /** SPEC-031 FR-004: impede reenvio nos ciclos seguintes da coleta. */
  async markWhatsAppSent(companyId: string, internetMessageId: string, messageId: string | null) {
    await prisma.impcgSourceMessage.updateMany({
      where: { companyId, internetMessageId },
      data: { whatsappSentAt: new Date(), whatsappMessageId: messageId },
    });
  },
  async findByOficioNumber(companyId: string, oficioNumber: string) {
    return prisma.impcgAuthorization.findUnique({
      where: { companyId_oficioNumber: { companyId, oficioNumber } },
      select: {
        id: true,
        oficioNumber: true,
        parseStatus: true,
        patientName: true,
        oneDriveItemId: true,
        issuedAt: true,
        doctorName: true,
        doctorCrm: true,
        editedFields: true,
      },
    });
  },
  persistConfirmed: persistConfirmedAuthorization,
  persistUpgrade: persistUpgradeAuthorization,
  persistIssuedAt,
  persistSourceOnly,
  async loadIngestState(companyId: string) {
    const row = await prisma.impcgIngestState.findUnique({ where: { companyId } });
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
    await prisma.impcgIngestState.upsert({
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
