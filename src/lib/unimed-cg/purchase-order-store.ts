import { Decimal } from '@prisma/client-runtime-utils';
import type { UnimedCgParseStatus } from '@prisma/client';
import prisma from '@/lib/prisma';
import { isUniqueViolation } from '@/lib/prisma-errors';
import { formatMoneyDecimal } from '@/lib/money';
import type { UnimedCgParseStatus as DomainParseStatus } from './constants';
import type { ParsedUnimedCgPurchaseOrderItem } from './parse-purchase-order';

export type UnimedCgPurchaseOrderListItem = {
  id: string;
  orderNumber: string;
  orderDate: string | null;
  billingCnpj: string | null;
  paymentTerms: string | null;
  totalAmount: string;
  itemCount: number;
  firstProduct: string | null;
  firstQuantity: string | null;
  firstUnitPrice: string | null;
  receivedAt: string;
  fileName: string;
  parseStatus: UnimedCgParseStatus;
};

export type UnimedCgPurchaseOrderDetailItem = UnimedCgPurchaseOrderListItem & {
  requestNumber: string | null;
  buyerName: string | null;
  supplierName: string | null;
  supplierCnpj: string | null;
  oneDriveItemId: string;
  items: Array<{
    productCode: string | null;
    description: string;
    unit: string | null;
    quantity: string;
    unitPrice: string;
    lineTotal: string;
  }>;
};

function moneyString(value: Decimal): string {
  return formatMoneyDecimal(value);
}

function qtyString(value: Decimal): string {
  return new Decimal(value).toFixed();
}

export async function listUnimedCgPurchaseOrders(
  companyId: string,
): Promise<UnimedCgPurchaseOrderListItem[]> {
  const rows = await prisma.unimedCgPurchaseOrder.findMany({
    where: { companyId },
    orderBy: [{ receivedAt: 'desc' }, { orderNumber: 'desc' }],
    include: {
      items: { orderBy: { lineNumber: 'asc' } },
    },
  });

  return rows.map((row) => {
    const first = row.items[0];
    return {
      id: row.id,
      orderNumber: row.orderNumber,
      orderDate: row.orderDate ? row.orderDate.toISOString() : null,
      billingCnpj: row.billingCnpj,
      paymentTerms: row.paymentTerms,
      totalAmount: moneyString(row.totalAmount),
      itemCount: row.items.length,
      firstProduct: first?.description ?? null,
      firstQuantity: first ? qtyString(first.quantity) : null,
      firstUnitPrice: first ? moneyString(first.unitPrice) : null,
      receivedAt: row.receivedAt.toISOString(),
      fileName: row.fileName,
      parseStatus: row.parseStatus,
    };
  });
}

export async function getUnimedCgPurchaseOrder(
  companyId: string,
  id: string,
): Promise<UnimedCgPurchaseOrderDetailItem | null> {
  const row = await prisma.unimedCgPurchaseOrder.findFirst({
    where: { id, companyId },
    include: { items: { orderBy: { lineNumber: 'asc' } } },
  });
  if (!row) return null;
  const first = row.items[0];
  return {
    id: row.id,
    orderNumber: row.orderNumber,
    orderDate: row.orderDate ? row.orderDate.toISOString() : null,
    billingCnpj: row.billingCnpj,
    paymentTerms: row.paymentTerms,
    totalAmount: moneyString(row.totalAmount),
    itemCount: row.items.length,
    firstProduct: first?.description ?? null,
    firstQuantity: first ? qtyString(first.quantity) : null,
    firstUnitPrice: first ? moneyString(first.unitPrice) : null,
    receivedAt: row.receivedAt.toISOString(),
    fileName: row.fileName,
    parseStatus: row.parseStatus,
    requestNumber: row.requestNumber,
    buyerName: row.buyerName,
    supplierName: row.supplierName,
    supplierCnpj: row.supplierCnpj,
    oneDriveItemId: row.oneDriveItemId,
    items: row.items.map((item) => ({
      productCode: item.productCode,
      description: item.description,
      unit: item.unit,
      quantity: qtyString(item.quantity),
      unitPrice: moneyString(item.unitPrice),
      lineTotal: moneyString(item.lineTotal),
    })),
  };
}

export type PersistPurchaseOrderInput = {
  companyId: string;
  orderNumber: string;
  requestNumber: string | null;
  orderDate: Date | null;
  billingCnpj: string | null;
  buyerName: string | null;
  paymentTerms: string | null;
  paymentTermsCode: string | null;
  deliveryFrom: Date | null;
  deliveryTo: Date | null;
  supplierName: string | null;
  supplierCnpj: string | null;
  totalAmount: string;
  items: ParsedUnimedCgPurchaseOrderItem[];
  parseStatus: DomainParseStatus;
  fileName: string;
  oneDriveItemId: string;
  receivedAt: Date;
  internetMessageId?: string;
  mailbox?: string;
  graphMessageId?: string;
};

