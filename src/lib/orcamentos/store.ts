import { Prisma } from '@prisma/client';
import type { QuoteStatus } from '@prisma/client';
import prisma from '@/lib/prisma';
import type { QuoteUpsertInput } from '@/lib/schemas/orcamentos';
import {
  acquirePostgresTransactionAdvisoryLock,
  quoteNumberLockKey,
  quoteWriteLockKey,
} from '@/lib/postgres-advisory-lock';
import { formatQuoteNumber, moneyText, quoteTotalsOf, todayYmd, unknownProductIds } from './totals';

function digits(value: string): string {
  return value.replace(/\D/g, '');
}

function emptyToNull(value: string | null | undefined): string | null {
  const trimmed = (value || '').trim();
  return trimmed ? trimmed : null;
}

export function serializeQuote(row: {
  id: string;
  number: number;
  issuedAt: Date;
  status: QuoteStatus;
  customerCnpj: string;
  customerName: string;
  customerIe: string | null;
  customerCode: string | null;
  customerStreet: string | null;
  customerNumber: string | null;
  customerDistrict: string | null;
  customerCity: string | null;
  customerState: string | null;
  customerZip: string | null;
  salesperson: string | null;
  patientName: string | null;
  doctorName: string | null;
  convenio: string | null;
  local: string | null;
  notes: string | null;
  freight: Prisma.Decimal;
  subtotal: Prisma.Decimal;
  total: Prisma.Decimal;
  items?: Array<{
    id: string;
    lineNumber: number;
    productRegistryId: string | null;
    code: string;
    description: string;
    rvs: string | null;
    ncm: string | null;
    unit: string | null;
    quantity: Prisma.Decimal;
    unitPrice: Prisma.Decimal;
    discount: Prisma.Decimal;
    lineTotal: Prisma.Decimal;
  }>;
  _count?: { items: number };
}) {
  return {
    id: row.id,
    number: row.number,
    numberLabel: formatQuoteNumber(row.number),
    issuedAt: row.issuedAt.toISOString().slice(0, 10),
    status: row.status,
    customerCnpj: row.customerCnpj,
    customerName: row.customerName,
    customerIe: row.customerIe,
    customerCode: row.customerCode,
    customerStreet: row.customerStreet,
    customerNumber: row.customerNumber,
    customerDistrict: row.customerDistrict,
    customerCity: row.customerCity,
    customerState: row.customerState,
    customerZip: row.customerZip,
    salesperson: row.salesperson,
    patientName: row.patientName,
    doctorName: row.doctorName,
    convenio: row.convenio,
    local: row.local,
    notes: row.notes,
    freight: moneyText(row.freight),
    subtotal: moneyText(row.subtotal),
    total: moneyText(row.total),
    itemCount: row._count?.items ?? row.items?.length ?? 0,
    items: (row.items || []).map((item) => ({
      id: item.id,
      lineNumber: item.lineNumber,
      productRegistryId: item.productRegistryId,
      code: item.code,
      description: item.description,
      rvs: item.rvs,
      ncm: item.ncm,
      unit: item.unit,
      quantity: item.quantity.toString(),
      unitPrice: moneyText(item.unitPrice),
      discount: moneyText(item.discount),
      lineTotal: moneyText(item.lineTotal),
    })),
  };
}

