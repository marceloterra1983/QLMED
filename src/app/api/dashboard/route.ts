import { NextResponse } from 'next/server';
import { requireAuth, unauthorizedResponse } from '@/lib/auth';
import prisma from '@/lib/prisma';

export async function GET() {
  try {
    try {
      await requireAuth();
    } catch {
      return unauthorizedResponse();
    }

    const companies = await prisma.company.findMany();

    const companyIds = companies.map((c) => c.id);

    const [docsReceived, totalValueResult, pendingManifest, errors] = await Promise.all([
      prisma.invoice.count({
        where: { companyId: { in: companyIds } },
      }),
      prisma.invoice.aggregate({
        where: { companyId: { in: companyIds } },
        _sum: { totalValue: true },
      }),
      prisma.invoice.count({
        where: { companyId: { in: companyIds }, status: 'received' },
      }),
      prisma.invoice.count({
        where: { companyId: { in: companyIds }, status: 'rejected' },
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
