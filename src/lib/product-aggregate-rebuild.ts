import { randomUUID } from 'crypto';
import type { Prisma } from '@prisma/client';
import prisma from '@/lib/prisma';
import { aggregateProductsFromInvoices, computeSearchText, type AggregatedProduct } from '@/lib/product-aggregation';
import { acquirePostgresAdvisoryLock, productAggregateLockKey } from '@/lib/postgres-advisory-lock';

const WRITE_TRANSACTION_TIMEOUT_MS = 15 * 60 * 1000;

export interface ProductAggregateRebuildResult {
  totalProducts: number;
  updatedCount: number;
  createdCount: number;
  stampedCount: number;
  aggregationTimeMs: number;
  totalTimeMs: number;
  cutoffCreatedAt: Date;
}

async function nextCodigo(
  tx: Prisma.TransactionClient,
  companyId: string,
): Promise<string> {
  const codigos = await tx.productRegistry.findMany({
    where: { companyId, NOT: { codigo: null } },
    select: { codigo: true },
  });
  let maxNum = 0;
  for (const row of codigos) {
    const digits = (row.codigo || '').replace(/\D/g, '');
    if (!digits) continue;
    const n = Number(digits);
    if (Number.isFinite(n) && n > maxNum) maxNum = n;
  }
  return String(maxNum + 1).padStart(5, '0');
}

async function updateExistingProduct(
  tx: Prisma.TransactionClient,
  companyId: string,
  agg: AggregatedProduct,
  computedAt: Date,
): Promise<boolean> {
  const searchText = computeSearchText({
    code: agg.code,
    description: agg.description,
    ncm: agg.ncm,
    anvisa: agg.anvisa,
    lastSupplierName: agg.lastSupplierName,
  });
  const averagePrice = agg.totalQuantity > 0 ? agg.totalValue / agg.totalQuantity : 0;

  const existing = await tx.productRegistry.findUnique({
    where: {
      companyId_productKey: {
        companyId,
        productKey: agg.key,
      },
    },
    select: {
      id: true,
      productType: true,
      productSubtype: true,
      productSubgroup: true,
    },
  });
  if (!existing) return false;

  await tx.productRegistry.update({
    where: { id: existing.id },
    data: {
      aggTotalQuantity: agg.totalQuantity,
      aggTotalValue: agg.totalValue,
      aggInvoiceCount: agg.invoiceCount,
      aggLastPrice: agg.lastPrice,
      aggAveragePrice: averagePrice,
      aggLastIssueDate: agg.lastIssueDate,
      aggLastSupplierName: agg.lastSupplierName,
      aggLastSupplierCnpj: agg.lastSupplierCnpj,
      aggLastInvoiceNumber: agg.lastInvoiceNumber,
      aggLastSaleDate: agg.lastSaleDate,
      aggLastSalePrice: agg.lastSalePrice,
      aggResaleQuantity: agg.resaleQuantity,
      aggComputedAt: computedAt,
      aggSearchText: searchText,
      productType: existing.productType ?? agg.productType,
      productSubtype: existing.productSubtype ?? agg.productSubtype,
      productSubgroup: existing.productSubgroup ?? agg.productSubgroup,
      updatedAt: new Date(),
    },
  });
  return true;
}

