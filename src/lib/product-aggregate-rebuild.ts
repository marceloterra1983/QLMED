import type { Prisma } from '@prisma/client';
import prisma from '@/lib/prisma';
import { ensureProductRegistryTable } from '@/lib/product-registry-store';
import {
  aggregateProductsFromInvoices,
  computeSearchText,
  type AggregatedProduct,
} from '@/lib/product-aggregation';
import {
  acquirePostgresAdvisoryLock,
  productAggregateLockKey,
} from '@/lib/postgres-advisory-lock';

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

  const result = await tx.$executeRawUnsafe(
    `
    UPDATE product_registry SET
      agg_total_quantity = $2,
      agg_total_value = $3,
      agg_invoice_count = $4,
      agg_last_price = $5,
      agg_average_price = $6,
      agg_last_issue_date = $7,
      agg_last_supplier_name = $8,
      agg_last_supplier_cnpj = $9,
      agg_last_invoice_number = $10,
      agg_last_sale_date = $11,
      agg_last_sale_price = $12,
      agg_resale_quantity = $13,
      agg_computed_at = $14,
      agg_search_text = $15,
      product_type = COALESCE(product_type, $16),
      product_subtype = COALESCE(product_subtype, $17),
      product_subgroup = COALESCE(product_subgroup, $18),
      updated_at = NOW()
    WHERE company_id = $1
      AND product_key = $19
    `,
    companyId,
    agg.totalQuantity,
    agg.totalValue,
    agg.invoiceCount,
    agg.lastPrice,
    averagePrice,
    agg.lastIssueDate,
    agg.lastSupplierName,
    agg.lastSupplierCnpj,
    agg.lastInvoiceNumber,
    agg.lastSaleDate,
    agg.lastSalePrice,
    agg.resaleQuantity,
    computedAt,
    searchText,
    agg.productType,
    agg.productSubtype,
    agg.productSubgroup,
    agg.key,
  );

  return typeof result === 'number' && result > 0;
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

  await tx.$executeRawUnsafe(
    `
    INSERT INTO product_registry (
      id, company_id, product_key, code, description, ncm, unit, ean,
      anvisa_code, product_type, product_subtype, product_subgroup,
      agg_total_quantity, agg_total_value, agg_invoice_count,
      agg_last_price, agg_average_price, agg_last_issue_date,
      agg_last_supplier_name, agg_last_supplier_cnpj, agg_last_invoice_number,
      agg_last_sale_date, agg_last_sale_price, agg_resale_quantity,
      agg_computed_at, agg_search_text,
      codigo,
      created_at, updated_at
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8,
      $9, $10, $11, $12,
      $13, $14, $15, $16, $17, $18,
      $19, $20, $21, $22, $23, $24,
      $25, $26,
      (SELECT LPAD((COALESCE(MAX(CAST(NULLIF(REGEXP_REPLACE(codigo, '[^0-9]', '', 'g'), '') AS BIGINT)), 0) + 1)::TEXT, 5, '0') FROM product_registry WHERE company_id = $2),
      NOW(), NOW()
    )
    ON CONFLICT (company_id, product_key) DO UPDATE SET
      agg_total_quantity = EXCLUDED.agg_total_quantity,
      agg_total_value = EXCLUDED.agg_total_value,
      agg_invoice_count = EXCLUDED.agg_invoice_count,
      agg_last_price = EXCLUDED.agg_last_price,
      agg_average_price = EXCLUDED.agg_average_price,
      agg_last_issue_date = EXCLUDED.agg_last_issue_date,
      agg_last_supplier_name = EXCLUDED.agg_last_supplier_name,
      agg_last_supplier_cnpj = EXCLUDED.agg_last_supplier_cnpj,
      agg_last_invoice_number = EXCLUDED.agg_last_invoice_number,
      agg_last_sale_date = EXCLUDED.agg_last_sale_date,
      agg_last_sale_price = EXCLUDED.agg_last_sale_price,
      agg_resale_quantity = EXCLUDED.agg_resale_quantity,
      agg_computed_at = EXCLUDED.agg_computed_at,
      agg_search_text = EXCLUDED.agg_search_text,
      updated_at = NOW()
    `,
    crypto.randomUUID(),
    companyId,
    agg.key,
    agg.code,
    agg.description,
    agg.ncm,
    agg.unit,
    agg.ean,
    agg.anvisa,
    agg.productType,
    agg.productSubtype,
    agg.productSubgroup,
    agg.totalQuantity,
    agg.totalValue,
    agg.invoiceCount,
    agg.lastPrice,
    averagePrice,
    agg.lastIssueDate,
    agg.lastSupplierName,
    agg.lastSupplierCnpj,
    agg.lastInvoiceNumber,
    agg.lastSaleDate,
    agg.lastSalePrice,
    agg.resaleQuantity,
    computedAt,
    searchText,
  );
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
    await ensureProductRegistryTable();
    const startedAt = Date.now();
    const [{ now: cutoffCreatedAt }] = await prisma.$queryRaw<{ now: Date }[]>`
      SELECT CURRENT_TIMESTAMP AS now
    `;
    const productMap = await aggregateProductsFromInvoices(companyId, {
      createdAtLte: cutoffCreatedAt,
      strictXml: true,
    });
    const aggregationTimeMs = Date.now() - startedAt;
    const entries = Array.from(productMap.values());
    const computedAt = new Date();

    const writeResult = await prisma.$transaction(async (tx) => {
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

      const stampedCount = await tx.$executeRawUnsafe(
        `
        UPDATE product_registry SET
          agg_total_quantity = 0,
          agg_total_value = 0,
          agg_invoice_count = 0,
          agg_last_price = 0,
          agg_average_price = 0,
          agg_last_issue_date = NULL,
          agg_last_supplier_name = NULL,
          agg_last_supplier_cnpj = NULL,
          agg_last_invoice_number = NULL,
          agg_last_sale_date = NULL,
          agg_last_sale_price = NULL,
          agg_resale_quantity = 0,
          agg_computed_at = $2,
          agg_search_text = COALESCE(agg_search_text,
            LOWER(COALESCE(code, '') || ' ' || COALESCE(description, '') || ' ' || COALESCE(ncm, '') || ' ' || COALESCE(anvisa_code, ''))),
          updated_at = NOW()
        WHERE company_id = $1
          AND (agg_computed_at IS NULL OR agg_computed_at < $2)
        `,
        companyId,
        computedAt,
      );

      await tx.productAggregateRebuildState.upsert({
        where: { companyId },
        create: { companyId, cutoffCreatedAt, completedAt: computedAt },
        update: { cutoffCreatedAt, completedAt: computedAt },
      });

      return {
        updatedCount,
        createdCount,
        stampedCount: typeof stampedCount === 'number' ? stampedCount : 0,
      };
    }, { timeout: WRITE_TRANSACTION_TIMEOUT_MS });

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
