import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, unauthorizedResponse } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { NsdocsClient, NsdocsDocumento } from '@/lib/nsdocs-client';
import { getOrCreateSingleCompany } from '@/lib/single-company';
import { parseInvoiceXml } from '@/lib/parse-invoice-xml';
import { mapSourceStatusToInvoiceStatus } from '@/lib/source-status';

export const maxDuration = 60; // Start with 60s for Vercel/Next.js function

export async function POST(request: NextRequest) {
  let userId: string;
  try {
    userId = await requireAuth();
  } catch {
    return unauthorizedResponse();
  }

  try {
    const body = await request.json();
    const { startDate, endDate } = body;

    if (!startDate || !endDate) {
       return NextResponse.json({ error: 'Parâmetros inválidos' }, { status: 400 });
    }

    const baseCompany = await getOrCreateSingleCompany(userId);
    const companyId = baseCompany.id;
    const company = await prisma.company.findUnique({
      where: { id: companyId },
      include: { nsdocsConfig: true }
    });

    if (!company || !company.nsdocsConfig) {
      return NextResponse.json({ error: 'Empresa ou configuração NSDocs não encontrada' }, { status: 404 });
    }

    const client = new NsdocsClient(company.nsdocsConfig.apiToken);

    // Listar documentos do período (até 100 por chamada, frontend itera mês a mês)
    const filtros: Record<string, string> = {
      dtInicial: startDate, // Esperado YYYY-MM-DD
      dtFinal: endDate,
      quantidade: '100',
      ordenacao_campo: 'dataemissao',
      ordenacao_tipo: 'asc'
    };

    let documentos: NsdocsDocumento[] = [];
    try {
      console.log(`[Import] Buscando documentos de ${startDate} a ${endDate}...`);
      documentos = await client.listarDocumentos(filtros);
      console.log(`[Import] Encontrados ${documentos?.length || 0} documentos.`);
    } catch (err: any) {
      console.error('Erro ao listar documentos NSDocs:', err);
      return NextResponse.json({ error: `Erro na API NSDocs: ${err.message}` }, { status: 500 });
    }

    if (!documentos || !Array.isArray(documentos) || documentos.length === 0) {
      return NextResponse.json({ imported: 0, skipped: 0, errors: 0, message: 'Nenhum documento no período' });
    }

    let imported = 0;
    let skipped = 0;
    let errors = 0;

    console.log(`[Import] Processando ${documentos.length} documentos...`);

    for (let i = 0; i < documentos.length; i++) {
      const doc = documentos[i];
      try {
        if (!doc.id) {
           errors++;
           continue;
        }

        const xmlContent = await client.recuperarXml(doc.id);
        if (!xmlContent || xmlContent.length < 50) {
           console.error(`XML vazio ou inválido para doc ID ${doc.id}`);
           errors++;
           continue;
        }

        const parsed = await parseInvoiceXml(xmlContent);
        if (!parsed || !parsed.accessKey) {
            console.error(`[Import] Documento sem chave de acesso (ID ${doc.id})`);
            errors++;
            continue;
        }

        const mappedStatus = mapSourceStatusToInvoiceStatus(parsed.type, doc.situacao);
        const exists = await prisma.invoice.findUnique({
          where: { accessKey: parsed.accessKey },
          select: { id: true, status: true },
        });
        if (exists) {
          if (exists.status !== mappedStatus) {
            await prisma.invoice.update({
              where: { id: exists.id },
              data: { status: mappedStatus },
            });
          }
          skipped++;
          continue;
        }

        const companyCnpjClean = company.cnpj.replace(/\D/g, '');
        const senderCnpjClean = parsed.senderCnpj.replace(/\D/g, '');
        const direction = senderCnpjClean === companyCnpjClean ? 'issued' : 'received';

        await prisma.invoice.create({
          data: {
             companyId,
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
             status: mappedStatus,
             xmlContent,
          }
        });

        imported++;
      } catch (err: any) {
        console.error(`[Import] Falha no documento ID ${doc.id}:`, err);
        errors++;
      }
    }

    console.log(`[Import] Resultado: ${imported} importados, ${skipped} pulados, ${errors} erros (total: ${documentos.length})`);

    return NextResponse.json({ 
      imported, 
      skipped, 
      errors, 
      totalProcessed: documentos.length 
    });

  } catch (error: any) {
    console.error('Erro geral na importação:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