async function createMissingProduct(
  tx: Prisma.TransactionClient,
  companyId: string,
  agg: AggregatedProduct,
  computedAt: Date,
): Promise<void> {
  const searchText = computeSearchText({
    code: agg.code,
    description: agg.description,
    ncm: agg.ncm,
    anvisa: agg.anvisa,
    lastSupplierName: agg.lastSupplierName,
  });
  const averagePrice = agg.totalQuantity > 0 ? agg.totalValue / agg.totalQuantity : 0;
  const now = new Date();
  const codigo = await nextCodigo(tx, companyId);

  await tx.productRegistry.upsert({
    where: {
      companyId_productKey: {
        companyId,
        productKey: agg.key,
      },
    },
    create: {
      id: randomUUID(),
      companyId,
      productKey: agg.key,
      code: agg.code,
      description: agg.description || '',
      ncm: agg.ncm,
      unit: agg.unit,
      ean: agg.ean,
      anvisaCode: agg.anvisa,
      productType: agg.productType,
      productSubtype: agg.productSubtype,
      productSubgroup: agg.productSubgroup,
      aggTotalQuantity: agg.totalQuantity,
      aggTotalValue: agg.totalValue,
      aggInvoiceCount: agg.invoiceCount,
      aggLastPrice: agg.lastPrice,
      aggAveragePrice: averagePrice,
      aggLastIssueDate: agg.lastIssueDate,
      aggLastSupplierName: agg.lastSupplierName,
      aggLastSupplierCnpj: agg.lastSupplierCnpj,
      aggLastInvoiceNumber: agg.lastInvoiceNumber,
      aggLastSaleDate: agg.lastSaleDate,
      aggLastSalePrice: agg.lastSalePrice,
      aggResaleQuantity: agg.resaleQuantity,
      aggComputedAt: computedAt,
      aggSearchText: searchText,
      codigo,
      createdAt: now,
      updatedAt: now,
    },
    update: {
      aggTotalQuantity: agg.totalQuantity,
      aggTotalValue: agg.totalValue,
      aggInvoiceCount: agg.invoiceCount,
      aggLastPrice: agg.lastPrice,
      aggAveragePrice: averagePrice,
      aggLastIssueDate: agg.lastIssueDate,
      aggLastSupplierName: agg.lastSupplierName,
      aggLastSupplierCnpj: agg.lastSupplierCnpj,
      aggLastInvoiceNumber: agg.lastInvoiceNumber,
      aggLastSaleDate: agg.lastSaleDate,
      aggLastSalePrice: agg.lastSalePrice,
      aggResaleQuantity: agg.resaleQuantity,
      aggComputedAt: computedAt,
      aggSearchText: searchText,
      updatedAt: now,
    },
  });
}

export async function rebuildProductAggregatesForCompany(
  companyId: string,
  options: { waitForLock?: boolean } = {},
): Promise<ProductAggregateRebuildResult | null> {
  const lock = await acquirePostgresAdvisoryLock(
    productAggregateLockKey(companyId),
    { wait: options.waitForLock },
  );
  if (!lock) return null;

  try {
    const startedAt = Date.now();
    const cutoffCreatedAt = new Date();
    const productMap = await aggregateProductsFromInvoices(companyId, {
      createdAtLte: cutoffCreatedAt,
      strictXml: true,
    });
    const aggregationTimeMs = Date.now() - startedAt;
    const entries = Array.from(productMap.values());
    const computedAt = new Date();

    const writeResult = await prisma.$transaction(
      async (tx) => {
        let updatedCount = 0;
        let createdCount = 0;

        for (const agg of entries) {
          if (await updateExistingProduct(tx, companyId, agg, computedAt)) {
            updatedCount++;
          } else {
            await createMissingProduct(tx, companyId, agg, computedAt);
            createdCount++;
          }
        }

        // Zero out registry rows not touched by this rebuild (stale aggregates)
        const stale = await tx.productRegistry.findMany({
          where: {
            companyId,
            OR: [{ aggComputedAt: null }, { aggComputedAt: { lt: computedAt } }],
          },
          select: {
            id: true,
            code: true,
            description: true,
            ncm: true,
            anvisaCode: true,
            aggSearchText: true,
          },
        });

        for (const row of stale) {
          await tx.productRegistry.update({
            where: { id: row.id },
            data: {
              aggTotalQuantity: 0,
              aggTotalValue: 0,
              aggInvoiceCount: 0,
              aggLastPrice: 0,
              aggAveragePrice: 0,
              aggLastIssueDate: null,
              aggLastSupplierName: null,
              aggLastSupplierCnpj: null,
              aggLastInvoiceNumber: null,
              aggLastSaleDate: null,
              aggLastSalePrice: null,
              aggResaleQuantity: 0,
              aggComputedAt: computedAt,
              aggSearchText:
                row.aggSearchText ??
                computeSearchText({
                  code: row.code,
                  description: row.description,
                  ncm: row.ncm,
                  anvisa: row.anvisaCode,
                  lastSupplierName: null,
                }),
              updatedAt: new Date(),
            },
          });
        }

        await tx.productAggregateRebuildState.upsert({
          where: { companyId },
          create: { companyId, cutoffCreatedAt, completedAt: computedAt },
          update: { cutoffCreatedAt, completedAt: computedAt },
        });

        return {
          updatedCount,
          createdCount,
          stampedCount: stale.length,
        };
      },
      { timeout: WRITE_TRANSACTION_TIMEOUT_MS },
    );

    return {
      totalProducts: entries.length,
      ...writeResult,
      aggregationTimeMs,
      totalTimeMs: Date.now() - startedAt,
      cutoffCreatedAt,
    };
  } finally {
    await lock.release();
  }
}
