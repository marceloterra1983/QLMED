import { NextResponse } from 'next/server';
import { requireAuth, unauthorizedResponse } from '@/lib/auth';
import { getOrCreateSingleCompany } from '@/lib/single-company';
import prisma from '@/lib/prisma';
import { ensureInvoiceTaxTables } from '@/lib/invoice-tax-store';
import { createLogger } from '@/lib/logger';
import { apiError } from '@/lib/api-error';

const log = createLogger('fiscal/by-cfop');

export async function GET(req: Request) {
  let userId: string;
  try {
    userId = await requireAuth();
  } catch {
    return unauthorizedResponse();
  }

  const company = await getOrCreateSingleCompany(userId);
  const { searchParams } = new URL(req.url);
  const year = Number(searchParams.get('year') || new Date().getFullYear());

  await ensureInvoiceTaxTables();

  const startDate = new Date(Date.UTC(year, 0, 1));
  const endDate = new Date(Date.UTC(year, 11, 31, 23, 59, 59));

  try {
    const rows = await prisma.$queryRawUnsafe<any[]>(
      `SELECT
        it.cfop,
        CASE
          WHEN it.cfop LIKE '1%' OR it.cfop LIKE '2%' OR it.cfop LIKE '3%' THEN 'entrada'
          ELSE 'saida'
        END as direction,
        COUNT(*) as item_count,
        COALESCE(SUM(it.total_value), 0) as total_value,
        COALESCE(SUM(it.valor_icms), 0) as total_icms,
        COALESCE(SUM(it.valor_pis), 0) as total_pis,
        COALESCE(SUM(it.valor_cofins), 0) as total_cofins,
        COALESCE(SUM(it.valor_ipi), 0) as total_ipi
       FROM invoice_item_tax it
       INNER JOIN "Invoice" i ON i.id = it.invoice_id
       WHERE it.company_id = $1
         AND it.cfop IS NOT NULL
         AND i."issueDate" >= $2
         AND i."issueDate" <= $3
       GROUP BY it.cfop
       ORDER BY COALESCE(SUM(it.total_value), 0) DESC`,
      company.id,
      startDate,
      endDate,
    );

    return NextResponse.json({
      year,
      byCfop: rows.map((r) => ({
        cfop: r.cfop,
        direction: r.direction,
        itemCount: Number(r.item_count),
        totalValue: Number(r.total_value),
        icms: Number(r.total_icms),
        pis: Number(r.total_pis),
        cofins: Number(r.total_cofins),
        ipi: Number(r.total_ipi),
      })),
    });
  } catch (error) {
    return apiError(error, 'fiscal/by-cfop');
  }
}
