import { NextResponse } from 'next/server';
import { requireAuth, unauthorizedResponse } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { getOrCreateSingleCompany } from '@/lib/single-company';
import { ensureProductRegistryTable } from '@/lib/product-registry-store';
import {
  aggregateProductsFromInvoices,
  computeSearchText,
} from '@/lib/product-aggregation';

export async function POST() {
  try {
    let userId: string;
    try {
      userId = await requireAuth();
    } catch {
      return unauthorizedResponse();
    }

    const company = await getOrCreateSingleCompany(userId);
    await ensureProductRegistryTable();

    const startTime = Date.now();
    const productMap = await aggregateProductsFromInvoices(company.id);
    const aggregationTime = Date.now() - startTime;

    // Batch write aggregated data into product_registry
    const entries = Array.from(productMap.values());
    let updatedCount = 0;
    const BATCH_SIZE = 100;

    for (let i = 0; i < entries.length; i += BATCH_SIZE) {
      const batch = entries.slice(i, i + BATCH_SIZE);

      await Promise.all(
        batch.map(async (agg) => {
          const searchText = computeSearchText({
            code: agg.code,
            description: agg.description,
            ncm: agg.ncm,
            anvisa: agg.anvisa,
            lastSupplierName: agg.lastSupplierName,
          });

          const averagePrice = agg.totalQuantity > 0
            ? agg.totalValue / agg.totalQuantity
            : 0;

          // Only update rows that exist — we don't create new registry rows here.
          // Products must already be registered via the XML upsert flow.
          const result = await prisma.$executeRawUnsafe(
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
              agg_computed_at = NOW(),
              agg_search_text = $14,
              product_type = COALESCE(product_type, $15),
              product_subtype = COALESCE(product_subtype, $16),
              product_subgroup = COALESCE(product_subgroup, $17),
              updated_at = NOW()
            WHERE company_id = $1
              AND product_key = $18
            `,
            company.id,
            agg.totalQuantity,
            agg.totalValue,
            agg.invoiceIds.size,
            agg.lastPrice,
            averagePrice,
            agg.lastIssueDate,
            agg.lastSupplierName,
            agg.lastSupplierCnpj,
            agg.lastInvoiceNumber,
            agg.lastSaleDate,
            agg.lastSalePrice,
            agg.resaleQuantity,
            searchText,
            agg.productType,
            agg.productSubtype,
            agg.productSubgroup,
            agg.key,
          );

          if (typeof result === 'number' && result > 0) updatedCount++;
        }),
      );
    }

    // For products that exist in invoices but not yet in registry,
    // create registry rows with aggregate data
    const existingKeys = await prisma.$queryRawUnsafe<{ product_key: string }[]>(
      `SELECT product_key FROM product_registry WHERE company_id = $1`,
      company.id,
    );
    const existingKeySet = new Set(existingKeys.map((r) => r.product_key));

    const missingEntries = entries.filter((agg) => !existingKeySet.has(agg.key));
    let createdCount = 0;

    for (let i = 0; i < missingEntries.length; i += BATCH_SIZE) {
      const batch = missingEntries.slice(i, i + BATCH_SIZE);

      await Promise.all(
        batch.map(async (agg) => {
          const searchText = computeSearchText({
            code: agg.code,
            description: agg.description,
            ncm: agg.ncm,
            anvisa: agg.anvisa,
            lastSupplierName: agg.lastSupplierName,
          });

          const averagePrice = agg.totalQuantity > 0
            ? agg.totalValue / agg.totalQuantity
            : 0;

          const id = crypto.randomUUID();

          await prisma.$executeRawUnsafe(
            `
            INSERT INTO product_registry (
              id, company_id, product_key, code, description, ncm, unit, ean,
              anvisa_code, product_type, product_subtype, product_subgroup,
              agg_total_quantity, agg_total_value, agg_invoice_count,
              agg_last_price, agg_average_price, agg_last_issue_date,
              agg_last_supplier_name, agg_last_supplier_cnpj, agg_last_invoice_number,
              agg_last_sale_date, agg_last_sale_price, agg_resale_quantity,
              agg_computed_at, agg_search_text,
              created_at, updated_at
            ) VALUES (
              $1, $2, $3, $4, $5, $6, $7, $8,
              $9, $10, $11, $12,
              $13, $14, $15, $16, $17, $18,
              $19, $20, $21, $22, $23, $24,
              NOW(), $25,
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
              agg_computed_at = NOW(),
              agg_search_text = EXCLUDED.agg_search_text,
              updated_at = NOW()
            `,
            id,
            company.id,
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
            agg.invoiceIds.size,
            agg.lastPrice,
            averagePrice,
            agg.lastIssueDate,
            agg.lastSupplierName,
            agg.lastSupplierCnpj,
            agg.lastInvoiceNumber,
            agg.lastSaleDate,
            agg.lastSalePrice,
            agg.resaleQuantity,
            searchText,
          );
          createdCount++;
        }),
      );
    }

    // Mark remaining registry products (that had no invoice match) as computed
    // so they appear in the listing. Zero out their aggregates and build search text.
    const stampedCount = await prisma.$executeRawUnsafe(
      `
      UPDATE product_registry SET
        agg_total_quantity = COALESCE(agg_total_quantity, 0),
        agg_total_value = COALESCE(agg_total_value, 0),
        agg_invoice_count = COALESCE(agg_invoice_count, 0),
        agg_last_price = COALESCE(agg_last_price, 0),
        agg_average_price = COALESCE(agg_average_price, 0),
        agg_computed_at = NOW(),
        agg_search_text = COALESCE(agg_search_text,
          LOWER(COALESCE(code, '') || ' ' || COALESCE(description, '') || ' ' || COALESCE(ncm, '') || ' ' || COALESCE(anvisa_code, ''))),
        updated_at = NOW()
      WHERE company_id = $1
        AND agg_computed_at IS NULL
      `,
      company.id,
    );

    const totalTime = Date.now() - startTime;

    return NextResponse.json({
      ok: true,
      totalProducts: entries.length,
      updatedCount,
      createdCount,
      stampedCount: typeof stampedCount === 'number' ? stampedCount : 0,
      aggregationTimeMs: aggregationTime,
      totalTimeMs: totalTime,
    });
  } catch (error) {
    console.error('[rebuild-aggregates] Error:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
