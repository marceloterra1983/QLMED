import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, unauthorizedResponse } from '@/lib/auth';
import { getOrCreateSingleCompany } from '@/lib/single-company';
import { extractAllTaxData } from '@/lib/parse-invoice-tax';
import { upsertTaxTotals, upsertItemTaxes, ensureInvoiceTaxTables } from '@/lib/invoice-tax-store';

const BATCH_SIZE = 200;

export async function POST(req: NextRequest) {
  let userId: string;
  try {
    userId = await requireAuth();
  } catch {
    return unauthorizedResponse();
  }

  const company = await getOrCreateSingleCompany(userId);
  await ensureInvoiceTaxTables();

  // Find invoices without tax data
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
    return NextResponse.json({ ok: true, processed: 0, message: 'All invoices already have tax data' });
  }

  let processed = 0;
  let errors = 0;

  for (const inv of invoices) {
    try {
      const full = await prisma.invoice.findUnique({
        where: { id: inv.id },
        select: { id: true, xmlContent: true, companyId: true },
      });
      if (!full?.xmlContent) continue;

      const { totals, items } = await extractAllTaxData(full.xmlContent);

      if (totals) {
        await upsertTaxTotals({ invoiceId: full.id, companyId: full.companyId, ...totals });
      }
      if (items.length > 0) {
        await upsertItemTaxes(full.id, full.companyId, items);
      }

      processed++;
    } catch (err) {
      console.error(`[backfill-tax] Error processing invoice ${inv.id}:`, err);
      errors++;
    }
  }

  // Update product_registry fiscal fields from the latest invoice_item_tax data
  // Uses the most recent item (by invoice issue date) for each product code
  await prisma.$executeRawUnsafe(
    `UPDATE product_registry pr SET
      fiscal_icms = sub.aliq_icms,
      fiscal_pis = sub.aliq_pis,
      fiscal_cofins = sub.aliq_cofins,
      fiscal_ipi = sub.aliq_ipi,
      fiscal_cfop_entrada = sub.cfop,
      updated_at = NOW()
    FROM (
      SELECT DISTINCT ON (it.product_code)
        it.product_code,
        it.aliq_icms,
        it.aliq_pis,
        it.aliq_cofins,
        it.aliq_ipi,
        it.cfop
      FROM invoice_item_tax it
      INNER JOIN "Invoice" i ON i.id = it.invoice_id
      WHERE it.company_id = $1
        AND it.product_code IS NOT NULL
      ORDER BY it.product_code, i."issueDate" DESC
    ) sub
    WHERE pr.company_id = $1
      AND UPPER(TRIM(pr.code)) = UPPER(TRIM(sub.product_code))
      AND (pr.fiscal_icms IS NULL OR pr.fiscal_pis IS NULL OR pr.fiscal_cofins IS NULL)`,
    company.id,
  );

  // Check how many remaining
  const remaining = await prisma.$queryRawUnsafe<{ count: bigint }[]>(
    `SELECT COUNT(*)::bigint as count
     FROM "Invoice" i
     LEFT JOIN invoice_tax_totals t ON t.invoice_id = i.id
     WHERE i."companyId" = $1
       AND i.type = 'NFE'
       AND t.invoice_id IS NULL`,
    company.id,
  );
  const remainingCount = Number(remaining[0]?.count ?? 0);

  return NextResponse.json({
    ok: true,
    processed,
    errors,
    remaining: remainingCount,
    message: remainingCount > 0
      ? `Processed ${processed} invoices. ${remainingCount} remaining — call again to continue.`
      : `Done! All ${processed} invoices processed.`,
  });
}
