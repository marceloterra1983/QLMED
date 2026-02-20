import { NextResponse } from 'next/server';
import { requireAuth, unauthorizedResponse } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { parseInvoiceXml } from '@/lib/xml-parser';
import { getOrCreateSingleCompany } from '@/lib/single-company';

export async function POST(req: Request) {
  try {
    let userId: string;
    try {
      userId = await requireAuth();
    } catch {
      return unauthorizedResponse();
    }

    const formData = await req.formData();
    const files = formData.getAll('files') as File[];
    const baseCompany = await getOrCreateSingleCompany(userId);
    const companyId = baseCompany.id;

    if (!files || files.length === 0) {
      return NextResponse.json({ error: 'Nenhum arquivo enviado' }, { status: 400 });
    }

    const company = await prisma.company.findFirst({
      where: { id: companyId },
    });

    if (!company) {
      return NextResponse.json({ error: 'Empresa não encontrada' }, { status: 404 });
    }

    const results: { success: string[]; errors: string[] } = { success: [], errors: [] };

    for (const file of files) {
      try {
        const xmlContent = await file.text();
        const parsed = await parseInvoiceXml(xmlContent);

        const existing = await prisma.invoice.findUnique({
          where: { accessKey: parsed.accessKey },
        });

        if (existing) {
          results.errors.push(`${file.name}: Chave de acesso já cadastrada`);
          continue;
        }

        // Determinar direção: emitida ou recebida
        const companyCnpjClean = company.cnpj.replace(/\D/g, '');
        const senderCnpjClean = parsed.senderCnpj.replace(/\D/g, '');
        const direction = senderCnpjClean === companyCnpjClean ? 'issued' : 'received';

        await prisma.invoice.create({
          data: {
            accessKey: parsed.accessKey,
            type: parsed.type,
            direction,
            number: parsed.number,
            series: parsed.series,
            issueDate: new Date(parsed.issueDate),
            senderCnpj: parsed.senderCnpj,
            senderName: parsed.senderName,
            recipientCnpj: parsed.recipientCnpj,
            recipientName: parsed.recipientName,
            totalValue: parsed.totalValue,
            xmlContent,
            companyId,
          },
        });

        results.success.push(file.name);
      } catch (err: any) {
        console.error(`[Upload] Error processing ${file.name}:`, err?.message || err);
        const msg = err?.message || 'Erro desconhecido';
        results.errors.push(`${file.name}: ${msg}`);
      }
    }

    return NextResponse.json({
      message: `${results.success.length} nota(s) importada(s) com sucesso`,
      results,
    });
  } catch (error) {
    console.error('Error uploading invoices:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
