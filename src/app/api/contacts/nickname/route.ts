import { NextResponse } from 'next/server';
import { requireAuth, unauthorizedResponse } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { getOrCreateSingleCompany } from '@/lib/single-company';
import { apiValidationError } from '@/lib/api-error';
import { nicknameSchema } from '@/lib/schemas/contacts';

export async function GET(req: Request) {
  try {
    let userId: string;
    try { userId = await requireAuth(); } catch { return unauthorizedResponse(); }

    const company = await getOrCreateSingleCompany(userId);
    const { searchParams } = new URL(req.url);
    const cnpj = (searchParams.get('cnpj') || '').trim();

    if (!cnpj) {
      return NextResponse.json({ shortName: null });
    }

    const record = await prisma.contactNickname.findUnique({
      where: { companyId_cnpj: { companyId: company.id, cnpj } },
      select: { shortName: true },
    });

    return NextResponse.json({ shortName: record?.shortName || null });
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
    const parsed = nicknameSchema.safeParse(body);
    if (!parsed.success) return apiValidationError(parsed.error);

    const cnpj = parsed.data.cnpj.trim();
    const shortName = parsed.data.shortName.trim();

    if (!shortName) {
      // Delete if empty
      await prisma.contactNickname.deleteMany({
        where: { companyId: company.id, cnpj },
      });
      return NextResponse.json({ shortName: null });
    }

    const record = await prisma.contactNickname.upsert({
      where: { companyId_cnpj: { companyId: company.id, cnpj } },
      create: { companyId: company.id, cnpj, shortName },
      update: { shortName },
    });

    return NextResponse.json({ shortName: record.shortName });
  } catch {
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
