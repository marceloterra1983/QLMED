import { NextRequest, NextResponse } from 'next/server';
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
    const companyWithCount = await prisma.company.findUnique({
      where: { id: company.id },
      include: { _count: { select: { invoices: true } } },
    });

    return NextResponse.json({ companies: companyWithCount ? [companyWithCount] : [] });
  } catch (error) {
    console.error('Companies error:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}

export async function POST(_request: NextRequest) {
  try {
    let userId: string;
    try {
      userId = await requireAuth();
    } catch {
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
    console.error('Create company error:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
