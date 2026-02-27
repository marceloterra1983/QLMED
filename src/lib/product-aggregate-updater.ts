/**
 * Incremental product aggregate updater.
 * Called after each invoice upsert to keep agg_* columns fresh.
 * Also provides the daily full rebuild schedule.
 */

import prisma from '@/lib/prisma';
import { ensureProductRegistryTable } from '@/lib/product-registry-store';
import {
  extractProductsFromXml,
  buildProductKey,
  normalizeUnit,
  isResaleCustomer,
  computeSearchText,
  normalizeAnvisaRegistration,
  type ProductFromXml,
} from '@/lib/product-aggregation';
import { isImportEntryCfop, extractFirstCfop } from '@/lib/cfop';

/**
 * Update product aggregates for a single invoice after it's been upserted.
 * This is a lightweight incremental update — it processes only the products
 * in this invoice and updates the affected registry rows.
 */
export async function updateProductAggregatesForInvoice(opts: {
  companyId: string;
  invoiceId: string;
  xmlContent: string;
  direction: 'received' | 'issued';
  issueDate: Date | null;
  senderName: string | null;
  senderCnpj: string | null;
  recipientName: string | null;
  recipientCnpj: string | null;
  invoiceNumber: string | null;
}): Promise<void> {
  try {
    await ensureProductRegistryTable();

    const products = await extractProductsFromXml(opts.xmlContent);
    if (products.length === 0) return;

    const cfop = extractFirstCfop(opts.xmlContent);
    const isImport = isImportEntryCfop(cfop);
    const isResale = isResaleCustomer(opts.recipientName);

    // Determine what kind of invoice this is
    if (opts.direction === 'received') {
      // Normal purchase — add to aggregates
      await upsertProductAggregates(opts, products, 'purchase');
    } else if (opts.direction === 'issued' && isImport) {
      // Import entry — add to aggregates (supplier is recipient)
      await upsertProductAggregates(opts, products, 'import');
    } else if (opts.direction === 'issued' && isResale) {
      // Resale deduction — subtract from aggregates
      await updateResaleDeductions(opts, products);
    } else if (opts.direction === 'issued') {
      // Normal sale — update last sale date
      await updateSaleDate(opts, products);
    }
  } catch (err) {
    console.error('[product-aggregate-updater] Error:', err);
  }
}

async function upsertProductAggregates(
  opts: {
    companyId: string;
    invoiceId: string;
    issueDate: Date | null;
    senderName: string | null;
    senderCnpj: string | null;
    recipientName: string | null;
    recipientCnpj: string | null;
    invoiceNumber: string | null;
  },
  products: ProductFromXml[],
  mode: 'purchase' | 'import',
) {
  const supplierName = mode === 'import' ? opts.recipientName : opts.senderName;
  const supplierCnpj = mode === 'import' ? opts.recipientCnpj : opts.senderCnpj;

  for (const product of products) {
    const key = buildProductKey(product);
    const searchText = computeSearchText({
      code: product.code,
      description: product.description,
      ncm: product.ncm,
      anvisa: product.anvisa,
      lastSupplierName: supplierName,
    });

    // Try to update existing row with incremental arithmetic
    const updated = await prisma.$executeRawUnsafe(
      `
      UPDATE product_registry SET
        agg_total_quantity = COALESCE(agg_total_quantity, 0) + $2,
        agg_total_value = COALESCE(agg_total_value, 0) + $3,
        agg_invoice_count = COALESCE(agg_invoice_count, 0) + 1,
        agg_last_price = CASE
          WHEN $4::timestamptz IS NULL THEN COALESCE(agg_last_price, $5)
          WHEN agg_last_issue_date IS NULL THEN $5
          WHEN $4::timestamptz >= agg_last_issue_date THEN $5
          ELSE agg_last_price
        END,
        agg_average_price = CASE
          WHEN (COALESCE(agg_total_quantity, 0) + $2) > 0
            THEN (COALESCE(agg_total_value, 0) + $3) / (COALESCE(agg_total_quantity, 0) + $2)
          ELSE 0
        END,
        agg_last_issue_date = CASE
          WHEN $4::timestamptz IS NULL THEN agg_last_issue_date
          WHEN agg_last_issue_date IS NULL THEN $4::timestamptz
          WHEN $4::timestamptz >= agg_last_issue_date THEN $4::timestamptz
          ELSE agg_last_issue_date
        END,
        agg_last_supplier_name = CASE
          WHEN $4::timestamptz IS NULL THEN COALESCE(agg_last_supplier_name, $6)
          WHEN agg_last_issue_date IS NULL THEN $6
          WHEN $4::timestamptz >= agg_last_issue_date THEN $6
          ELSE agg_last_supplier_name
        END,
        agg_last_supplier_cnpj = CASE
          WHEN $4::timestamptz IS NULL THEN COALESCE(agg_last_supplier_cnpj, $7)
          WHEN agg_last_issue_date IS NULL THEN $7
          WHEN $4::timestamptz >= agg_last_issue_date THEN $7
          ELSE agg_last_supplier_cnpj
        END,
        agg_last_invoice_number = CASE
          WHEN $4::timestamptz IS NULL THEN COALESCE(agg_last_invoice_number, $8)
          WHEN agg_last_issue_date IS NULL THEN $8
          WHEN $4::timestamptz >= agg_last_issue_date THEN $8
          ELSE agg_last_invoice_number
        END,
        agg_computed_at = NOW(),
        agg_search_text = $9,
        updated_at = NOW()
      WHERE company_id = $1 AND product_key = $10
      `,
      opts.companyId,
      product.quantity,
      product.totalValue,
      opts.issueDate,
      product.unitPrice,
      supplierName,
      supplierCnpj,
      opts.invoiceNumber,
      searchText,
      key,
    );

    // If no existing row, create one (product wasn't in registry yet)
    if (typeof updated === 'number' && updated === 0) {
      const id = crypto.randomUUID();
      const avgPrice = product.quantity > 0 ? product.totalValue / product.quantity : 0;

      await prisma.$executeRawUnsafe(
        `
        INSERT INTO product_registry (
          id, company_id, product_key, code, description, ncm, unit, ean,
          anvisa_code, product_type, product_subtype,
          agg_total_quantity, agg_total_value, agg_invoice_count,
          agg_last_price, agg_average_price, agg_last_issue_date,
          agg_last_supplier_name, agg_last_supplier_cnpj, agg_last_invoice_number,
          agg_computed_at, agg_search_text,
          created_at, updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8,
          $9, $10, $11,
          $12, $13, 1,
          $14, $15, $16,
          $17, $18, $19,
          NOW(), $20,
          NOW(), NOW()
        )
        ON CONFLICT (company_id, product_key) DO NOTHING
        `,
        id,
        opts.companyId,
        key,
        product.code,
        product.description,
        product.ncm,
        normalizeUnit(product.unit),
        product.ean,
        normalizeAnvisaRegistration(product.anvisa),
        mode === 'import' ? 'LINHA CARDIACA' : null,
        mode === 'import' ? 'VALVULAS IMPORTADAS' : null,
        product.quantity,
        product.totalValue,
        product.unitPrice,
        avgPrice,
        opts.issueDate,
        supplierName,
        supplierCnpj,
        opts.invoiceNumber,
        searchText,
      );
    }
  }
}

