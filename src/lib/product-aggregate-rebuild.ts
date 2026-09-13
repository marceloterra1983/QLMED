import type { Prisma } from '@prisma/client';
import prisma from '@/lib/prisma';
import { aggregateProductsFromInvoices, computeSearchText, type AggregatedProduct } from '@/lib/product-aggregation';
import { acquirePostgresAdvisoryLock, productAggregateLockKey } from '@/lib/postgres-advisory-lock';
import { createLogger } from '@/lib/logger';

const log = createLogger('product-aggregate-rebuild');

/**
 * Zera só os totais que este rebuild recompõe pela productKey do XML.
 * Data, nota, fornecedor e preço da última compra ficam: o incremental grava
 * esses campos por EAN/código, e apagá-los aqui some com a compra na tela
 * sem a nota conseguir repor (a nota já foi marcada como incluída no rebuild).
 */
export function unmatchedAggregateReset(input: { searchText: string; computedAt: Date }) {
  return {
    aggTotalQuantity: 0,
    aggTotalValue: 0,
    aggInvoiceCount: 0,
    aggAveragePrice: 0,
    aggResaleQuantity: 0,
    aggComputedAt: input.computedAt,
    aggSearchText: input.searchText,
    updatedAt: new Date(),
  };
}

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

        // Catálogo oficial = cadastro Spica. Rebuild só atualiza agregados de
        // produtos já cadastrados; não recria órfãos a partir de NF recebidas.
        let skippedMissingCount = 0;
        for (const agg of entries) {
          if (await updateExistingProduct(tx, companyId, agg, computedAt)) {
            updatedCount++;
          } else {
            skippedMissingCount++;
          }
        }
        if (skippedMissingCount > 0) {
          // createdCount permanece 0 — API compat; skip é observabilidade.
          log.info({ companyId, skippedMissingCount }, 'product_aggregate_rebuild_skipped_missing');
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
            data: unmatchedAggregateReset({
              searchText:
                row.aggSearchText ??
                computeSearchText({
                  code: row.code,
                  description: row.description,
                  ncm: row.ncm,
                  anvisa: row.anvisaCode,
                  lastSupplierName: null,
                }),
              computedAt,
            }),
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
