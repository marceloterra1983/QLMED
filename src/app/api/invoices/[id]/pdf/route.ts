import { requireAuth, unauthorizedResponse } from '@/lib/auth';
import { getOriginalIssuedPdf } from '@/lib/original-issued-pdf';
import prisma from '@/lib/prisma';
import { getOrCreateSingleCompany } from '@/lib/single-company';
import puppeteer from 'puppeteer';
import { createLogger } from '@/lib/logger';
import type { PdfInvoiceView } from '@/lib/pdf/pdf-types';
import { parseXml, getPdfFilename } from '@/lib/pdf/pdf-utils';
import { extractDanfeData, buildDanfeHtml, buildFallbackHtml } from '@/lib/pdf/danfe-generator';
import { extractCteData, buildCteDataFromInvoice, buildCteHtml } from '@/lib/pdf/dacte-generator';
import { extractNfseData, buildNfseHtml } from '@/lib/pdf/nfse-generator';

const log = createLogger('invoices/:id/pdf');

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    let userId: string;
    try {
      userId = await requireAuth();
    } catch {
      return unauthorizedResponse();
    }
    const company = await getOrCreateSingleCompany(userId);

    const invoice = await prisma.invoice.findFirst({
      where: { id, companyId: company.id },
      include: { company: { select: { razaoSocial: true, cnpj: true } } },
    });

    if (!invoice) {
      return new Response('Nota fiscal n\u00e3o encontrada.', { status: 404 });
    }

    const url = new URL(req.url);
    const autoPrint = url.searchParams.get('print') === 'true';
    const download = url.searchParams.get('download') === 'true';
    const format = url.searchParams.get('format');
    const forceHtml = format === 'html' && !!invoice.xmlContent;

    const originalIssuedPdf = forceHtml
      ? null
      : await getOriginalIssuedPdf({
          companyId: invoice.companyId,
          type: invoice.type,
          direction: invoice.direction,
          number: invoice.number,
          issueDate: invoice.issueDate,
        });

    if (originalIssuedPdf) {
      const encodedFilename = encodeURIComponent(originalIssuedPdf.filename);
      const dispositionType = download ? 'attachment' : 'inline';

      return new Response(new Uint8Array(originalIssuedPdf.buffer), {
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `${dispositionType}; filename="${originalIssuedPdf.filename}"; filename*=UTF-8''${encodedFilename}`,
          'Cache-Control': autoPrint
            ? 'no-store, no-cache, must-revalidate, max-age=0'
            : 'private, max-age=300',
          Pragma: 'no-cache',
          Expires: '0',
        },
      });
    }

    let html: string;

    try {
      if (invoice.xmlContent && invoice.type === 'NFE') {
        const parsed = await parseXml(invoice.xmlContent);
        const data = extractDanfeData(parsed);
        html = buildDanfeHtml(data, autoPrint);
      } else if (invoice.xmlContent && invoice.type === 'CTE') {
        const parsed = await parseXml(invoice.xmlContent);
        const data = extractCteData(parsed, invoice as PdfInvoiceView);
        html = buildCteHtml(data, autoPrint);
      } else if (invoice.type === 'CTE') {
        const data = buildCteDataFromInvoice(invoice as PdfInvoiceView);
        html = buildCteHtml(data, autoPrint);
      } else if (invoice.xmlContent && invoice.type === 'NFSE') {
        const parsed = await parseXml(invoice.xmlContent);
        const data = extractNfseData(parsed, invoice as PdfInvoiceView);
        html = buildNfseHtml(data, autoPrint);
      } else if (invoice.type === 'NFSE') {
        const data = extractNfseData({}, invoice as PdfInvoiceView);
        html = buildNfseHtml(data, autoPrint);
      } else {
        html = buildFallbackHtml(invoice as PdfInvoiceView, autoPrint);
      }
    } catch (parseErr) {
      log.error({ err: parseErr }, '[PDF] XML parse error, using fallback');
      if (invoice.type === 'CTE') {
        const data = buildCteDataFromInvoice(invoice as PdfInvoiceView);
        html = buildCteHtml(data, autoPrint);
      } else if (invoice.type === 'NFSE') {
        const data = extractNfseData({}, invoice as PdfInvoiceView);
        html = buildNfseHtml(data, autoPrint);
      } else {
        html = buildFallbackHtml(invoice as PdfInvoiceView, autoPrint);
      }
    }

    if (download) {
      const filename = getPdfFilename(invoice as PdfInvoiceView);
      const fallbackFilename = filename.replace(/[\\/]/g, '_');
      const encodedFilename = encodeURIComponent(filename);

      const browser = await puppeteer.launch({
        headless: true,
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu', '--disable-dev-shm-usage'],
      });
      try {
        const page = await browser.newPage();
        await page.setContent(html, { waitUntil: 'load' });
        const pdfBuffer = await page.pdf({
          format: 'A4',
          printBackground: true,
          margin: { top: '5mm', right: '5mm', bottom: '5mm', left: '5mm' },
        });

        return new Response(Buffer.from(pdfBuffer), {
          headers: {
            'Content-Type': 'application/pdf',
            'Content-Disposition': `attachment; filename="${fallbackFilename}"; filename*=UTF-8''${encodedFilename}`,
            'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
            Pragma: 'no-cache',
            Expires: '0',
          },
        });
      } finally {
        await browser.close();
      }
    }

    return new Response(html, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
        Pragma: 'no-cache',
        Expires: '0',
      },
    });
  } catch (error) {
    log.error({ err: error }, '[PDF] Internal error');
    return new Response('Erro interno ao gerar documento.', { status: 500 });
  }
}
