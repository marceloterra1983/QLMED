import { NextResponse } from 'next/server';
import { requireAuth, unauthorizedResponse } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { getOrCreateSingleCompany } from '@/lib/single-company';

export async function GET() {
  try {
    let userId: string;
    try {
      userId = await requireAuth();
    } catch {
      return unauthorizedResponse();
    }

    const company = await getOrCreateSingleCompany(userId);
    const companyId = company.id;

    const [docsReceived, totalValueResult, pendingManifest, errors] = await Promise.all([
      prisma.invoice.count({
        where: { companyId },
      }),
      prisma.invoice.aggregate({
        where: { companyId },
        _sum: { totalValue: true },
      }),
      prisma.invoice.count({
        where: { companyId, status: 'received' },
      }),
      prisma.invoice.count({
        where: { companyId, status: 'rejected' },
      }),
    ]);

    return NextResponse.json({
      docsReceived,
      totalValue: totalValueResult._sum.totalValue || 0,
      pendingManifest,
      errors,
    });
  } catch (error) {
    console.error('Dashboard error:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
