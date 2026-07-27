import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth, unauthorizedResponse } from '@/lib/auth';
import { getOrCreateSingleCompany } from '@/lib/single-company';
import prisma from '@/lib/prisma';
import { apiError, apiValidationError } from '@/lib/api-error';

const byCfopQuerySchema = z.object({
  year: z.coerce.number().int().default(new Date().getFullYear()),
});

export async function GET(req: Request) {
  let userId: string;
  try {
    userId = await requireAuth();
  } catch {
    return unauthorizedResponse();
  }

  const company = await getOrCreateSingleCompany(userId);
  const { searchParams } = new URL(req.url);
  const parsed = byCfopQuerySchema.safeParse(Object.fromEntries(searchParams));
  if (!parsed.success) return apiValidationError(parsed.error);
  const { year } = parsed.data;

  const startDate = new Date(Date.UTC(year, 0, 1));
  const endDate = new Date(Date.UTC(year, 11, 31, 23, 59, 59));

  try {
    const invoices = await prisma.invoice.findMany({
      where: {
        companyId: company.id,
        issueDate: { gte: startDate, lte: endDate },
      },
      select: { id: true },
    });
    const invoiceIds = invoices.map((i) => i.id);

    if (invoiceIds.length === 0) {
      return NextResponse.json({ year, byCfop: [] });
    }

    const items = await prisma.invoiceItemTax.findMany({
      where: {
        companyId: company.id,
        invoiceId: { in: invoiceIds },
        cfop: { not: null },
      },
      select: {
        cfop: true,
        totalValue: true,
        valorIcms: true,
        valorPis: true,
        valorCofins: true,
        valorIpi: true,
      },
    });

    type Agg = {
      cfop: string;
      itemCount: number;
      totalValue: number;
      icms: number;
      pis: number;
      cofins: number;
      ipi: number;
    };
    const byCfop = new Map<string, Agg>();

    for (const it of items) {
      const cfop = it.cfop || '';
      if (!cfop) continue;
      let agg = byCfop.get(cfop);
      if (!agg) {
        agg = { cfop, itemCount: 0, totalValue: 0, icms: 0, pis: 0, cofins: 0, ipi: 0 };
        byCfop.set(cfop, agg);
      }
      agg.itemCount += 1;
      agg.totalValue += Number(it.totalValue || 0);
      agg.icms += Number(it.valorIcms || 0);
      agg.pis += Number(it.valorPis || 0);
      agg.cofins += Number(it.valorCofins || 0);
      agg.ipi += Number(it.valorIpi || 0);
    }

    const rows = Array.from(byCfop.values()).sort((a, b) => b.totalValue - a.totalValue);

    return NextResponse.json({
      year,
      byCfop: rows.map((r) => ({
        cfop: r.cfop,
        direction:
          r.cfop.startsWith('1') || r.cfop.startsWith('2') || r.cfop.startsWith('3')
            ? 'entrada'
            : 'saida',
        itemCount: r.itemCount,
        totalValue: r.totalValue,
        icms: r.icms,
        pis: r.pis,
        cofins: r.cofins,
        ipi: r.ipi,
      })),
    });
  } catch (error) {
    return apiError(error, 'fiscal/by-cfop');
  }
}
