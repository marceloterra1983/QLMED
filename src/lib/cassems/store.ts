import { Decimal } from '@prisma/client-runtime-utils';
import type { CassemsParseStatus } from '@prisma/client';
import prisma from '@/lib/prisma';
import { isUniqueViolation } from '@/lib/prisma-errors';
import { centsToDecimal, decimalToCents, formatMoneyDecimal } from '@/lib/money';
import type { CassemsParseStatus as DomainParseStatus } from './constants';
import {
  computeCassemsParseStatus,
  describeCassemsParseGap,
  type ParsedCassemsItem,
} from './parse-oficio';
import { mergeEditedFields, type OficioEditableField } from '@/lib/gestao-oficio-edits';

export type CassemsListItem = {
  id: string;
  issuedAt: string | null;
  oficioNumber: string;
  patientName: string;
  doctorName: string | null;
  hospitalName: string | null;
  totalAmount: string;
  fileName: string;
  parseStatus: CassemsParseStatus;
  parseMissingReason: string | null;
};

export type CassemsDetailItem = CassemsListItem & {
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
  parseStatus: CassemsParseStatus;
  oficioNumber: string;
  issuedAt: Date | null;
  patientName: string;
  doctorName: string | null;
  doctorCrm: string | null;
  procedureName: string | null;
  hospitalName: string | null;
  totalAmount: Decimal;
  items: Array<{ lineTotal: Decimal }>;
}): string | null {
  return describeCassemsParseGap({
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

export async function listCassemsAuthorizations(companyId: string): Promise<CassemsListItem[]> {
  const rows = await prisma.cassemsAuthorization.findMany({
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

  return rows.map((row) => ({
    id: row.id,
    issuedAt: row.issuedAt ? row.issuedAt.toISOString() : null,
    oficioNumber: row.oficioNumber,
    patientName: row.patientName,
    doctorName: row.doctorName,
    hospitalName: row.hospitalName,
    totalAmount: moneyString(row.totalAmount),
    fileName: row.fileName,
    parseStatus: row.parseStatus,
    parseMissingReason: parseGapFromRow(row),
  }));
}

export async function getCassemsAuthorization(
  companyId: string,
  id: string,
): Promise<CassemsDetailItem | null> {
  const row = await prisma.cassemsAuthorization.findFirst({
    where: { id, companyId },
    include: { items: { orderBy: { sortOrder: 'asc' } } },
  });
  if (!row) return null;

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
    parseStatus: row.parseStatus,
    parseMissingReason: parseGapFromRow(row),
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

export async function getCassemsIngestState(companyId: string) {
  return prisma.cassemsIngestState.findUnique({ where: { companyId } });
}

export type CassemsReadFieldsPatch = {
  issuedAt?: Date;
  patientName?: string;
  patientRegistry?: string | null;
  doctorName?: string | null;
  doctorCrm?: string | null;
  procedureName?: string | null;
  hospitalName?: string | null;
};

export async function updateCassemsReadFields(
  companyId: string,
  id: string,
  patch: CassemsReadFieldsPatch,
): Promise<CassemsDetailItem | null> {
  const row = await prisma.cassemsAuthorization.findFirst({
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
    next.patientRegistry = patch.patientRegistry?.trim() || null;
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

  const parseStatus = computeCassemsParseStatus(next);
  await prisma.cassemsAuthorization.update({
    where: { id: row.id },
    data: {
      issuedAt: next.issuedAt,
      patientName: next.patientName,
      patientRegistry: next.patientRegistry,
      doctorName: next.doctorName,
      doctorCrm: next.doctorCrm,
      procedureName: next.procedureName,
      hospitalName: next.hospitalName,
      parseStatus,
      editedFields: mergeEditedFields(row.editedFields, touched),
    },
  });

  return getCassemsAuthorization(companyId, id);
}

function itemRows(authorizationId: string, items: ParsedCassemsItem[]) {
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
  items: ParsedCassemsItem[];
  internetMessageId?: string;
  mailbox?: string;
  graphMessageId?: string;
};

export async function persistConfirmedAuthorization(input: PersistConfirmedInput): Promise<{ id: string }> {
  return prisma.$transaction(async (tx) => {
    const created = await tx.cassemsAuthorization.create({
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
      await tx.cassemsAuthorizationItem.createMany({ data: itemRows(created.id, input.items) });
    }
    if (input.internetMessageId && input.mailbox && input.graphMessageId) {
      await tx.cassemsSourceMessage.create({
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
    const current = await tx.cassemsAuthorization.findUnique({
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
      },
    });
    const edited = current?.editedFields ?? [];
    await tx.cassemsAuthorization.update({
      where: { id: input.authorizationId },
      data: {
        issuedAt: edited.includes('issuedAt') ? current?.issuedAt : input.issuedAt,
        patientName: edited.includes('patientName') ? current?.patientName ?? input.patientName : input.patientName,
        patientRegistry: edited.includes('patientRegistry') ? current?.patientRegistry : input.patientRegistry,
        doctorName: edited.includes('doctorName') ? current?.doctorName : input.doctorName,
        doctorCrm: edited.includes('doctorCrm') ? current?.doctorCrm : input.doctorCrm,
        procedureName: edited.includes('procedureName') ? current?.procedureName : input.procedureName,
        hospitalName: edited.includes('hospitalName') ? current?.hospitalName : input.hospitalName,
        totalAmount: centsToDecimal(input.totalCents),
        oneDriveItemId: input.oneDriveItemId,
        fileName: input.fileName,
        parseStatus: input.parseStatus,
      },
    });
    await tx.cassemsAuthorizationItem.deleteMany({ where: { authorizationId: input.authorizationId } });
    if (input.items.length > 0) {
      await tx.cassemsAuthorizationItem.createMany({ data: itemRows(input.authorizationId, input.items) });
    }
    if (input.internetMessageId && input.mailbox && input.graphMessageId) {
      await tx.cassemsSourceMessage.create({
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
    await prisma.cassemsSourceMessage.create({
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
    // JOB-002: só a violação do unique (companyId, internetMessageId) é dedup
    // legítimo. Um catch vazio transformava indisponibilidade do banco em "já
    // existe" e a coleta seguia dando o ofício por guardado.
    if (!isUniqueViolation(error)) throw error;
  }
}

export const prismaCassemsStore = {
  async findSourceByInternetMessageId(companyId: string, internetMessageId: string) {
    return prisma.cassemsSourceMessage.findUnique({
      where: { companyId_internetMessageId: { companyId, internetMessageId } },
      select: { id: true, authorizationId: true, whatsappSentAt: true },
    });
  },
  /** SPEC-034 FR-004: impede reenvio nos ciclos seguintes da coleta. */
  async markWhatsAppSent(companyId: string, internetMessageId: string, messageId: string | null) {
    await prisma.cassemsSourceMessage.updateMany({
      where: { companyId, internetMessageId },
      data: { whatsappSentAt: new Date(), whatsappMessageId: messageId },
    });
  },
  async findByOficioNumber(companyId: string, oficioNumber: string) {
    return prisma.cassemsAuthorization.findUnique({
      where: { companyId_oficioNumber: { companyId, oficioNumber } },
      select: { id: true, oficioNumber: true, parseStatus: true, patientName: true, oneDriveItemId: true },
    });
  },
  persistConfirmed: persistConfirmedAuthorization,
  persistUpgrade: persistUpgradeAuthorization,
  persistSourceOnly,
  async loadIngestState(companyId: string) {
    const row = await prisma.cassemsIngestState.findUnique({ where: { companyId } });
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
    await prisma.cassemsIngestState.upsert({
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
