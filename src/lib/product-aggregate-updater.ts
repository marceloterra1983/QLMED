/**
 * Incremental product aggregate updater.
 * Called after each invoice upsert to keep agg_* columns fresh.
 * Also provides the daily full rebuild schedule.
 */

import prisma from '@/lib/prisma';
import { createLogger } from '@/lib/logger';
import { extractProductsFromXml, buildProductKey, isResaleCustomer, computeSearchText, type ProductFromXml } from '@/lib/product-aggregation';
import { buildResaleIndex, matchResaleProduct } from '@/lib/product-aggregation/resale-match';
import { isImportEntryCfop, extractFirstCfop } from '@/lib/cfop';
import { extractAllTaxData } from '@/lib/parse-invoice-tax';
import { upsertTaxTotals, upsertItemTaxes } from '@/lib/invoice-tax-store';
import { extractPartyFiscalData } from '@/lib/parse-invoice-xml';
import { upsertContactFiscal } from '@/lib/contact-fiscal-store';
import { extractAndStoreDuplicatas } from '@/lib/invoice-duplicata-store';
import { acquirePostgresAdvisoryLock, type PostgresAdvisoryLock } from '@/lib/postgres-advisory-lock';
import { productAggregateLockKey } from '@/lib/postgres-advisory-lock';
import type { Prisma } from '@prisma/client';

const log = createLogger('product-aggregate-updater');

/**
 * Update product aggregates for a single invoice after it's been upserted.
 * Lightweight incremental update — processes only products in this invoice.
 */
export async function updateProductAggregatesForInvoice(opts: {
  companyId: string;
  invoiceId: string;
  xmlContent: string;
  updateAggregates?: boolean;
  direction: 'received' | 'issued';
  issueDate: Date | null;
  senderName: string | null;
  senderCnpj: string | null;
  recipientName: string | null;
  recipientCnpj: string | null;
  invoiceNumber: string | null;
  ignoreRebuildCutoff?: boolean;
  aggregateLockHeld?: boolean;
}): Promise<void> {
  let aggregateLock: PostgresAdvisoryLock | null = null;

  try {
    if (opts.updateAggregates !== false && !opts.aggregateLockHeld) {
      aggregateLock = await acquirePostgresAdvisoryLock(
        productAggregateLockKey(opts.companyId),
        { wait: true },
      );
    }

    const products = mergeProductLines(await extractProductsFromXml(opts.xmlContent));
    if (products.length === 0) return;

    const cfop = extractFirstCfop(opts.xmlContent);
    const isImport = isImportEntryCfop(cfop);
    const isResale = isResaleCustomer(opts.recipientName);

    if (opts.updateAggregates !== false) {
      const alreadyIncluded = opts.ignoreRebuildCutoff
        ? false
        : await wasInvoiceIncludedInLastRebuild(opts.companyId, opts.invoiceId);

      if (!alreadyIncluded) {
        await prisma.$transaction(async (tx) => {
          if (opts.direction === 'received') {
            await upsertProductAggregates(tx, opts, products, 'purchase');
          } else if (opts.direction === 'issued' && isImport) {
            await upsertProductAggregates(tx, opts, products, 'import');
          } else if (opts.direction === 'issued' && isResale) {
            await updateResaleDeductions(tx, opts, products);
          } else if (opts.direction === 'issued') {
            await updateSaleDate(tx, opts, products);
          }
        });
      }
    }

    await extractAndStoreTaxData(opts.invoiceId, opts.companyId, opts.xmlContent);
    await extractAndStoreContactFiscal(opts.invoiceId, opts.companyId, opts.xmlContent);
    await extractAndStoreDuplicatas(opts.invoiceId, opts.companyId, opts.xmlContent);
  } finally {
    await aggregateLock?.release();
  }
}

function mergeProductLines(products: ProductFromXml[]): ProductFromXml[] {
  const merged = new Map<string, ProductFromXml>();
  for (const product of products) {
    const key = buildProductKey(product);
    const existing = merged.get(key);
    if (!existing) {
      merged.set(key, { ...product, batches: [...product.batches] });
      continue;
    }
    existing.quantity += product.quantity;
    existing.totalValue += product.totalValue;
    existing.unitPrice = existing.quantity > 0 ? existing.totalValue / existing.quantity : 0;
    existing.batches.push(...product.batches);
  }
  return Array.from(merged.values());
}

async function wasInvoiceIncludedInLastRebuild(companyId: string, invoiceId: string): Promise<boolean> {
  const [invoice, state] = await Promise.all([
    prisma.invoice.findUnique({ where: { id: invoiceId }, select: { createdAt: true } }),
    prisma.productAggregateRebuildState.findUnique({
      where: { companyId },
      select: { cutoffCreatedAt: true },
    }),
  ]);
  return Boolean(invoice && state && invoice.createdAt <= state.cutoffCreatedAt);
}