function persistPayload(input: QuoteUpsertInput, companyId: string) {
  const totals = quoteTotalsOf(input.items, input.freight);
  const customerCnpj = digits(input.customerCnpj);
  if (customerCnpj.length !== 14 && customerCnpj.length !== 11) {
    throw new Error('CNPJ/CPF do cliente inválido');
  }
  return {
    totals,
    data: {
      issuedAt: new Date(`${input.issuedAt || todayYmd()}T00:00:00.000Z`),
      customerCnpj,
      customerName: input.customerName.trim(),
      customerIe: emptyToNull(input.customerIe),
      customerCode: emptyToNull(input.customerCode),
      customerStreet: emptyToNull(input.customerStreet),
      customerNumber: emptyToNull(input.customerNumber),
      customerDistrict: emptyToNull(input.customerDistrict),
      customerCity: emptyToNull(input.customerCity),
      customerState: emptyToNull(input.customerState)?.toUpperCase() || null,
      customerZip: digits(input.customerZip || '') || null,
      salesperson: emptyToNull(input.salesperson),
      patientName: emptyToNull(input.patientName),
      doctorName: emptyToNull(input.doctorName),
      convenio: emptyToNull(input.convenio),
      local: emptyToNull(input.local),
      notes: emptyToNull(input.notes),
      freight: totals.freight,
      subtotal: totals.subtotal,
      total: totals.total,
      items: {
        create: input.items.map((item, index) => ({
          companyId,
          lineNumber: index + 1,
          productRegistryId: item.productRegistryId || null,
          code: item.code.trim(),
          description: item.description.trim(),
          rvs: emptyToNull(item.rvs),
          ncm: emptyToNull(item.ncm),
          unit: emptyToNull(item.unit),
          quantity: new Prisma.Decimal(item.quantity),
          unitPrice: new Prisma.Decimal(item.unitPrice),
          discount: new Prisma.Decimal(item.discount ?? '0'),
          lineTotal: totals.lineTotals[index],
        })),
      },
    },
  };
}

async function assertProductsOfCompany(
  tx: Prisma.TransactionClient,
  companyId: string,
  items: QuoteUpsertInput['items'],
) {
  const requested = [...new Set(items.map((item) => item.productRegistryId).filter((id): id is string => Boolean(id)))];
  if (requested.length === 0) return;
  const owned = await tx.productRegistry.findMany({
    where: { companyId, id: { in: requested } },
    select: { id: true },
  });
  if (unknownProductIds(owned.map((row) => row.id), requested).length > 0) {
    throw new Error('Produto não pertence à empresa');
  }
}

export async function nextQuoteNumber(companyId: string, tx: Prisma.TransactionClient): Promise<number> {
  await acquirePostgresTransactionAdvisoryLock(tx, quoteNumberLockKey(companyId));
  const last = await tx.quote.findFirst({
    where: { companyId },
    orderBy: { number: 'desc' },
    select: { number: true },
  });
  return (last?.number ?? 0) + 1;
}

export async function listQuotes(
  companyId: string,
  query: { q?: string; status?: QuoteStatus; page: number; limit: number },
) {
  const where: Prisma.QuoteWhereInput = { companyId };
  if (query.status) where.status = query.status;
  const q = (query.q || '').trim();
  if (q) {
    const qDigits = digits(q);
    const asNumber = /^\d+$/.test(qDigits) ? Number.parseInt(qDigits, 10) : null;
    where.OR = [
      { customerName: { contains: q, mode: 'insensitive' } },
      ...(qDigits.length >= 3 ? [{ customerCnpj: { contains: qDigits } }] : []),
      ...(asNumber && asNumber > 0 ? [{ number: asNumber }] : []),
    ];
  }
  const [total, rows] = await Promise.all([
    prisma.quote.count({ where }),
    prisma.quote.findMany({
      where,
      orderBy: [{ issuedAt: 'desc' }, { number: 'desc' }],
      skip: (query.page - 1) * query.limit,
      take: query.limit,
      include: { _count: { select: { items: true } } },
    }),
  ]);
  return {
    quotes: rows.map(serializeQuote),
    pagination: {
      page: query.page,
      limit: query.limit,
      total,
      pages: Math.max(1, Math.ceil(total / query.limit)),
    },
  };
}

export async function getQuote(companyId: string, id: string) {
  const row = await prisma.quote.findFirst({
    where: { id, companyId },
    include: { items: { orderBy: { lineNumber: 'asc' } } },
  });
  return row ? serializeQuote(row) : null;
}

