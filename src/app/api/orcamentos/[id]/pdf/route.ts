import { NextResponse } from 'next/server';
import { requireAuth, unauthorizedResponse } from '@/lib/auth';
import { getOrCreateSingleCompany } from '@/lib/single-company';
import { apiError } from '@/lib/api-error';
import prisma from '@/lib/prisma';
import { renderHtmlToPdf } from '@/lib/pdf/render';
import { getQuote, markQuoteIssued } from '@/lib/orcamentos/store';
import { buildQuoteHtml, QUOTE_PDF_OPTIONS } from '@/lib/orcamentos/pdf-html';
import { buildIssuer } from '@/lib/orcamentos/issuer';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, ctx: Ctx) {
  try {
    let userId: string;
    try {
      userId = await requireAuth();
    } catch {
      return unauthorizedResponse();
    }
    const company = await getOrCreateSingleCompany(userId);
    const { id } = await ctx.params;
    const quoted = await markQuoteIssued(company.id, id);
    const quote = quoted ?? (await getQuote(company.id, id));
    if (!quote) return NextResponse.json({ error: 'Orçamento não encontrado' }, { status: 404 });

    const cnpj = company.cnpj.replace(/\D/g, '');
    const [fiscal, override] = await Promise.all([
      prisma.contactFiscal.findUnique({
        where: { companyId_cnpj: { companyId: company.id, cnpj } },
        select: { ie: true, city: true, uf: true },
      }),
      prisma.contactOverride.findUnique({
        where: { companyId_cnpj: { companyId: company.id, cnpj } },
      }),
    ]);
    const issuer = buildIssuer({
      razaoSocial: company.razaoSocial,
      cnpj: company.cnpj,
      ie: fiscal?.ie,
      street: override?.street,
      number: override?.number,
      district: override?.district,
      city: override?.city || fiscal?.city,
      state: override?.state || fiscal?.uf,
      phone: override?.phone,
      email: override?.email,
    });

    let pdf: Buffer<ArrayBuffer>;
    try {
      pdf = await renderHtmlToPdf(buildQuoteHtml(quote, issuer), QUOTE_PDF_OPTIONS);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Falha ao gerar PDF';
      const missingChrome = /PUPPETEER_EXECUTABLE_PATH|executable/i.test(message);
      return NextResponse.json(
        { error: missingChrome ? 'Geração de PDF indisponível neste ambiente' : 'Falha ao gerar PDF' },
        { status: 503 },
      );
    }

    const download = new URL(req.url).searchParams.get('download') === '1';
    const filename = `orcamento-${quote.numberLabel}.pdf`;
    return new NextResponse(pdf, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `${download ? 'attachment' : 'inline'}; filename="${filename}"`,
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (error) {
    return apiError(error, 'orcamentos/pdf');
  }
}
