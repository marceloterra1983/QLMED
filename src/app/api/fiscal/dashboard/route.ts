import { NextResponse } from 'next/server';
import { requireAuth, unauthorizedResponse } from '@/lib/auth';
import { getOrCreateSingleCompany } from '@/lib/single-company';
import prisma from '@/lib/prisma';
import { apiError, apiValidationError } from '@/lib/api-error';
import { fiscalPeriodQuerySchema, getFiscalPeriodRange, nfeTaxCoverage } from '@/lib/fiscal-period';

const fiscalDashboardQuerySchema = fiscalPeriodQuerySchema;

export async function GET(req: Request) {
  let userId: string;
  try {
    userId = await requireAuth();
  } catch {
    return unauthorizedResponse();
  }

  const company = await getOrCreateSingleCompany(userId);
  const { searchParams } = new URL(req.url);
  const parsed = fiscalDashboardQuerySchema.safeParse(Object.fromEntries(searchParams));
  if (!parsed.success) return apiValidationError(parsed.error);
  const { period, year, month } = parsed.data;

  const { startDate, endDate } = getFiscalPeriodRange(period, year, month);

  try {
    const invoices = await prisma.invoice.findMany({
      where: {
        companyId: company.id,
        issueDate: { gte: startDate, lte: endDate },
      },
      select: {
        id: true,
        type: true,
        issueDate: true,
        senderName: true,
        senderCnpj: true,
        direction: true,
      },
    });

    const invoiceById = new Map(invoices.map((i) => [i.id, i]));
    const invoiceIds = invoices.map((i) => i.id);

    const taxRows =
      invoiceIds.length === 0
        ? []
        : await prisma.invoiceTaxTotals.findMany({
            where: {
              companyId: company.id,
              invoiceId: { in: invoiceIds },
            },
          });

    let totalIcms = 0;
    let totalPis = 0;
    let totalCofins = 0;
    let totalIpi = 0;
    let totalFrete = 0;
    let totalTribAprox = 0;
    let totalFcp = 0;
    let totalIcmsSt = 0;
    let totalBc = 0;
    let totalDesc = 0;

    type MonthKey = string;
    const monthlyMap = new Map<
      MonthKey,
      {
        year: number;
        month: number;
        icms: number;
        pis: number;
        cofins: number;
        ipi: number;
        frete: number;
        tribAprox: number;
        invoiceCount: number;
      }
    >();

    type SupplierKey = string;
    const supplierMap = new Map<
      SupplierKey,
      {
        name: string | null;
        cnpj: string | null;
        icms: number;
        pisCofins: number;
        ipi: number;
        invoiceCount: number;
      }
    >();

    for (const t of taxRows) {
      const inv = invoiceById.get(t.invoiceId);
      if (!inv?.issueDate) continue;

      const vicms = Number(t.vicms || 0);
      const vpis = Number(t.vpis || 0);
      const vcofins = Number(t.vcofins || 0);
      const vipi = Number(t.vipi || 0);
      const vfrete = Number(t.vfrete || 0);
      const vtottrib = Number(t.vtottrib || 0);
      const vfcp = Number(t.vfcp || 0);
      const vicmsSt = Number(t.vicmsSt || 0);
      const vbc = Number(t.vbc || 0);
      const vdesc = Number(t.vdesc || 0);

      totalIcms += vicms;
      totalPis += vpis;
      totalCofins += vcofins;
      totalIpi += vipi;
      totalFrete += vfrete;
      totalTribAprox += vtottrib;
      totalFcp += vfcp;
      totalIcmsSt += vicmsSt;
      totalBc += vbc;
      totalDesc += vdesc;

      const y = inv.issueDate.getUTCFullYear();
      const m = inv.issueDate.getUTCMonth() + 1;
      const mk = `${y}-${m}`;
      let monthAgg = monthlyMap.get(mk);
      if (!monthAgg) {
        monthAgg = {
          year: y,
          month: m,
          icms: 0,
          pis: 0,
          cofins: 0,
          ipi: 0,
          frete: 0,
          tribAprox: 0,
          invoiceCount: 0,
        };
        monthlyMap.set(mk, monthAgg);
      }
      monthAgg.icms += vicms;
      monthAgg.pis += vpis;
      monthAgg.cofins += vcofins;
      monthAgg.ipi += vipi;
      monthAgg.frete += vfrete;
      monthAgg.tribAprox += vtottrib;
      monthAgg.invoiceCount += 1;

      if (inv.direction === 'received') {
        const sk = `${inv.senderCnpj || ''}|${inv.senderName || ''}`;
        let sup = supplierMap.get(sk);
        if (!sup) {
          sup = {
            name: inv.senderName,
            cnpj: inv.senderCnpj,
            icms: 0,
            pisCofins: 0,
            ipi: 0,
            invoiceCount: 0,
          };
          supplierMap.set(sk, sup);
        }
        sup.icms += vicms;
        sup.pisCofins += vpis + vcofins;
        sup.ipi += vipi;
        sup.invoiceCount += 1;
      }
    }

    const { totalNfe, withTaxData } = nfeTaxCoverage(
      invoices,
      taxRows.map((t) => t.invoiceId),
    );

    const monthly = Array.from(monthlyMap.values()).sort((a, b) =>
      a.year === b.year ? a.month - b.month : a.year - b.year,
    );

    const topSuppliers = Array.from(supplierMap.values())
      .sort((a, b) => b.icms + b.pisCofins + b.ipi - (a.icms + a.pisCofins + a.ipi))
      .slice(0, 10);

    return NextResponse.json({
      period: { type: period, year, month, startDate, endDate },
      totalNfe,
      withTaxData,
      totals: {
        icms: totalIcms,
        pis: totalPis,
        cofins: totalCofins,
        ipi: totalIpi,
        frete: totalFrete,
        tribAprox: totalTribAprox,
        fcp: totalFcp,
        icmsSt: totalIcmsSt,
        baseCalculo: totalBc,
        descontos: totalDesc,
        invoiceCount: taxRows.length,
      },
      monthly,
      topSuppliers: topSuppliers.map((s) => ({
        name: s.name,
        cnpj: s.cnpj,
        icms: s.icms,
        pisCofins: s.pisCofins,
        ipi: s.ipi,
        invoiceCount: s.invoiceCount,
      })),
    });
  } catch (error) {
    return apiError(error, 'fiscal/dashboard');
  }
}
