import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { forbiddenResponse, requireEditor, unauthorizedResponse } from '@/lib/auth';
import { getOrCreateSingleCompany } from '@/lib/single-company';
import { extractAllTaxData } from '@/lib/parse-invoice-tax';
import { upsertTaxTotals, upsertItemTaxes } from '@/lib/invoice-tax-store';
import { createLogger } from '@/lib/logger';

const log = createLogger('invoices/backfill-tax');

const BATCH_SIZE = 200;

export async function POST(req: NextRequest) {
  let userId: string;
  try {
    ({ userId } = await requireEditor());
  } catch (err) {
    if (err instanceof Error && err.message === 'FORBIDDEN') return forbiddenResponse();
    return unauthorizedResponse();
  }

  const company = await getOrCreateSingleCompany(userId);

  // Paginate NFE invoices and collect those without tax totals
  const ids: string[] = [];
  const pageSize = 500;
  let cursor: string | undefined;
  while (ids.length < BATCH_SIZE) {
    const page = await prisma.invoice.findMany({
      where: { companyId: company.id, type: 'NFE' },
      orderBy: [{ issueDate: 'desc' }, { id: 'desc' }],
      take: pageSize,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      select: { id: true },
    });
    if (page.length === 0) break;
    cursor = page[page.length - 1].id;
    const pageIds = page.map((p) => p.id);
    const existingTax = await prisma.invoiceTaxTotals.findMany({
      where: { invoiceId: { in: pageIds } },
      select: { invoiceId: true },
    });
    const hasTax = new Set(existingTax.map((t) => t.invoiceId));
    for (const id of pageIds) {
      if (!hasTax.has(id)) {
        ids.push(id);
        if (ids.length >= BATCH_SIZE) break;
      }
    }
    if (page.length < pageSize) break;
  }

  if (ids.length === 0) {
    return NextResponse.json({
      ok: true,
      processed: 0,
      message: 'All invoices already have tax data',
    });
  }

  let processed = 0;
  let errors = 0;
  const fullInvoices = await prisma.invoice.findMany({
    where: { id: { in: ids } },
    select: { id: true, xmlContent: true, companyId: true },
  });

  const CHUNK_SIZE = 10;
  for (let i = 0; i < fullInvoices.length; i += CHUNK_SIZE) {
    const chunk = fullInvoices.slice(i, i + CHUNK_SIZE);
    const results = await Promise.allSettled(
      chunk.map(async (full) => {
        if (!full.xmlContent) return;
        const { totals, items } = await extractAllTaxData(full.xmlContent);
        if (totals) {
          await upsertTaxTotals({ invoiceId: full.id, companyId: full.companyId, ...totals });
        }
        if (items.length > 0) {
          await upsertItemTaxes(full.id, full.companyId, items);
        }
      }),
    );
    for (const r of results) {
      if (r.status === 'fulfilled') processed++;
      else {
        log.error({ err: r.reason }, 'backfill-tax error');
        errors++;
      }
    }
  }

  // Push latest tax rates into product_registry (read item taxes + update via Prisma)
  const taxItems = await prisma.invoiceItemTax.findMany({
    where: {
      companyId: company.id,
      productCode: { not: null },
    },
    select: {
      productCode: true,
      aliqIcms: true,
      aliqPis: true,
      aliqCofins: true,
      aliqIpi: true,
      cfop: true,
      invoiceId: true,
    },
  });

  if (taxItems.length > 0) {
    const invDates = await prisma.invoice.findMany({
      where: {
        id: { in: Array.from(new Set(taxItems.map((t) => t.invoiceId))) },
      },
      select: { id: true, issueDate: true },
    });
    const dateById = new Map(invDates.map((i) => [i.id, i.issueDate?.getTime() || 0]));

    // Latest tax rates per product code (case-insensitive)
    const latestByCode = new Map<
      string,
      {
        code: string;
        aliqIcms: number | null;
        aliqPis: number | null;
        aliqCofins: number | null;
        aliqIpi: number | null;
        cfop: string | null;
        ts: number;
      }
    >();

    for (const it of taxItems) {
      const code = (it.productCode || '').trim();
      if (!code) continue;
      const key = code.toUpperCase();
      const ts = dateById.get(it.invoiceId) || 0;
      const prev = latestByCode.get(key);
      if (!prev || ts >= prev.ts) {
        latestByCode.set(key, {
          code,
          aliqIcms: it.aliqIcms,
          aliqPis: it.aliqPis,
          aliqCofins: it.aliqCofins,
          aliqIpi: it.aliqIpi,
          cfop: it.cfop,
          ts,
        });
      }
    }

    const registry = await prisma.productRegistry.findMany({
      where: {
        companyId: company.id,
        OR: [{ fiscalIcms: null }, { fiscalPis: null }, { fiscalCofins: null }],
      },
      select: {
        id: true,
        code: true,
        fiscalIcms: true,
        fiscalPis: true,
        fiscalCofins: true,
        fiscalIpi: true,
        fiscalCfopEntrada: true,
      },
    });

    const now = new Date();
    for (const row of registry) {
      const key = (row.code || '').trim().toUpperCase();
      if (!key) continue;
      const rates = latestByCode.get(key);
      if (!rates) continue;
      // Only fill null fiscal fields (same COALESCE intent as previous SQL WHERE)
      if (
        row.fiscalIcms != null &&
        row.fiscalPis != null &&
        row.fiscalCofins != null
      ) {
        continue;
      }
      await prisma.productRegistry.update({
        where: { id: row.id },
        data: {
          fiscalIcms: rates.aliqIcms ?? row.fiscalIcms,
          fiscalPis: rates.aliqPis ?? row.fiscalPis,
          fiscalCofins: rates.aliqCofins ?? row.fiscalCofins,
          fiscalIpi: rates.aliqIpi ?? row.fiscalIpi,
          fiscalCfopEntrada: rates.cfop ?? row.fiscalCfopEntrada,
          updatedAt: now,
        },
      });
    }
  }

  // Approximate remaining: NFE total minus rows that already have tax data
  const [totalNfe, withTaxData] = await Promise.all([
    prisma.invoice.count({ where: { companyId: company.id, type: 'NFE' } }),
    prisma.invoiceTaxTotals.count({ where: { companyId: company.id } }),
  ]);
  const remainingCount = Math.max(0, totalNfe - withTaxData);

  return NextResponse.json({
    ok: true,
    processed,
    errors,
    remaining: remainingCount,
    message:
      remainingCount > 0
        ? `Processed ${processed} invoices. ${remainingCount} remaining — call again to continue.`
        : `Done! All ${processed} invoices processed.`,
  });
}
