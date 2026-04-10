import { NextResponse } from 'next/server';
import { requireAuth, unauthorizedResponse } from '@/lib/auth';
import { getOrCreateSingleCompany } from '@/lib/single-company';
import prisma from '@/lib/prisma';
import { ensureInvoiceTaxTables } from '@/lib/invoice-tax-store';
import { createLogger } from '@/lib/logger';
import { apiError } from '@/lib/api-error';

const log = createLogger('fiscal/dashboard');

export async function GET(req: Request) {
  let userId: string;
  try {
    userId = await requireAuth();
  } catch {
    return unauthorizedResponse();
  }

  const company = await getOrCreateSingleCompany(userId);
  const { searchParams } = new URL(req.url);
  const period = searchParams.get('period') || 'year'; // month, quarter, year
  const year = Number(searchParams.get('year') || new Date().getFullYear());
  const month = Number(searchParams.get('month') || new Date().getMonth() + 1);

  await ensureInvoiceTaxTables();

  let startDate: Date;
  let endDate: Date;

  if (period === 'month') {
    startDate = new Date(Date.UTC(year, month - 1, 1));
    endDate = new Date(Date.UTC(year, month, 0, 23, 59, 59));
  } else if (period === 'quarter') {
    const q = Math.ceil(month / 3);
    startDate = new Date(Date.UTC(year, (q - 1) * 3, 1));
    endDate = new Date(Date.UTC(year, q * 3, 0, 23, 59, 59));
  } else {
    startDate = new Date(Date.UTC(year, 0, 1));
    endDate = new Date(Date.UTC(year, 11, 31, 23, 59, 59));
  }

  try {
    // Totals for the period
    const totals = await prisma.$queryRawUnsafe<any[]>(
      `SELECT
        COALESCE(SUM(t.vicms), 0) as total_icms,
        COALESCE(SUM(t.vpis), 0) as total_pis,
        COALESCE(SUM(t.vcofins), 0) as total_cofins,
        COALESCE(SUM(t.vipi), 0) as total_ipi,
        COALESCE(SUM(t.vfrete), 0) as total_frete,
        COALESCE(SUM(t.vtottrib), 0) as total_trib_aprox,
        COALESCE(SUM(t.vfcp), 0) as total_fcp,
        COALESCE(SUM(t.vicms_st), 0) as total_icms_st,
        COALESCE(SUM(t.vbc), 0) as total_bc,
        COALESCE(SUM(t.vdesc), 0) as total_desc,
        COUNT(*) as invoice_count
       FROM invoice_tax_totals t
       INNER JOIN "Invoice" i ON i.id = t.invoice_id
       WHERE t.company_id = $1
         AND i."issueDate" >= $2
         AND i."issueDate" <= $3`,
      company.id,
      startDate,
      endDate,
    );

    // Monthly breakdown
    const monthly = await prisma.$queryRawUnsafe<any[]>(
      `SELECT
        EXTRACT(YEAR FROM i."issueDate") as ano,
        EXTRACT(MONTH FROM i."issueDate") as mes,
        COALESCE(SUM(t.vicms), 0) as vicms,
        COALESCE(SUM(t.vpis), 0) as vpis,
        COALESCE(SUM(t.vcofins), 0) as vcofins,
        COALESCE(SUM(t.vipi), 0) as vipi,
        COALESCE(SUM(t.vfrete), 0) as vfrete,
        COALESCE(SUM(t.vtottrib), 0) as vtottrib,
        COUNT(*) as invoice_count
       FROM invoice_tax_totals t
       INNER JOIN "Invoice" i ON i.id = t.invoice_id
       WHERE t.company_id = $1
         AND i."issueDate" >= $2
         AND i."issueDate" <= $3
       GROUP BY ano, mes
       ORDER BY ano, mes`,
      company.id,
      startDate,
      endDate,
    );

    // Top 10 suppliers by tax value
    const topSuppliers = await prisma.$queryRawUnsafe<any[]>(
      `SELECT
        i."senderName" as supplier_name,
        i."senderCnpj" as supplier_cnpj,
        COALESCE(SUM(t.vicms), 0) as total_icms,
        COALESCE(SUM(COALESCE(t.vpis,0) + COALESCE(t.vcofins,0)), 0) as total_pis_cofins,
        COALESCE(SUM(t.vipi), 0) as total_ipi,
        COUNT(*) as invoice_count
       FROM invoice_tax_totals t
       INNER JOIN "Invoice" i ON i.id = t.invoice_id
       WHERE t.company_id = $1
         AND i."issueDate" >= $2
         AND i."issueDate" <= $3
         AND i.direction = 'received'
       GROUP BY i."senderName", i."senderCnpj"
       ORDER BY (COALESCE(SUM(t.vicms), 0) + COALESCE(SUM(t.vpis), 0) + COALESCE(SUM(t.vcofins), 0) + COALESCE(SUM(t.vipi), 0)) DESC
       LIMIT 10`,
      company.id,
      startDate,
      endDate,
    );

    // Count total NFE invoices and how many have tax data (for backfill progress)
    const counts = await prisma.$queryRawUnsafe<any[]>(
      `SELECT
        (SELECT COUNT(*)::bigint FROM "Invoice" WHERE "companyId" = $1 AND type = 'NFE') as total_nfe,
        (SELECT COUNT(*)::bigint FROM invoice_tax_totals WHERE company_id = $1) as with_tax_data`,
      company.id,
    );
    const totalNfe = Number(counts[0]?.total_nfe ?? 0);
    const withTaxData = Number(counts[0]?.with_tax_data ?? 0);

    const t = totals[0] || {};

    return NextResponse.json({
      period: { type: period, year, month, startDate, endDate },
      totalNfe,
      withTaxData,
      totals: {
        icms: Number(t.total_icms || 0),
        pis: Number(t.total_pis || 0),
        cofins: Number(t.total_cofins || 0),
        ipi: Number(t.total_ipi || 0),
        frete: Number(t.total_frete || 0),
        tribAprox: Number(t.total_trib_aprox || 0),
        fcp: Number(t.total_fcp || 0),
        icmsSt: Number(t.total_icms_st || 0),
        baseCalculo: Number(t.total_bc || 0),
        descontos: Number(t.total_desc || 0),
        invoiceCount: Number(t.invoice_count || 0),
      },
      monthly: monthly.map((m) => ({
        year: Number(m.ano),
        month: Number(m.mes),
        icms: Number(m.vicms),
        pis: Number(m.vpis),
        cofins: Number(m.vcofins),
        ipi: Number(m.vipi),
        frete: Number(m.vfrete),
        tribAprox: Number(m.vtottrib),
        invoiceCount: Number(m.invoice_count),
      })),
      topSuppliers: topSuppliers.map((s) => ({
        name: s.supplier_name,
        cnpj: s.supplier_cnpj,
        icms: Number(s.total_icms),
        pisCofins: Number(s.total_pis_cofins),
        ipi: Number(s.total_ipi),
        invoiceCount: Number(s.invoice_count),
      })),
    });
  } catch (error) {
    return apiError(error, 'fiscal/dashboard');
  }
}
