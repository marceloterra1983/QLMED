import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, unauthorizedResponse } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { NsdocsClient } from '@/lib/nsdocs-client';

// GET - Lista documentos ou baixa XML/PDF de um documento específico
export async function GET(request: NextRequest) {
  try {
    await requireAuth();
  } catch {
    return unauthorizedResponse();
  }

  const { searchParams } = new URL(request.url);
  const companyId = searchParams.get('companyId');
  const documentId = searchParams.get('documentId');
  const format = searchParams.get('format'); // 'xml' | 'pdf'

  if (!companyId) {
    return NextResponse.json({ error: 'companyId é obrigatório' }, { status: 400 });
  }

  try {
    const company = await prisma.company.findUnique({
      where: { id: companyId },
      include: { nsdocsConfig: true },
    });

    if (!company?.nsdocsConfig) {
      return NextResponse.json({ error: 'Configuração NSDocs não encontrada' }, { status: 400 });
    }

    const client = new NsdocsClient(company.nsdocsConfig.apiToken);

    // Baixar XML ou PDF de um documento específico
    if (documentId && format) {
      if (format === 'xml') {
        const xml = await client.recuperarXml(documentId);
        return new NextResponse(xml, {
          headers: {
            'Content-Type': 'application/xml',
            'Content-Disposition': `attachment; filename="documento_${documentId}.xml"`,
          },
        });
      }

      if (format === 'pdf') {
        const pdf = await client.recuperarPdf(documentId);
        return new NextResponse(pdf, {
          headers: {
            'Content-Type': 'application/pdf',
            'Content-Disposition': `attachment; filename="documento_${documentId}.pdf"`,
          },
        });
      }
    }

    // Listar documentos da API NSDocs
    const documentos = await client.listarDocumentos({
      cnpj: company.cnpj,
    });

    return NextResponse.json({ documentos });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
