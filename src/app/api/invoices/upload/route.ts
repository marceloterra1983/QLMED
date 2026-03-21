import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireEditor, unauthorizedResponse, forbiddenResponse } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { parseInvoiceXml } from '@/lib/parse-invoice-xml';
import { getOrCreateSingleCompany } from '@/lib/single-company';
import { resolveInvoiceDirection } from '@/lib/invoice-direction';
import { updateProductAggregatesForInvoice } from '@/lib/product-aggregate-updater';

const MAX_XML_SIZE = 5 * 1024 * 1024; // 5MB per file
const MAX_FILES = 50;

const uploadSchema = z.object({
  files: z
    .array(
      z.object({
        name: z.string().refine((n) => n.toLowerCase().endsWith('.xml'), { message: 'Arquivo não é XML' }),
        size: z.number().max(MAX_XML_SIZE, { message: 'Arquivo excede limite de 5MB' }),
      })
    )
    .min(1, { message: 'Nenhum arquivo enviado' })
    .max(MAX_FILES, { message: `Máximo de ${MAX_FILES} arquivos por envio` }),
});

export async function POST(req: Request) {
  try {
    let userId: string;
    try {
      const auth = await requireEditor();
      userId = auth.userId;
    } catch (e: any) {
      if (e.message === 'FORBIDDEN') return forbiddenResponse();
      return unauthorizedResponse();
    }

    const formData = await req.formData();
    const files = formData.getAll('files') as File[];
    const baseCompany = await getOrCreateSingleCompany(userId);
    const companyId = baseCompany.id;

    const fileMeta = files.map((f) => ({ name: f.name || '', size: f.size }));
    const validated = uploadSchema.safeParse({ files: fileMeta });
    if (!validated.success) {
      const firstError = validated.error.errors[0]?.message || 'Dados inválidos';
      return NextResponse.json({ error: firstError }, { status: 400 });
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
        const direction = resolveInvoiceDirection(company.cnpj, parsed.senderCnpj, parsed.accessKey);

        const savedInvoice = await prisma.invoice.create({
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
