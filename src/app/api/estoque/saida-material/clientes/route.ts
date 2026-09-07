import { NextResponse } from 'next/server';
import { requireAuth, unauthorizedResponse } from '@/lib/auth';
import { getOrCreateSingleCompany } from '@/lib/single-company';
import { apiError, apiValidationError } from '@/lib/api-error';
import { saidaMaterialClientesQuerySchema } from '@/lib/schemas/estoque';
import prisma from '@/lib/prisma';

function digits(v: string): string {
  return v.replace(/\D/g, '');
}

export async function GET(req: Request) {
  try {
    let userId: string;
    try {
      userId = await requireAuth();
    } catch {
      return unauthorizedResponse();
    }
    const company = await getOrCreateSingleCompany(userId);
    const { searchParams } = new URL(req.url);
    const parsed = saidaMaterialClientesQuerySchema.safeParse({
      q: searchParams.get('q') || undefined,
      limit: searchParams.get('limit') || undefined,
    });
    if (!parsed.success) return apiValidationError(parsed.error);

    const limit = parsed.data.limit ?? 40;
    const q = (parsed.data.q || '').trim();
    const qDigits = digits(q);

    const rows = await prisma.invoice.findMany({
      where: {
        companyId: company.id,
        type: 'NFE',
        direction: 'issued',
        recipientCnpj: { not: null },
        ...(q
          ? {
              OR: [
                { recipientName: { contains: q, mode: 'insensitive' } },
                ...(qDigits.length >= 3 ? [{ recipientCnpj: { contains: qDigits } }] : []),
              ],
            }
          : {}),
      },
      select: { recipientCnpj: true, recipientName: true },
      distinct: ['recipientCnpj'],
      take: 200,
      orderBy: { recipientName: 'asc' },
    });

    const seen = new Set<string>();
    const clientes: Array<{ cnpj: string; name: string }> = [];
    for (const r of rows) {
      const cnpj = digits(r.recipientCnpj || '');
      if (cnpj.length !== 14 || seen.has(cnpj)) continue;
      seen.add(cnpj);
      clientes.push({ cnpj, name: (r.recipientName || cnpj).trim() });
      if (clientes.length >= limit) break;
    }

    // Também inclui CNPJs com saldo consignado (mesmo sem NF-e recente)
    if (clientes.length < limit) {
      const movements = await prisma.stockMovement.findMany({
        where: { companyId: company.id, locationType: 'CUSTOMER', locationCnpj: { not: null } },
        select: { locationCnpj: true, locationName: true },
        distinct: ['locationCnpj'],
        take: 200,
      });
      for (const m of movements) {
        const cnpj = digits(m.locationCnpj || '');
        if (cnpj.length !== 14 || seen.has(cnpj)) continue;
        if (q) {
          const name = (m.locationName || '').toLowerCase();
          if (!name.includes(q.toLowerCase()) && !cnpj.includes(qDigits)) continue;
        }
        seen.add(cnpj);
        clientes.push({ cnpj, name: (m.locationName || cnpj).trim() });
        if (clientes.length >= limit) break;
      }
    }

    return NextResponse.json({ clientes });
  } catch (error) {
    return apiError(error, 'estoque/saida-material/clientes');
  }
}
