import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, unauthorizedResponse } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { NsdocsClient, NsdocsDocumento } from '@/lib/nsdocs-client';
import { getOrCreateSingleCompany } from '@/lib/single-company';
import xml2js from 'xml2js';

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

    const parser = new xml2js.Parser({ explicitArray: false, mergeAttrs: true, tagNameProcessors: [xml2js.processors.stripPrefix] });

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

        // 1. Baixar XML
        const xmlContent = await client.recuperarXml(doc.id);

        if (!xmlContent || xmlContent.length < 50) {
           console.error(`XML vazio ou inválido para doc ID ${doc.id}`);
           errors++;
           continue;
        }

        // 2. Parsear XML
        const result = await parser.parseStringPromise(xmlContent);
        
        let accessKey = '';
        let type = 'NFE';
        let issueDate = new Date();
        let number = '';
        let series = '';
        let senderCnpj = '';
        let senderName = '';
        let recipientCnpj = '';
        let recipientName = '';
        let totalValue = 0;

        // Verificar se é NFe
        const nfeProc = result.nfeProc;
        const nfe = nfeProc ? nfeProc.NFe : result.NFe;
        const infNFe = nfe ? nfe.infNFe : null;

        // Verificar se é CTe
        const cteProc = result.cteProc;
        const cte = cteProc ? cteProc.CTe : result.CTe;
        const infCte = cte ? cte.infCte : null;

        if (infNFe) {
            type = 'NFE';
            accessKey = infNFe.Id || '';
            if (accessKey.startsWith('NFe')) accessKey = accessKey.substring(3);

            const ide = infNFe.ide;
            const emit = infNFe.emit;
            const dest = infNFe.dest;
            const total = infNFe.total;

            issueDate = ide?.dhEmi ? new Date(ide.dhEmi) : (ide?.dEmi ? new Date(ide.dEmi) : new Date());
            number = ide?.nNF || '';
            series = ide?.serie || '';
            senderCnpj = emit?.CNPJ || '';
            senderName = emit?.xNome || '';
            recipientCnpj = dest?.CNPJ || '';
            recipientName = dest?.xNome || '';
            totalValue = total?.ICMSTot?.vNF ? Number(total.ICMSTot.vNF) : 0;

        } else if (infCte) {
            type = 'CTE';
            accessKey = infCte.Id || '';
            if (accessKey.startsWith('CTe')) accessKey = accessKey.substring(3);

            const ide = infCte.ide;
            const emit = infCte.emit;
            const dest = infCte.dest; // Pode ser rem, dest, exped, receb. Geralmente dest é quem paga ou recebe.
            const vPrest = infCte.vPrest;

            issueDate = ide?.dhEmi ? new Date(ide.dhEmi) : new Date();
            number = ide?.nCT || '';
            series = ide?.serie || '';
            senderCnpj = emit?.CNPJ || '';
            senderName = emit?.xNome || '';
            recipientCnpj = dest?.CNPJ || '';
            recipientName = dest?.xNome || '';
            totalValue = vPrest?.vTPrest ? Number(vPrest.vTPrest) : 0;
        } else {
            console.error(`Estrutura de XML desconhecida para doc ID ${doc.id}`);
            errors++;
            continue;
        }

        if (!accessKey) {
            console.error(`[Import] Documento sem chave de acesso (ID ${doc.id})`);
            errors++;
            continue;
        }

        // Verificar se já existe
        const exists = await prisma.invoice.findUnique({
          where: { accessKey }
        });

        if (exists) {
          skipped++;
          continue;
        }

        // Determinar direção: emitida ou recebida
        const companyCnpjClean = company.cnpj.replace(/\D/g, '');
        const senderCnpjClean = senderCnpj.replace(/\D/g, '');
        const direction = senderCnpjClean === companyCnpjClean ? 'issued' : 'received';

        // Salvar no banco
        await prisma.invoice.create({
          data: {
             companyId,
             accessKey,
             type, // NFE ou CTE
             direction,
             number,
             series,
             issueDate,
             senderCnpj,
             senderName,
             recipientCnpj,
             recipientName,
             totalValue,
             status: 'received',
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