export async function createQuote(companyId: string, userId: string, input: QuoteUpsertInput) {
  const payload = persistPayload(input, companyId);
  const row = await prisma.$transaction(async (tx) => {
    await assertProductsOfCompany(tx, companyId, input.items);
    const number = await nextQuoteNumber(companyId, tx);
    return tx.quote.create({
      data: {
        companyId,
        number,
        createdByUserId: userId,
        ...payload.data,
      },
      include: { items: { orderBy: { lineNumber: 'asc' } } },
    });
  });
  return serializeQuote(row);
}

export async function updateQuote(companyId: string, id: string, input: QuoteUpsertInput) {
  const payload = persistPayload(input, companyId);
  return prisma.$transaction(async (tx) => {
    await acquirePostgresTransactionAdvisoryLock(tx, quoteWriteLockKey(id));
    const existing = await tx.quote.findFirst({
      where: { id, companyId },
      select: { id: true, status: true },
    });
    if (!existing) return { kind: 'missing' as const };
    if (existing.status === 'cancelled') return { kind: 'cancelled' as const };
    await assertProductsOfCompany(tx, companyId, input.items);
    await tx.quoteItem.deleteMany({ where: { quoteId: id, companyId } });
    const row = await tx.quote.update({
      where: { id },
      data: payload.data,
      include: { items: { orderBy: { lineNumber: 'asc' } } },
    });
    return { kind: 'ok' as const, quote: serializeQuote(row) };
  });
}

export async function cancelQuote(companyId: string, id: string) {
  const cancelled = await prisma.$transaction(async (tx) => {
    await acquirePostgresTransactionAdvisoryLock(tx, quoteWriteLockKey(id));
    const existing = await tx.quote.findFirst({ where: { id, companyId }, select: { id: true } });
    if (!existing) return null;
    await tx.quote.updateMany({
      where: { id, companyId, status: { not: 'cancelled' } },
      data: { status: 'cancelled' },
    });
    return existing.id;
  });
  if (!cancelled) return null;
  return getQuote(companyId, id);
}

export async function duplicateQuote(companyId: string, userId: string, id: string) {
  const existing = await prisma.quote.findFirst({
    where: { id, companyId },
    include: { items: { orderBy: { lineNumber: 'asc' } } },
  });
  if (!existing) return null;
  const row = await prisma.$transaction(async (tx) => {
    const number = await nextQuoteNumber(companyId, tx);
    return tx.quote.create({
      data: {
        companyId,
        number,
        createdByUserId: userId,
        issuedAt: new Date(`${todayYmd()}T00:00:00.000Z`),
        status: 'draft',
        customerCnpj: existing.customerCnpj,
        customerName: existing.customerName,
        customerIe: existing.customerIe,
        customerCode: existing.customerCode,
        customerStreet: existing.customerStreet,
        customerNumber: existing.customerNumber,
        customerDistrict: existing.customerDistrict,
        customerCity: existing.customerCity,
        customerState: existing.customerState,
        customerZip: existing.customerZip,
        salesperson: existing.salesperson,
        patientName: existing.patientName,
        doctorName: existing.doctorName,
        convenio: existing.convenio,
        local: existing.local,
        notes: existing.notes,
        freight: existing.freight,
        subtotal: existing.subtotal,
        total: existing.total,
        items: {
          create: existing.items.map((item) => ({
            companyId,
            lineNumber: item.lineNumber,
            productRegistryId: item.productRegistryId,
            code: item.code,
            description: item.description,
            rvs: item.rvs,
            ncm: item.ncm,
            unit: item.unit,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            discount: item.discount,
            lineTotal: item.lineTotal,
          })),
        },
      },
      include: { items: { orderBy: { lineNumber: 'asc' } } },
    });
  });
  return serializeQuote(row);
}

export async function markQuoteIssued(companyId: string, id: string) {
  await prisma.$transaction(async (tx) => {
    await acquirePostgresTransactionAdvisoryLock(tx, quoteWriteLockKey(id));
    await tx.quote.updateMany({
      where: { id, companyId, status: 'draft' },
      data: { status: 'issued' },
    });
  });
  return getQuote(companyId, id);
}
