import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, requireAdmin, unauthorizedResponse, forbiddenResponse } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { getOrCreateSingleCompany } from '@/lib/single-company';
import { apiError } from '@/lib/api-error';
import { createLogger } from '@/lib/logger';

const log = createLogger('companies');

export async function GET() {
  try {
    let userId: string;
    try {
      userId = await requireAuth();
    } catch {
      return unauthorizedResponse();
    }

    const company = await getOrCreateSingleCompany(userId);
    const companyWithCount = await prisma.company.findUnique({
      where: { id: company.id },
      include: { _count: { select: { invoices: true } } },
    });

    return NextResponse.json({ companies: companyWithCount ? [companyWithCount] : [] });
  } catch (error) {
    return apiError(error, 'companies');
  }
}

export async function POST(_request: NextRequest) {
  try {
    let userId: string;
    try {
      const auth = await requireAdmin();
      userId = auth.userId;
    } catch (e: unknown) {
      if (e instanceof Error && e.message === 'FORBIDDEN') return forbiddenResponse();
      return unauthorizedResponse();
    }

    const company = await getOrCreateSingleCompany(userId);
    return NextResponse.json(
      {
        company,
        message: 'Modo de empresa única ativo. Não é permitido cadastrar outra empresa.',
      },
      { status: 200 }
    );
  } catch (error) {
    return apiError(error, 'companies');
  }
}
