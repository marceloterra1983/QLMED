import { NextResponse } from 'next/server';
import { requireAuth, unauthorizedResponse } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { getOrCreateSingleCompany } from '@/lib/single-company';
import { apiError } from '@/lib/api-error';

export async function GET(req: Request) {
  try {
    const userId = await requireAuth();
    const company = await getOrCreateSingleCompany(userId);
    const search = new URL(req.url).searchParams.get('search')?.replace(/\D/g, '') || '';
    const rows = await prisma.invoice.findMany({
      where: {
        companyId: company.id,
        type: 'NFE',
        direction: 'issued',
        recipientCnpj: search ? { startsWith: search } : { not: null },
      },
      select: { recipientCnpj: true, recipientName: true },
      distinct: ['recipientCnpj'],
      take: 30,
    });
    const customers = rows
      .map((row) => ({
        cnpj: (row.recipientCnpj || '').replace(/\D/g, ''),
        name: row.recipientName || row.recipientCnpj || '',
      }))
      .filter((row) => row.cnpj.length === 14);
    return NextResponse.json({ customers });
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') return unauthorizedResponse();
    return apiError(error, 'GET /api/nfe-emissions/customers');
  }
}
