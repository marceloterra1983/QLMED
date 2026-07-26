import prisma from '@/lib/prisma';
import { isImportEntryCfop, extractFirstCfop } from '@/lib/cfop';
import { isResaleCustomer } from '@/lib/resale-customers';
import type { Prisma } from '@prisma/client';
import { buildProductKey, normalizeUnit, type ProductFromXml } from './units';
import { extractProductsFromXml } from './xml-products';
import {
  INVOICE_PAGE_SIZE,
  XML_BATCH_SIZE,
  normalizeDescriptionToken,
  normalizeToken,
} from './shared';

export interface AggregatedProduct {
  key: string;
  code: string;
  description: string;
  ncm: string | null;
  unit: string;
  anvisa: string | null;
  ean: string | null;
  totalQuantity: number;
  totalValue: number;
  lastPrice: number;
  lastIssueDate: Date | null;
  lastSupplierName: string | null;
  lastSupplierCnpj: string | null;
  lastInvoiceId: string | null;
  lastInvoiceNumber: string | null;
  invoiceCount: number;
  lastCountedInvoiceId: string | null;
  productType: string | null;
  productSubtype: string | null;
  productSubgroup: string | null;
  resaleQuantity: number;
  lastSaleDate: Date | null;
  lastSalePrice: number | null;
}

type AggregationInvoice = {
  id: string;
  number: string;
  issueDate: Date;
  createdAt: Date;
  senderName: string;
  senderCnpj: string;
  recipientName: string | null;
  recipientCnpj: string | null;
  xmlContent: string;
};

