import { NextResponse } from 'next/server';
import { requireAuth, unauthorizedResponse } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { getOrCreateSingleCompany } from '@/lib/single-company';
import { apiValidationError } from '@/lib/api-error';
import { overrideSchema } from '@/lib/schemas/contacts';

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
    const parsed = overrideSchema.safeParse(body);
    if (!parsed.success) return apiValidationError(parsed.error);

    const cnpj = parsed.data.cnpj.trim();

    const data = {
      phone: parsed.data.phone?.trim() || null,
      email: parsed.data.email?.trim() || null,
      street: parsed.data.street?.trim() || null,
      number: parsed.data.number?.trim() || null,
      complement: parsed.data.complement?.trim() || null,
      district: parsed.data.district?.trim() || null,
      city: parsed.data.city?.trim() || null,
      state: parsed.data.state?.trim() || null,
      zipCode: parsed.data.zipCode?.trim() || null,
      country: parsed.data.country?.trim() || null,
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
