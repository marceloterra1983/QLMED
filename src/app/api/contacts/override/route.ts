import { NextResponse } from 'next/server';
import { requireAuth, unauthorizedResponse } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { getOrCreateSingleCompany } from '@/lib/single-company';

export async function GET(req: Request) {
  try {
    let userId: string;
    try { userId = await requireAuth(); } catch { return unauthorizedResponse(); }

    const company = await getOrCreateSingleCompany(userId);
    const { searchParams } = new URL(req.url);
    const cnpj = (searchParams.get('cnpj') || '').trim();

    if (!cnpj) {
      return NextResponse.json({ override: null });
    }

    const record = await prisma.contactOverride.findUnique({
      where: { companyId_cnpj: { companyId: company.id, cnpj } },
    });

    return NextResponse.json({ override: record || null });
  } catch {
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  try {
    let userId: string;
    try { userId = await requireAuth(); } catch { return unauthorizedResponse(); }

    const company = await getOrCreateSingleCompany(userId);
    const body = await req.json().catch(() => ({}));
    const cnpj = (body.cnpj || '').trim();

    if (!cnpj) {
      return NextResponse.json({ error: 'CNPJ obrigatório' }, { status: 400 });
    }

    const data = {
      phone: body.phone?.trim() || null,
      email: body.email?.trim() || null,
      street: body.street?.trim() || null,
      number: body.number?.trim() || null,
      complement: body.complement?.trim() || null,
      district: body.district?.trim() || null,
      city: body.city?.trim() || null,
      state: body.state?.trim() || null,
      zipCode: body.zipCode?.trim() || null,
      country: body.country?.trim() || null,
    };

    const hasAnyValue = Object.values(data).some((v) => v !== null);

    if (!hasAnyValue) {
      await prisma.contactOverride.deleteMany({
        where: { companyId: company.id, cnpj },
      });
      return NextResponse.json({ override: null });
    }

    const record = await prisma.contactOverride.upsert({
      where: { companyId_cnpj: { companyId: company.id, cnpj } },
      create: { companyId: company.id, cnpj, ...data },
      update: data,
    });

    return NextResponse.json({ override: record });
  } catch {
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
