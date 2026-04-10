import { NextRequest, NextResponse } from 'next/server';
import { requireEditor, unauthorizedResponse, forbiddenResponse } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { NsdocsClient, NsdocsDocumento } from '@/lib/nsdocs-client';
import { getOrCreateSingleCompany } from '@/lib/single-company';
import { decrypt } from '@/lib/crypto';
import { parseInvoiceXml } from '@/lib/parse-invoice-xml';
import { mapSourceStatusToInvoiceStatus } from '@/lib/source-status';
import { resolveInvoiceDirection } from '@/lib/invoice-direction';
import { extractFirstCfop } from '@/lib/cfop';
import { updateProductAggregatesForInvoice } from '@/lib/product-aggregate-updater';
import { apiError } from '@/lib/api-error';
import { createLogger } from '@/lib/logger';

const log = createLogger('nsdocs/import-period');

export const maxDuration = 60; // Start with 60s for Vercel/Next.js function

export async function POST(request: NextRequest) {
  let userId: string;
  try {
    const auth = await requireEditor();
    userId = auth.userId;
  } catch (e: unknown) {
      if (e instanceof Error && e.message === 'FORBIDDEN') return forbiddenResponse();
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

    const client = new NsdocsClient(decrypt(company.nsdocsConfig.apiToken));

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
      log.info({ startDate, endDate }, '[Import] Buscando documentos de {startDate} a {endDate}...');
      documentos = await client.listarDocumentos(filtros);
      log.info({ documentos: documentos?.length || 0 }, '[Import] Encontrados {documentos} documentos.');
    } catch (err: unknown) {
      log.error({ err: err }, 'Erro ao listar documentos NSDocs');
      return NextResponse.json({ error: 'Erro ao consultar API NSDocs' }, { status: 500 });
    }

    if (!documentos || !Array.isArray(documentos) || documentos.length === 0) {
      return NextResponse.json({ imported: 0, skipped: 0, errors: 0, message: 'Nenhum documento no período' });
    }

    let imported = 0;
    let skipped = 0;
    let errors = 0;

    log.info({ documentos: documentos.length }, '[Import] Processando {documentos} documentos...');

    for (let i = 0; i < documentos.length; i++) {
      const doc = documentos[i];
      try {
        if (!doc.id) {
           errors++;
           continue;
        }

        const xmlContent = await client.recuperarXml(doc.id);
        if (!xmlContent || xmlContent.length < 50) {
           log.error('XML vazio ou inválido para doc ID ${doc.id}');
           errors++;
           continue;
        }

        const parsed = await parseInvoiceXml(xmlContent);
        if (!parsed || !parsed.accessKey) {
            log.error('[Import] Documento sem chave de acesso (ID ${doc.id})');
            errors++;
            continue;
        }

        const mappedStatus = mapSourceStatusToInvoiceStatus(parsed.type, doc.situacao);
        const direction = resolveInvoiceDirection(company.cnpj, parsed.senderCnpj, parsed.accessKey);
        const cfop = extractFirstCfop(xmlContent);
        const exists = await prisma.invoice.findUnique({
          where: { accessKey: parsed.accessKey },
          select: { id: true, status: true },
        });
        if (exists) {
          await prisma.invoice.update({
            where: { id: exists.id },
            data: {
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
              cfop,
              xmlContent,
            },
          });
          skipped++;
          continue;
        }

        const savedInvoice = await prisma.invoice.create({
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
             cfop,
             xmlContent,
          }
        });

        if (parsed.type === 'NFE' && xmlContent) {
          updateProductAggregatesForInvoice({
            companyId,
            invoiceId: savedInvoice.id,
            xmlContent,
            direction,
            issueDate: parsed.issueDate ? new Date(parsed.issueDate) : null,
            senderName: parsed.senderName,
            senderCnpj: parsed.senderCnpj,
            recipientName: parsed.recipientName,
            recipientCnpj: parsed.recipientCnpj,
            invoiceNumber: parsed.number,
          }).catch(() => {});
        }

        imported++;
      } catch (err: unknown) {
        log.error({ err: err }, '[Import] Falha no documento ID ${doc.id}');
        errors++;
      }
    }

    log.info({ imported, skipped, errors, documentos: documentos.length }, '[Import] Resultado: {imported} importados, {skipped} pulados, {errors} erros (total: {documentos})');

    return NextResponse.json({ 
      imported, 
      skipped, 
      errors, 
      totalProcessed: documentos.length 
    });

  } catch (error: unknown) {
    return apiError(error, 'POST /api/nsdocs/import-period');
  }
}
