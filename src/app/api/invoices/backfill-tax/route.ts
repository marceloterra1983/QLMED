import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { forbiddenResponse, requireEditor, unauthorizedResponse } from '@/lib/auth';
import { getOrCreateSingleCompany } from '@/lib/single-company';
import { extractAllTaxData } from '@/lib/parse-invoice-tax';
import { upsertTaxTotals, upsertItemTaxes, ensureInvoiceTaxTables } from '@/lib/invoice-tax-store';
import { createLogger } from '@/lib/logger';
import { z } from 'zod';

const log = createLogger('invoices/backfill-tax');

const BATCH_SIZE = 200;

const noBodySchema = z.object({}).optional();

export async function POST(req: NextRequest) {
  noBodySchema.safeParse({});

  let userId: string;
  try {
    ({ userId } = await requireEditor());
  } catch (err) {
    if (err instanceof Error && err.message === 'FORBIDDEN') return forbiddenResponse();
    return unauthorizedResponse();
  }

  const company = await getOrCreateSingleCompany(userId);
  await ensureInvoiceTaxTables();

  // Anti-join discovery: NFE invoices without tax totals (kept as raw for efficiency)
  const invoices = await prisma.$queryRawUnsafe<{ id: string }[]>(
    `SELECT i.id
     FROM "Invoice" i
     LEFT JOIN invoice_tax_totals t ON t.invoice_id = i.id
     WHERE i."companyId" = $1
       AND i.type = 'NFE'
       AND t.invoice_id IS NULL
     ORDER BY i."issueDate" DESC
     LIMIT $2`,
    company.id,
    BATCH_SIZE,
  );

  if (invoices.length === 0) {
    return NextResponse.json({
      ok: true,
      processed: 0,
      message: 'All invoices already have tax data',
    });
  }

  let processed = 0;
  let errors = 0;

  const ids = invoices.map((i) => i.id);
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

  const remainingResult = await prisma.$queryRawUnsafe<{ count: string }[]>(
    `SELECT COUNT(*)::text as count
     FROM "Invoice" i
     LEFT JOIN invoice_tax_totals t ON t.invoice_id = i.id
     WHERE i."companyId" = $1
       AND i.type = 'NFE'
       AND t.invoice_id IS NULL`,
    company.id,
  );
  const remainingCount = parseInt(remainingResult[0]?.count || '0', 10);

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