async function updateResaleDeductions(
  opts: { companyId: string },
  products: ProductFromXml[],
) {
  for (const product of products) {
    const key = buildProductKey(product);

    await prisma.$executeRawUnsafe(
      `
      UPDATE product_registry SET
        agg_total_quantity = COALESCE(agg_total_quantity, 0) - $2,
        agg_total_value = COALESCE(agg_total_value, 0) - $3,
        agg_resale_quantity = COALESCE(agg_resale_quantity, 0) + $2,
        agg_average_price = CASE
          WHEN (COALESCE(agg_total_quantity, 0) - $2) > 0
            THEN (COALESCE(agg_total_value, 0) - $3) / (COALESCE(agg_total_quantity, 0) - $2)
          ELSE COALESCE(agg_average_price, 0)
        END,
        agg_computed_at = NOW(),
        updated_at = NOW()
      WHERE company_id = $1 AND product_key = $4
      `,
      opts.companyId,
      product.quantity,
      product.totalValue,
      key,
    );
  }
}

async function updateSaleDate(
  opts: { companyId: string; issueDate: Date | null },
  products: ProductFromXml[],
) {
  if (!opts.issueDate) return;

  for (const product of products) {
    const key = buildProductKey(product);

    await prisma.$executeRawUnsafe(
      `
      UPDATE product_registry SET
        agg_last_sale_date = CASE
          WHEN agg_last_sale_date IS NULL THEN $2::timestamptz
          WHEN $2::timestamptz > agg_last_sale_date THEN $2::timestamptz
          ELSE agg_last_sale_date
        END,
        agg_last_sale_price = CASE
          WHEN agg_last_sale_date IS NULL THEN $3
          WHEN $2::timestamptz > agg_last_sale_date THEN $3
          ELSE agg_last_sale_price
        END,
        agg_computed_at = NOW(),
        updated_at = NOW()
      WHERE company_id = $1 AND product_key = $4
      `,
      opts.companyId,
      opts.issueDate,
      product.unitPrice,
      key,
    );
  }
}

// ── Daily rebuild scheduling ──

let rebuildScheduled = false;

export function scheduleNightlyRebuild() {
  if (rebuildScheduled) return;
  rebuildScheduled = true;

  const scheduleNext = () => {
    const now = new Date();
    const target = new Date(now);
    target.setHours(3, 0, 0, 0);
    if (target <= now) target.setDate(target.getDate() + 1);

    const delay = target.getTime() - now.getTime();
    console.log(`[product-aggregates] Next rebuild scheduled for ${target.toISOString()} (in ${Math.round(delay / 60000)}min)`);

    setTimeout(async () => {
      try {
        console.log('[product-aggregates] Starting nightly rebuild...');
        const { aggregateProductsFromInvoices, computeSearchText } = await import('@/lib/product-aggregation');
        const { getOrCreateSingleCompany } = await import('@/lib/single-company');

        // Get all companies
        const companies = await prisma.company.findMany({ select: { id: true } });

        for (const company of companies) {
          try {
            await ensureProductRegistryTable();
            const productMap = await aggregateProductsFromInvoices(company.id);
            const entries = Array.from(productMap.values());

            for (const agg of entries) {
              const searchText = computeSearchText({
                code: agg.code,
                description: agg.description,
                ncm: agg.ncm,
                anvisa: agg.anvisa,
                lastSupplierName: agg.lastSupplierName,
              });
              const averagePrice = agg.totalQuantity > 0 ? agg.totalValue / agg.totalQuantity : 0;

              await prisma.$executeRawUnsafe(
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
                  updated_at = NOW()
                WHERE company_id = $1 AND product_key = $15
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
                agg.key,
              );
            }

            console.log(`[product-aggregates] Rebuilt ${entries.length} products for company ${company.id}`);
          } catch (err) {
            console.error(`[product-aggregates] Rebuild failed for company ${company.id}:`, err);
          }
        }
      } catch (err) {
        console.error('[product-aggregates] Nightly rebuild error:', err);
      }

      // Schedule next run
      scheduleNext();
    }, delay);
  };

  scheduleNext();
}
