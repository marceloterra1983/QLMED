import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { requireAuth, requireEditor, unauthorizedResponse, forbiddenResponse } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { getOrCreateSingleCompany } from '@/lib/single-company';
import { apiError, apiValidationError } from '@/lib/api-error';
import { nfeEmissionPayloadSchema } from '@/lib/nfe-emission/schema';
import { getSaidaOperation } from '@/lib/nfe-emission/operations';
import { draftTotalValue } from '@/lib/nfe-emission/xml-builder';
import { assertDestinatarioClientePj } from '@/lib/nfe-emission/types';

async function customerCnpjs(companyId: string): Promise<Set<string>> {
  const rows = await prisma.invoice.findMany({
    where: { companyId, type: 'NFE', direction: 'issued', recipientCnpj: { not: null } },
    select: { recipientCnpj: true },
    distinct: ['recipientCnpj'],
  });
  return new Set(rows.map((r) => (r.recipientCnpj || '').replace(/\D/g, '')).filter((c) => c.length === 14));
}

export async function GET() {
  try {
    const userId = await requireAuth();
    const company = await getOrCreateSingleCompany(userId);
    const rows = await prisma.invoiceEmission.findMany({
      where: { companyId: company.id },
      orderBy: { updatedAt: 'desc' },
      take: 50,
      select: {
        id: true,
        status: true,
        series: true,
        number: true,
        natureza: true,
        cfop: true,
        destCnpj: true,
        destName: true,
        totalValue: true,
        sefazMotivo: true,
        invoiceId: true,
        updatedAt: true,
      },
    });
    return NextResponse.json({ emissions: rows });
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') return unauthorizedResponse();
    return apiError(error, 'GET /api/nfe-emissions');
  }
}

export async function POST(req: Request) {
  try {
    let userId: string;
    try {
      userId = (await requireEditor()).userId;
    } catch (e) {
      if (e instanceof Error && e.message === 'FORBIDDEN') return forbiddenResponse();
      return unauthorizedResponse();
    }
    const company = await getOrCreateSingleCompany(userId);
    const parsed = nfeEmissionPayloadSchema.safeParse(await req.json());
    if (!parsed.success) return apiValidationError(parsed.error);
    const payload = parsed.data;
    const clientes = await customerCnpjs(company.id);
    try {
      assertDestinatarioClientePj(payload.destCnpj, clientes);
    } catch (e) {
      return NextResponse.json({ error: e instanceof Error ? e.message : 'Destinatário inválido' }, { status: 400 });
    }
    const op = getSaidaOperation(payload.cfop);
    const created = await prisma.invoiceEmission.create({
      data: {
        companyId: company.id,
        series: payload.series,
        natureza: payload.natureza || op?.natureza || 'Venda',
        cfop: payload.cfop,
        destCnpj: payload.destCnpj,
        destName: payload.destName || payload.destCnpj,
        payload,
        totalValue: new Prisma.Decimal(draftTotalValue(payload.items)),
        createdByUserId: userId,
      },
    });
    return NextResponse.json({ emission: created }, { status: 201 });
  } catch (error) {
    return apiError(error, 'POST /api/nfe-emissions');
  }
}