/** Pick new value when issueDate is null (COALESCE old,new), null last date, or newer/equal issue. */
function pickIfNewerOrFirst<T>(
  issueDate: Date | null,
  lastIssueDate: Date | null,
  newVal: T,
  oldVal: T | null | undefined,
): T {
  if (issueDate == null) {
    return (oldVal ?? newVal) as T;
  }
  if (lastIssueDate == null) return newVal;
  if (issueDate >= lastIssueDate) return newVal;
  return (oldVal ?? newVal) as T;
}

async function extractAndStoreTaxData(
  invoiceId: string,
  companyId: string,
  xmlContent: string,
) {
  try {
    const { totals, items } = await extractAllTaxData(xmlContent);

    if (totals) {
      // QLMED-DATA-007: quem grava totais grava a cobertura de itens junto. Sem
      // isto a nota ingerida nasce com item_count NULL e volta ao backfill sem
      // necessidade. Sem o `if (totals)`, CT-e e NFS-e ganhariam linha em
      // invoice_tax_totals e inflariam a contagem de cobertura de NF-e.
      await upsertTaxTotals({ invoiceId, companyId, ...totals, itemCount: items.length });
    }

    if (items.length > 0) {
      await upsertItemTaxes(invoiceId, companyId, items);

      for (const item of items) {
        if (!item.productCode) continue;
        const code = item.productCode.trim();
        const matches = await prisma.productRegistry.findMany({
          where: {
            companyId,
            code: { equals: code, mode: 'insensitive' },
          },
          select: {
            id: true,
            fiscalIcms: true,
            fiscalPis: true,
            fiscalCofins: true,
            fiscalIpi: true,
            fiscalCfopEntrada: true,
          },
        });
        for (const row of matches) {
          await prisma.productRegistry.update({
            where: { id: row.id },
            data: {
              fiscalIcms: item.aliqIcms ?? row.fiscalIcms,
              fiscalPis: item.aliqPis ?? row.fiscalPis,
              fiscalCofins: item.aliqCofins ?? row.fiscalCofins,
              fiscalIpi: item.aliqIpi ?? row.fiscalIpi,
              fiscalCfopEntrada: item.cfop ?? row.fiscalCfopEntrada,
              updatedAt: new Date(),
            },
          });
        }
      }
    }
  } catch (err) {
    log.error({ err }, 'Tax extraction error');
  }
}

async function upsertProductAggregates(
  db: Prisma.TransactionClient,
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
  const now = new Date();

  for (const product of products) {
    const key = buildProductKey(product);
    const searchText = computeSearchText({
      code: product.code,
      description: product.description,
      ncm: product.ncm,
      anvisa: product.anvisa,
      lastSupplierName: supplierName,
    });

    const existing = await db.productRegistry.findUnique({
      where: {
        companyId_productKey: {
          companyId: opts.companyId,
          productKey: key,
        },
      },
    });

    if (existing) {
      const newQty = (existing.aggTotalQuantity ?? 0) + product.quantity;
      const newVal = (existing.aggTotalValue ?? 0) + product.totalValue;
      const avgPrice = newQty > 0 ? newVal / newQty : 0;
      const lastIssue = pickIfNewerOrFirst(
        opts.issueDate,
        existing.aggLastIssueDate,
        opts.issueDate,
        existing.aggLastIssueDate,
      );

      await db.productRegistry.update({
        where: { id: existing.id },
        data: {
          aggTotalQuantity: newQty,
          aggTotalValue: newVal,
          aggInvoiceCount: (existing.aggInvoiceCount ?? 0) + 1,
          aggLastPrice: pickIfNewerOrFirst(
            opts.issueDate,
            existing.aggLastIssueDate,
            product.unitPrice,
            existing.aggLastPrice,
          ),
          aggAveragePrice: avgPrice,
          aggLastIssueDate: lastIssue,
          aggLastSupplierName: pickIfNewerOrFirst(
            opts.issueDate,
            existing.aggLastIssueDate,
            supplierName,
            existing.aggLastSupplierName,
          ),
          aggLastSupplierCnpj: pickIfNewerOrFirst(
            opts.issueDate,
            existing.aggLastIssueDate,
            supplierCnpj,
            existing.aggLastSupplierCnpj,
          ),
          aggLastInvoiceNumber: pickIfNewerOrFirst(
            opts.issueDate,
            existing.aggLastIssueDate,
            opts.invoiceNumber,
            existing.aggLastInvoiceNumber,
          ),
          aggComputedAt: now,
          aggSearchText: searchText,
          updatedAt: now,
        },
      });
      continue;
    }

    // Catálogo oficial = Spica. Não criar produto novo só porque a NF trouxe
    // um código/descrição desconhecido — isso reintroduzia ~785 órfãos/teste.
    log.info(
      { key, code: product.code, mode, companyId: opts.companyId },
      'product_registry skip create — not in catalog',
    );
  }
}

