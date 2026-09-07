import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth, unauthorizedResponse, forbiddenResponse } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { getOrCreateSingleCompany } from '@/lib/single-company';

const watermarkQuerySchema = z.object({
  type: z.enum(['NFE', 'CTE', 'NFSE', '']).catch(''),
  direction: z.enum(['received', 'issued', '']).catch(''),
  dateFrom: z.string().max(10).catch(''),
  dateTo: z.string().max(10).catch(''),
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
    const params = watermarkQuerySchema.parse({
      type: searchParams.get('type') ?? undefined,
      direction: searchParams.get('direction') ?? undefined,
      dateFrom: searchParams.get('dateFrom') || '',
      dateTo: searchParams.get('dateTo') || '',
    });

    const where: Record<string, unknown> = { companyId: company.id };
    if (params.type) where.type = params.type;
    if (params.direction) where.direction = params.direction;
    if (params.dateFrom || params.dateTo) {
      const issueDate: Record<string, Date> = {};
      if (params.dateFrom) issueDate.gte = new Date(params.dateFrom + 'T00:00:00.000Z');
      if (params.dateTo) issueDate.lte = new Date(params.dateTo + 'T23:59:59.999Z');
      where.issueDate = issueDate;
    }

    const [aggregate, count] = await Promise.all([
      prisma.invoice.aggregate({
        where,
        _max: { updatedAt: true },
      }),
      prisma.invoice.count({ where }),
    ]);

    const maxUpdatedAt = aggregate._max.updatedAt?.getTime() ?? 0;
    const etag = `W/"${maxUpdatedAt}-${count}"`;
    const ifNoneMatch = req.headers.get('if-none-match');

    if (ifNoneMatch === etag) {
      return new Response(null, {
        status: 304,
        headers: {
          ETag: etag,
          'Cache-Control': 'private, no-cache',
        },
      });
    }

    return NextResponse.json(
      { changed: true, updatedAt: aggregate._max.updatedAt, count },
      {
        headers: {
          ETag: etag,
          'Cache-Control': 'private, no-cache',
        },
      }
    );
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
