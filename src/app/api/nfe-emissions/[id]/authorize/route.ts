import { NextResponse } from 'next/server';
import { requireEditor, unauthorizedResponse, forbiddenResponse } from '@/lib/auth';
import { getOrCreateSingleCompany } from '@/lib/single-company';
import { authorizeInvoiceEmission } from '@/lib/nfe-emission/authorize';

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
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
    const result = await authorizeInvoiceEmission(company.id, id);
    if (result.status === 'rejected') {
      return NextResponse.json(result, { status: 422 });
    }
    // 202: aceito, desfecho ainda desconhecido na SEFAZ. Número e chave seguem
    // reservados — a UI deve consultar de novo, nunca reenviar.
    if (result.status === 'pending') {
      return NextResponse.json(result, { status: 202 });
    }
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Falha ao autorizar';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