/**
 * Catálogo da empresa indexado pelas MESMAS chaves que o rebuild usa
 * (FISCAL-009). Antes, incremental e rebuild casavam a linha de revenda por
 * algoritmos diferentes — `buildProductKey` exato aqui, índice fuzzy lá — e o
 * estoque mudava sozinho depois do rebuild da madrugada.
 *
 * ponytail: carrega o catálogo inteiro numa query por nota. Troca N findUnique
 * (um por linha) por 1 SELECT, então já é menos ida ao banco do que antes; se
 * o catálogo passar de dezenas de milhares de linhas, indexar por token no
 * Postgres é o próximo passo.
 */
type RegistryMatchRow = {
  id: string;
  code: string | null;
  unit: string | null;
  ean: string | null;
  description: string;
};

async function loadResaleIndex(
  db: Prisma.TransactionClient,
  companyId: string,
): Promise<Map<string, RegistryMatchRow>> {
  const rows = await db.productRegistry.findMany({
    where: { companyId },
    select: { id: true, code: true, unit: true, ean: true, description: true },
  });
  return buildResaleIndex(rows, (row) => row);
}

async function updateResaleDeductions(
  db: Prisma.TransactionClient,
  opts: { companyId: string },
  products: ProductFromXml[],
) {
  const now = new Date();
  const index = await loadResaleIndex(db, opts.companyId);
  for (const product of products) {
    const match = matchResaleProduct(index, product);
    if (!match) continue;
    const existing = await db.productRegistry.findUnique({ where: { id: match.id } });
    if (!existing) continue;

    const newQty = Math.max((existing.aggTotalQuantity ?? 0) - product.quantity, 0);
    const newVal = Math.max((existing.aggTotalValue ?? 0) - product.totalValue, 0);
    const avgPrice =
      newQty > 0 ? newVal / newQty : (existing.aggAveragePrice ?? 0);

    await db.productRegistry.update({
      where: { id: existing.id },
      data: {
        aggTotalQuantity: newQty,
        aggTotalValue: newVal,
        aggResaleQuantity: (existing.aggResaleQuantity ?? 0) + product.quantity,
        aggAveragePrice: avgPrice,
        aggComputedAt: now,
        updatedAt: now,
      },
    });
  }
}

async function updateSaleDate(
  db: Prisma.TransactionClient,
  opts: { companyId: string; issueDate: Date | null },
  products: ProductFromXml[],
) {
  if (!opts.issueDate) return;
  const now = new Date();

  // Mesmo matcher da dedução de revenda: era o mesmo defeito no caller irmão.
  const index = await loadResaleIndex(db, opts.companyId);
  for (const product of products) {
    const match = matchResaleProduct(index, product);
    if (!match) continue;
    const existing = await db.productRegistry.findUnique({ where: { id: match.id } });
    if (!existing) continue;

    const isNewer =
      existing.aggLastSaleDate == null || opts.issueDate > existing.aggLastSaleDate;

    await db.productRegistry.update({
      where: { id: existing.id },
      data: {
        aggLastSaleDate: isNewer ? opts.issueDate : existing.aggLastSaleDate,
        aggLastSalePrice: isNewer ? product.unitPrice : existing.aggLastSalePrice,
        aggComputedAt: now,
        updatedAt: now,
      },
    });
  }
}

async function extractAndStoreContactFiscal(
  invoiceId: string,
  companyId: string,
  xmlContent: string,
) {
  try {
    const [emit, dest] = await Promise.all([
      extractPartyFiscalData(xmlContent, 'emit'),
      extractPartyFiscalData(xmlContent, 'dest'),
    ]);

    if (emit?.cnpj) {
      await upsertContactFiscal({
        companyId,
        cnpj: emit.cnpj,
        ie: emit.ie,
        im: emit.im,
        crt: emit.crt,
        uf: emit.uf,
        city: emit.city,
        sourceInvoiceId: invoiceId,
      });
    }
    if (dest?.cnpj) {
      await upsertContactFiscal({
        companyId,
        cnpj: dest.cnpj,
        ie: dest.ie,
        im: dest.im,
        crt: dest.crt,
        uf: dest.uf,
        city: dest.city,
        sourceInvoiceId: invoiceId,
      });
    }
  } catch (err) {
    log.error({ err }, 'Contact fiscal extraction error');
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
    log.info(
      { nextRebuild: target.toISOString(), delayMinutes: Math.round(delay / 60000) },
      'Next rebuild scheduled',
    );

    setTimeout(async () => {
      try {
        log.info('Starting nightly rebuild');
        const { rebuildProductAggregatesForCompany } = await import('@/lib/product-aggregate-rebuild');

        const companies = await prisma.company.findMany({ select: { id: true } });

        for (const company of companies) {
          try {
            const result = await rebuildProductAggregatesForCompany(company.id);
            if (result) {
              log.info(
                { companyId: company.id, productCount: result.totalProducts },
                'Rebuilt products for company',
              );
            }
          } catch (err) {
            log.error({ err, companyId: company.id }, 'Rebuild failed for company');
          }
        }
      } catch (err) {
        log.error({ err }, 'Nightly rebuild error');
      }

      scheduleNext();
    }, delay);
  };

  scheduleNext();
}