function itemRows(companyId: string, orderId: string, items: ParsedUnimedCgPurchaseOrderItem[]) {
  return items.map((item, index) => ({
    companyId,
    purchaseOrderId: orderId,
    lineNumber: index + 1,
    productCode: item.productCode,
    description: item.description,
    unit: item.unit,
    quantity: new Decimal(item.quantity),
    unitPrice: new Decimal(item.unitPrice),
    lineTotal: new Decimal(item.lineTotal),
  }));
}

export async function persistConfirmedPurchaseOrder(
  input: PersistPurchaseOrderInput,
): Promise<{ id: string }> {
  return prisma.$transaction(async (tx) => {
    const created = await tx.unimedCgPurchaseOrder.create({
      data: {
        companyId: input.companyId,
        orderNumber: input.orderNumber,
        requestNumber: input.requestNumber,
        orderDate: input.orderDate,
        billingCnpj: input.billingCnpj,
        buyerName: input.buyerName,
        paymentTerms: input.paymentTerms,
        paymentTermsCode: input.paymentTermsCode,
        deliveryFrom: input.deliveryFrom,
        deliveryTo: input.deliveryTo,
        supplierName: input.supplierName,
        supplierCnpj: input.supplierCnpj,
        totalAmount: new Decimal(input.totalAmount),
        oneDriveItemId: input.oneDriveItemId,
        fileName: input.fileName,
        parseStatus: input.parseStatus,
        receivedAt: input.receivedAt,
      },
      select: { id: true },
    });
    if (input.items.length) {
      await tx.unimedCgPurchaseOrderItem.createMany({
        data: itemRows(input.companyId, created.id, input.items),
      });
    }
    if (input.internetMessageId && input.mailbox && input.graphMessageId) {
      await tx.unimedCgPurchaseOrderSourceMessage.create({
        data: {
          companyId: input.companyId,
          purchaseOrderId: created.id,
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

export async function persistUpgradePurchaseOrder(
  input: PersistPurchaseOrderInput & { purchaseOrderId: string },
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.unimedCgPurchaseOrderItem.deleteMany({
      where: { purchaseOrderId: input.purchaseOrderId },
    });
    await tx.unimedCgPurchaseOrder.update({
      where: { id: input.purchaseOrderId },
      data: {
        requestNumber: input.requestNumber,
        orderDate: input.orderDate,
        billingCnpj: input.billingCnpj,
        buyerName: input.buyerName,
        paymentTerms: input.paymentTerms,
        paymentTermsCode: input.paymentTermsCode,
        deliveryFrom: input.deliveryFrom,
        deliveryTo: input.deliveryTo,
        supplierName: input.supplierName,
        supplierCnpj: input.supplierCnpj,
        totalAmount: new Decimal(input.totalAmount),
        oneDriveItemId: input.oneDriveItemId,
        fileName: input.fileName,
        parseStatus: input.parseStatus,
      },
    });
    if (input.items.length) {
      await tx.unimedCgPurchaseOrderItem.createMany({
        data: itemRows(input.companyId, input.purchaseOrderId, input.items),
      });
    }
    if (input.internetMessageId && input.mailbox && input.graphMessageId) {
      await tx.unimedCgPurchaseOrderSourceMessage.create({
        data: {
          companyId: input.companyId,
          purchaseOrderId: input.purchaseOrderId,
          mailbox: input.mailbox,
          graphMessageId: input.graphMessageId,
          internetMessageId: input.internetMessageId,
          receivedAt: input.receivedAt,
        },
      });
    }
  });
}

export async function persistPurchaseOrderSourceOnly(input: {
  companyId: string;
  purchaseOrderId: string;
  mailbox: string;
  graphMessageId: string;
  internetMessageId: string;
  receivedAt: Date;
}): Promise<void> {
  try {
    await prisma.unimedCgPurchaseOrderSourceMessage.create({
      data: {
        companyId: input.companyId,
        purchaseOrderId: input.purchaseOrderId,
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

export const prismaUnimedCgPurchaseOrderStore = {
  async findSourceByInternetMessageId(companyId: string, internetMessageId: string) {
    return prisma.unimedCgPurchaseOrderSourceMessage.findUnique({
      where: { companyId_internetMessageId: { companyId, internetMessageId } },
      select: { id: true, purchaseOrderId: true },
    });
  },
  async findByOrderNumber(companyId: string, orderNumber: string) {
    return prisma.unimedCgPurchaseOrder.findUnique({
      where: { companyId_orderNumber: { companyId, orderNumber } },
      select: {
        id: true,
        orderNumber: true,
        parseStatus: true,
        oneDriveItemId: true,
      },
    });
  },
  persistConfirmed: persistConfirmedPurchaseOrder,
  persistUpgrade: persistUpgradePurchaseOrder,
  persistSourceOnly: persistPurchaseOrderSourceOnly,
};
