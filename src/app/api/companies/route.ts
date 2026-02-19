import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, unauthorizedResponse } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { z } from 'zod';

const companySchema = z.object({
  cnpj: z.string().min(14).max(18),
  razaoSocial: z.string().min(2).max(200),
  nomeFantasia: z.string().optional(),
});

export async function GET() {
  try {
    let userId: string;
    try {
      userId = await requireAuth();
    } catch {
      return unauthorizedResponse();
    }

    const companies = await prisma.company.findMany({
      where: { userId },
      orderBy: { razaoSocial: 'asc' },
      include: {
        _count: {
          select: { invoices: true },
        },
      },
    });

    return NextResponse.json({ companies });
  } catch (error) {
    console.error('Companies error:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    let userId: string;
    try {
      userId = await requireAuth();
    } catch {
      return unauthorizedResponse();
    }

    const body = await request.json();
    const validation = companySchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: 'Dados inválidos', details: validation.error.flatten() },
        { status: 400 }
      );
    }

    const cleanCnpj = validation.data.cnpj.replace(/[^\d]/g, '');

    const existing = await prisma.company.findFirst({
      where: { cnpj: cleanCnpj, userId },
    });

    if (existing) {
      return NextResponse.json(
        { error: 'CNPJ já cadastrado para este usuário' },
        { status: 409 }
      );
    }

    const company = await prisma.company.create({
      data: {
        cnpj: cleanCnpj,
        razaoSocial: validation.data.razaoSocial,
        nomeFantasia: validation.data.nomeFantasia || null,
        userId,
      },
    });

    return NextResponse.json({ company }, { status: 201 });
  } catch (error) {
    console.error('Create company error:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
