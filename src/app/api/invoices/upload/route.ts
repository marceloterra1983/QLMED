import { NextResponse } from 'next/server';
import { requireAuth, unauthorizedResponse } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { parseInvoiceXml } from '@/lib/parse-invoice-xml';
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

    // Validate files: type and size
    const MAX_XML_SIZE = 5 * 1024 * 1024; // 5MB per file
    const MAX_FILES = 50;
    if (files.length > MAX_FILES) {
      return NextResponse.json({ error: `Máximo de ${MAX_FILES} arquivos por envio` }, { status: 400 });
    }
    for (const file of files) {
      const name = file.name?.toLowerCase() || '';
      if (!name.endsWith('.xml')) {
        return NextResponse.json({ error: `Arquivo "${file.name}" não é XML` }, { status: 400 });
      }
      if (file.size > MAX_XML_SIZE) {
        return NextResponse.json({ error: `Arquivo "${file.name}" excede limite de 5MB` }, { status: 400 });
      }
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
        if (!parsed) {
          results.errors.push(`${file.name}: XML inválido ou não suportado`);
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
            issueDate: parsed.issueDate,
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
        // P2002 = unique constraint violation (duplicate accessKey)
        if (err?.code === 'P2002') {
          results.errors.push(`${file.name}: Chave de acesso já cadastrada`);
        } else {
          console.error(`[Upload] Error processing ${file.name}:`, err);
          results.errors.push(`${file.name}: XML inválido ou não suportado`);
        }
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