async function* iterateAggregationInvoices(
  where: Prisma.InvoiceWhereInput,
): AsyncGenerator<AggregationInvoice[]> {
  let cursor: Pick<AggregationInvoice, 'issueDate' | 'createdAt' | 'id'> | null = null;

  while (true) {
    const afterCursor: Prisma.InvoiceWhereInput | undefined = cursor
      ? {
          OR: [
            { issueDate: { lt: cursor.issueDate } },
            { issueDate: cursor.issueDate, createdAt: { lt: cursor.createdAt } },
            { issueDate: cursor.issueDate, createdAt: cursor.createdAt, id: { lt: cursor.id } },
          ],
        }
      : undefined;

    const page: AggregationInvoice[] = await prisma.invoice.findMany({
      where: afterCursor ? { AND: [where, afterCursor] } : where,
      orderBy: [{ issueDate: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
      take: INVOICE_PAGE_SIZE,
      select: {
        id: true,
        number: true,
        issueDate: true,
        createdAt: true,
        senderName: true,
        senderCnpj: true,
        recipientName: true,
        recipientCnpj: true,
        xmlContent: true,
      },
    });

    if (page.length === 0) return;
    yield page;
    if (page.length < INVOICE_PAGE_SIZE) return;

    const last: AggregationInvoice = page[page.length - 1];
    cursor = { issueDate: last.issueDate, createdAt: last.createdAt, id: last.id };
  }
}

function throwIfBatchFailed(
  batch: PromiseSettledResult<unknown>[],
  strict: boolean | undefined,
): void {
  if (!strict) return;
  const failure = batch.find(
    (result): result is PromiseRejectedResult => result.status === 'rejected',
  );
  if (failure) throw failure.reason;
}

/**
 * Full aggregation of products from invoices — 3 passes:
 * 1. Received invoices (normal purchases)
 * 2. Issued invoices with import CFOPs (3xxx) — product entries
 * 3. Resale deductions (Navix/Prime)
 * + Sale date enrichment
 */
export async function aggregateProductsFromInvoices(
  companyId: string,
  options: { createdAtLte?: Date; strictXml?: boolean } = {},
): Promise<Map<string, AggregatedProduct>> {
  const productMap = new Map<string, AggregatedProduct>();
  const importProductKeys = new Set<string>();

  // ── Pass 1: received invoices (normal purchases) ──
  for await (const invoiceMetadata of iterateAggregationInvoices({
    companyId,
    type: 'NFE',
    direction: 'received',
    ...(options.createdAtLte ? { createdAt: { lte: options.createdAtLte } } : {}),
  })) {
    for (let i = 0; i < invoiceMetadata.length; i += XML_BATCH_SIZE) {
      const batchMeta = invoiceMetadata.slice(i, i + XML_BATCH_SIZE);

      const parsedBatch = await Promise.allSettled(
        batchMeta.map(async (invoice) => {
          if (!invoice.xmlContent) return null;
          const products = await extractProductsFromXml(invoice.xmlContent, {
            strict: options.strictXml,
          });
          return { invoice, products };
        }),
      );
      throwIfBatchFailed(parsedBatch, options.strictXml);

      for (const settled of parsedBatch) {
        const result = settled.status === 'fulfilled' ? settled.value : null;
        if (!result) continue;

        const { invoice, products } = result;
        const issueDate = invoice.issueDate ? new Date(invoice.issueDate) : null;

        for (const product of products) {
          const key = buildProductKey(product);
          const existing = productMap.get(key);

          if (!existing) {
            productMap.set(key, {
              key,
              code: product.code,
              description: product.description,
              ncm: product.ncm,
              unit: product.unit,
              anvisa: product.anvisa,
              ean: product.ean,
              totalQuantity: product.quantity,
              totalValue: product.totalValue,
              lastPrice: product.unitPrice,
              lastIssueDate: issueDate,
              lastSupplierName: invoice.senderName || null,
              lastSupplierCnpj: invoice.senderCnpj || null,
              lastInvoiceId: invoice.id,
              lastInvoiceNumber: invoice.number || null,
              invoiceCount: 1,
              lastCountedInvoiceId: invoice.id,
              productType: null,
              productSubtype: null,
              productSubgroup: null,
              resaleQuantity: 0,
              lastSaleDate: null,
              lastSalePrice: null,
            });
            continue;
          }

          existing.totalQuantity += product.quantity;
          existing.totalValue += product.totalValue;
          if (existing.lastCountedInvoiceId !== invoice.id) {
            existing.invoiceCount++;
            existing.lastCountedInvoiceId = invoice.id;
          }

          if (!existing.anvisa && product.anvisa) existing.anvisa = product.anvisa;
          if (!existing.ean && product.ean) existing.ean = product.ean;
          if ((!existing.code || existing.code === '-') && product.code && product.code !== '-') {
            existing.code = product.code;
          }
          if (!existing.ncm && product.ncm) existing.ncm = product.ncm;

          if (issueDate && (!existing.lastIssueDate || issueDate > existing.lastIssueDate)) {
            existing.lastIssueDate = issueDate;
            existing.lastPrice = product.unitPrice;
            existing.lastSupplierName = invoice.senderName || null;
            existing.lastSupplierCnpj = invoice.senderCnpj || null;
            existing.lastInvoiceId = invoice.id;
            existing.lastInvoiceNumber = invoice.number || null;
          }
        }
      }
    }
  }

  // ── Pass 2: issued invoices with import CFOPs (3xxx) ──
  {
    for await (const importInvoiceMeta of iterateAggregationInvoices({
      companyId,
      type: 'NFE',
      direction: 'issued',
      ...(options.createdAtLte ? { createdAt: { lte: options.createdAtLte } } : {}),
    })) {
      for (let i = 0; i < importInvoiceMeta.length; i += XML_BATCH_SIZE) {
        const batchMeta = importInvoiceMeta.slice(i, i + XML_BATCH_SIZE);

        const parsedBatch = await Promise.allSettled(
          batchMeta.map(async (invoice) => {
            if (!invoice.xmlContent) return null;
            const cfop = extractFirstCfop(invoice.xmlContent);
            if (!isImportEntryCfop(cfop)) return null;
            const products = await extractProductsFromXml(invoice.xmlContent, {
              strict: options.strictXml,
            });
            return { invoice, products };
          }),
        );
        throwIfBatchFailed(parsedBatch, options.strictXml);

        for (const settled of parsedBatch) {
          const result = settled.status === 'fulfilled' ? settled.value : null;
          if (!result) continue;

          const { invoice, products } = result;
          const issueDate = invoice.issueDate ? new Date(invoice.issueDate) : null;
          const supplierName = invoice.recipientName || null;
          const supplierCnpj = invoice.recipientCnpj || null;

          for (const product of products) {
            const key = buildProductKey(product);
            importProductKeys.add(key);
            const existing = productMap.get(key);

            if (!existing) {
              productMap.set(key, {
                key,
                code: product.code,
                description: product.description,
                ncm: product.ncm,
                unit: product.unit,
                anvisa: product.anvisa,
                ean: product.ean,
                totalQuantity: product.quantity,
                totalValue: product.totalValue,
                lastPrice: product.unitPrice,
                lastIssueDate: issueDate,
                lastSupplierName: supplierName,
                lastSupplierCnpj: supplierCnpj,
                lastInvoiceId: invoice.id,
                lastInvoiceNumber: invoice.number || null,
                invoiceCount: 1,
                lastCountedInvoiceId: invoice.id,
                productType: 'LINHA CARDIACA',
                productSubtype: 'VALVULAS IMPORTADAS',
                productSubgroup: null,
                resaleQuantity: 0,
                lastSaleDate: null,
                lastSalePrice: null,
              });
              continue;
            }

            existing.totalQuantity += product.quantity;
            existing.totalValue += product.totalValue;
            if (existing.lastCountedInvoiceId !== invoice.id) {
              existing.invoiceCount++;
              existing.lastCountedInvoiceId = invoice.id;
            }

            if (!existing.anvisa && product.anvisa) existing.anvisa = product.anvisa;
            if (!existing.ean && product.ean) existing.ean = product.ean;
            if ((!existing.code || existing.code === '-') && product.code && product.code !== '-') {
              existing.code = product.code;
            }
            if (!existing.ncm && product.ncm) existing.ncm = product.ncm;

            if (!existing.productType) {
              existing.productType = 'LINHA CARDIACA';
              existing.productSubtype = 'VALVULAS IMPORTADAS';
            }

            if (issueDate && (!existing.lastIssueDate || issueDate > existing.lastIssueDate)) {
              existing.lastIssueDate = issueDate;
              existing.lastPrice = product.unitPrice;
              existing.lastSupplierName = supplierName;
              existing.lastSupplierCnpj = supplierCnpj;
              existing.lastInvoiceId = invoice.id;
              existing.lastInvoiceNumber = invoice.number || null;
            }
          }
        }
      }
    }
  }

  // ── Pass 3: deduct resale quantities (Navix / Prime) ──
  if (productMap.size > 0) {
    const resaleIndex = new Map<string, string>();
    productMap.forEach((agg, mapKey) => {
      const codeToken = normalizeToken(agg.code);
      const unitToken = normalizeUnit(agg.unit);
      const eanToken = normalizeToken(agg.ean).replace(/\D/g, '');
      const descToken = normalizeDescriptionToken(agg.description);

      if (codeToken && codeToken !== '-') {
        resaleIndex.set(`R_CODE_UNIT:${codeToken}::${unitToken}`, mapKey);
      }
      if (eanToken && eanToken !== '0') {
        resaleIndex.set(`R_EAN:${eanToken}`, mapKey);
      }
      if (descToken && unitToken) {
        resaleIndex.set(`R_DESC_UNIT:${descToken}::${unitToken}`, mapKey);
      }
    });

    const matchResaleProduct = (product: ProductFromXml): string | null => {
      const unitToken = normalizeUnit(product.unit);
      const codeToken = normalizeToken(product.code);

      if (codeToken && codeToken !== '-') {
        const hit = resaleIndex.get(`R_CODE_UNIT:${codeToken}::${unitToken}`);
        if (hit) return hit;
      }

      const firstToken = normalizeToken(product.description.split(/[\s\-]+/)[0]);
      if (firstToken && firstToken !== codeToken) {
        const hit = resaleIndex.get(`R_CODE_UNIT:${firstToken}::${unitToken}`);
        if (hit) return hit;
      }

      const eanToken = normalizeToken(product.ean).replace(/\D/g, '');
      if (eanToken && eanToken !== '0') {
        const hit = resaleIndex.get(`R_EAN:${eanToken}`);
        if (hit) return hit;
      }

      const descToken = normalizeDescriptionToken(product.description);
      if (descToken && unitToken) {
        const hit = resaleIndex.get(`R_DESC_UNIT:${descToken}::${unitToken}`);
        if (hit) return hit;
      }

      return null;
    };

    for await (const resaleInvoiceMeta of iterateAggregationInvoices({
      companyId,
      type: 'NFE',
      direction: 'issued',
      ...(options.createdAtLte ? { createdAt: { lte: options.createdAtLte } } : {}),
    })) {
      for (let i = 0; i < resaleInvoiceMeta.length; i += XML_BATCH_SIZE) {
        const batch = resaleInvoiceMeta.slice(i, i + XML_BATCH_SIZE);

        const parsedBatch = await Promise.allSettled(
          batch.map(async (invoice) => {
            if (!invoice.xmlContent) return null;
            if (!isResaleCustomer(invoice.recipientName)) return null;
            const cfop = extractFirstCfop(invoice.xmlContent);
            if (isImportEntryCfop(cfop)) return null;
            const products = await extractProductsFromXml(invoice.xmlContent, {
              strict: options.strictXml,
            });
            return { products };
          }),
        );
        throwIfBatchFailed(parsedBatch, options.strictXml);

        for (const settled of parsedBatch) {
          const result = settled.status === 'fulfilled' ? settled.value : null;
          if (!result) continue;

          for (const product of result.products) {
            const mapKey = matchResaleProduct(product);
            if (!mapKey) continue;

            const agg = productMap.get(mapKey);
            if (!agg) continue;

            agg.totalQuantity -= product.quantity;
            agg.totalValue -= product.totalValue;
            agg.resaleQuantity += product.quantity;
          }
        }
      }
    }
  }

  // ── Enrich last sale dates ──
  await enrichLastSaleDates(companyId, productMap, options);

  return productMap;
}

/**
 * Enrich products with last sale date from issued NF-e (non-resale, non-import).
 */
async function enrichLastSaleDates(
  companyId: string,
  productMap: Map<string, AggregatedProduct>,
  options: { createdAtLte?: Date; strictXml?: boolean },
) {
  if (productMap.size === 0) return;

  function buildStrictSaleLookupKeys(product: {
    code: string;
    unit: string;
    ean?: string | null;
  }): string[] {
    const keys: string[] = [];
    const codeToken = normalizeToken(product.code);
    const unitToken = normalizeUnit(product.unit);
    const eanToken = normalizeToken(product.ean).replace(/\D/g, '');

    if (codeToken && codeToken !== '-') {
      keys.push(`SALE_CODE_UNIT:${codeToken}::${unitToken}`);
      keys.push(`SALE_CODE:${codeToken}`);
      return keys;
    }

    if (eanToken && eanToken !== '0') {
      keys.push(`SALE_EAN:${eanToken}`);
    }

    return keys;
  }

  const unresolvedKeys = new Set<string>();
  const keysByLookup = new Map<string, string[]>();

  productMap.forEach((agg, mapKey) => {
    if (agg.lastSaleDate) return;

    const lookupKeys = buildStrictSaleLookupKeys({
      code: agg.code,
      unit: agg.unit,
      ean: agg.ean,
    });

    if (lookupKeys.length === 0) return;

    unresolvedKeys.add(mapKey);
    for (const lk of lookupKeys) {
      const list = keysByLookup.get(lk) || [];
      list.push(mapKey);
      keysByLookup.set(lk, list);
    }
  });

  if (unresolvedKeys.size === 0) return;

  invoicePageLoop: for await (const issuedInvoiceMetadata of iterateAggregationInvoices({
    companyId,
    type: 'NFE',
    direction: 'issued',
    ...(options.createdAtLte ? { createdAt: { lte: options.createdAtLte } } : {}),
  })) {
    for (let i = 0; i < issuedInvoiceMetadata.length; i += XML_BATCH_SIZE) {
      const batchMeta = issuedInvoiceMetadata.slice(i, i + XML_BATCH_SIZE);

      const parsedBatch = await Promise.allSettled(
        batchMeta.map(async (invoice) => {
          if (isResaleCustomer(invoice.recipientName)) return null;
          if (!invoice.xmlContent) return null;
          const cfop = extractFirstCfop(invoice.xmlContent);
          if (isImportEntryCfop(cfop)) return null;
          const products = await extractProductsFromXml(invoice.xmlContent, {
            strict: options.strictXml,
          });
          return { invoice, products };
        }),
      );
      throwIfBatchFailed(parsedBatch, options.strictXml);

      for (const settled of parsedBatch) {
        const result = settled.status === 'fulfilled' ? settled.value : null;
        if (!result) continue;

        const issueDate = result.invoice.issueDate ? new Date(result.invoice.issueDate) : null;
        if (!issueDate) continue;

        for (const product of result.products) {
          const lookupKeys = buildStrictSaleLookupKeys({
            code: product.code,
            unit: product.unit,
            ean: product.ean,
          });
          if (lookupKeys.length === 0) continue;

          const matchedMapKeys = new Set<string>();
          for (const lk of lookupKeys) {
            const mapKeys = keysByLookup.get(lk) || [];
            for (const mk of mapKeys) {
              if (unresolvedKeys.has(mk)) matchedMapKeys.add(mk);
            }
          }

          if (matchedMapKeys.size === 0) continue;

          matchedMapKeys.forEach((mk) => {
            const agg = productMap.get(mk);
            if (!agg || agg.lastSaleDate) return;

            agg.lastSaleDate = issueDate;
            agg.lastSalePrice = Number.isFinite(product.unitPrice) ? product.unitPrice : null;
            unresolvedKeys.delete(mk);
          });

          if (unresolvedKeys.size === 0) break invoicePageLoop;
        }
      }
    }
  }
}
