import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { requireAuth, requireEditor, unauthorizedResponse, forbiddenResponse } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { getOrCreateSingleCompany } from '@/lib/single-company';
import { apiError, apiValidationError } from '@/lib/api-error';
import { nfeEmissionPayloadSchema } from '@/lib/nfe-emission/schema';
import { draftTotalValue } from '@/lib/nfe-emission/xml-builder';
import { assertDestinatarioClientePj } from '@/lib/nfe-emission/types';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const userId = await requireAuth();
    const company = await getOrCreateSingleCompany(userId);
    const { id } = await params;
    const emission = await prisma.invoiceEmission.findFirst({
      where: { id, companyId: company.id },
    });
    if (!emission) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 });
    const { signedXml: _s, protocolXml: _p, ...safe } = emission;
    return NextResponse.json({ emission: safe });
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') return unauthorizedResponse();
    return apiError(error, 'GET /api/nfe-emissions/[id]');
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    let userId: string;
    try {
      userId = (await requireEditor()).userId;
    } catch (e) {
      if (e instanceof Error && e.message === 'FORBIDDEN') return forbiddenResponse();
      return unauthorizedResponse();
    }
    const company = await getOrCreateSingleCompany(userId);
    const { id } = await params;
    const existing = await prisma.invoiceEmission.findFirst({ where: { id, companyId: company.id } });
    if (!existing) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 });
    if (existing.status === 'authorized') {
      return NextResponse.json({ error: 'Nota já autorizada' }, { status: 409 });
    }
    // Editar uma emissão `submitted` zerava número e chave enquanto o envio
    // ainda podia estar em voo na SEFAZ (QLMED-FISCAL-002). Só a consulta de
    // protocolo pode tirar o rascunho desse estado.
    if (existing.status === 'submitted') {
      return NextResponse.json(
        { error: 'Nota já enviada à SEFAZ; consulte o protocolo antes de editar' },
        { status: 409 },
      );
    }
    const parsed = nfeEmissionPayloadSchema.safeParse(await req.json());
    if (!parsed.success) return apiValidationError(parsed.error);
    const payload = parsed.data;
    const clientes = await prisma.invoice.findMany({
      where: { companyId: company.id, type: 'NFE', direction: 'issued', recipientCnpj: { not: null } },
      select: { recipientCnpj: true },
      distinct: ['recipientCnpj'],
    });
    try {
      assertDestinatarioClientePj(payload.destCnpj, clientes.map((r) => r.recipientCnpj || ''));
    } catch (e) {
      return NextResponse.json({ error: e instanceof Error ? e.message : 'Destinatário inválido' }, { status: 400 });
    }
    const updated = await prisma.invoiceEmission.update({
      where: { id },
      data: {
        status: 'draft',
        series: payload.series,
        natureza: payload.natureza,
        cfop: payload.cfop,
        destCnpj: payload.destCnpj,
        destName: payload.destName || existing.destName,
        payload,
        totalValue: new Prisma.Decimal(draftTotalValue(payload.items)),
        sefazStat: null,
        sefazMotivo: null,
        number: null,
        accessKey: null,
      },
    });
    const { signedXml: _s, protocolXml: _p, ...safe } = updated;
    return NextResponse.json({ emission: safe });
  } catch (error) {
    return apiError(error, 'PATCH /api/nfe-emissions/[id]');
  }
}
