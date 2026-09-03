import { NextResponse } from 'next/server';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { requireAuth, unauthorizedResponse, forbiddenResponse } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { getOrCreateSingleCompany } from '@/lib/single-company';
import { apiError, apiValidationError } from '@/lib/api-error';
import { cacheHeaders } from '@/lib/cache-headers';

const yearsQuerySchema = z.object({
  type: z.enum(['NFE', 'CTE', 'NFSE', '']).catch(''),
  direction: z.enum(['received', 'issued', '']).catch(''),
});

export async function GET(req: Request) {
  try {
    let userId: string;
    try {
      userId = await requireAuth({ apiKeyScope: 'invoices:read' });
    } catch (e) {
      if (e instanceof Error && e.message === 'FORBIDDEN') return forbiddenResponse();
      return unauthorizedResponse();
    }
    const company = await getOrCreateSingleCompany(userId);

    const { searchParams } = new URL(req.url);
    const parsed = yearsQuerySchema.safeParse(Object.fromEntries(searchParams));
    if (!parsed.success) return apiValidationError(parsed.error);

    const { type, direction } = parsed.data;

    const typeCondition = type ? Prisma.sql`AND "type"::text = ${type}` : Prisma.empty;
    const directionCondition = direction ? Prisma.sql`AND "direction"::text = ${direction}` : Prisma.empty;

    let years: number[] = [];
    try {
      const rows = await prisma.$queryRaw<{ year: number }[]>(Prisma.sql`
        SELECT DISTINCT EXTRACT(YEAR FROM "issueDate")::int AS year
        FROM "Invoice"
        WHERE "companyId" = ${company.id}
          AND "issueDate" IS NOT NULL
          ${typeCondition}
          ${directionCondition}
        ORDER BY year DESC
      `);
      years = rows.map((r) => Number(r.year)).filter((y) => Number.isInteger(y) && y >= 2000 && y <= 2100);
    } catch {
      // Fallback if $queryRaw fails or in mock environments
      const where: Prisma.InvoiceWhereInput = { companyId: company.id };
      if (type) where.type = type;
      if (direction) where.direction = direction;
      const minMax = await prisma.invoice.aggregate({
        where,
        _min: { issueDate: true },
        _max: { issueDate: true },
      });
      if (minMax._min?.issueDate && minMax._max?.issueDate) {
        const minYear = minMax._min.issueDate.getUTCFullYear();
        const maxYear = minMax._max.issueDate.getUTCFullYear();
        for (let y = maxYear; y >= minYear; y--) {
          years.push(y);
        }
      }
    }

    return NextResponse.json({ years }, { headers: cacheHeaders('lookup') });
  } catch (error) {
    return apiError(error, 'invoices/years');
  }
}
