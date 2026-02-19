import { NextResponse } from 'next/server';
import { requireAuth, unauthorizedResponse } from '@/lib/auth';
import prisma from '@/lib/prisma';

export async function GET(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    try {
      await requireAuth();
    } catch {
      return unauthorizedResponse();
    }

    const invoice = await prisma.invoice.findFirst({
      where: {
        id: params.id,
      },
      select: { xmlContent: true, accessKey: true, type: true },
    });

    if (!invoice) {
      return NextResponse.json({ error: 'Nota não encontrada' }, { status: 404 });
    }

    const headers = new Headers();
    headers.set('Content-Type', 'application/xml');
    headers.set(
      'Content-Disposition',
      `attachment; filename="${invoice.type}_${invoice.accessKey}.xml"`
    );

    return new Response(invoice.xmlContent, { headers });
  } catch (error) {
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
