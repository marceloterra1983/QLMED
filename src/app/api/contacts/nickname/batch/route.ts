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
    const cnpjs = searchParams.getAll('cnpjs').filter(Boolean);

    if (cnpjs.length === 0) {
      return NextResponse.json({ nicknames: {} });
    }

    const records = await prisma.contactNickname.findMany({
      where: { companyId: company.id, cnpj: { in: cnpjs } },
      select: { cnpj: true, shortName: true },
    });

    const nicknames: Record<string, string> = {};
    for (const r of records) {
      nicknames[r.cnpj] = r.shortName;
    }

    return NextResponse.json({ nicknames });
  } catch {
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
