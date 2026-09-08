import { createLogger } from '@/lib/logger';
import { extractDanfeData, buildDanfeHtml } from '@/lib/pdf/danfe-generator';
import { countPdfPages } from '@/lib/pdf/pdf-page-count';
import { parseXml } from '@/lib/pdf/pdf-utils';
import { renderHtmlToPdf } from '@/lib/pdf/render';
import { saveIssuedPdfToFile } from '@/lib/xml-file-store';

const log = createLogger('nfe-emission');

const DANFE_PDF_OPTIONS = {
  format: 'A4' as const,
  printBackground: true,
  margin: { top: '4mm', right: '4mm', bottom: '4mm', left: '4mm' },
};

/**
 * Grava o DANFE no backup local após autorização. Falha de render não
 * pode desfazer a NF-e — o XML já está na SEFAZ.
 *
 * Duas passadas quando o primeiro PDF tem mais de uma página: o total
 * entra em `data-total` para o CSS da FOLHA X de Y.
 */
export async function persistAuthorizedDanfePdf(input: {
  companyId: string;
  invoiceNumber: string;
  xml: string;
  issueDate: Date | string | null;
}): Promise<string | null> {
  try {
    const parsed = await parseXml(input.xml);
    const data = extractDanfeData(parsed);
    if (!data.nNF) return null;
    let html = buildDanfeHtml(data, false, { totalPages: 1 });
    let pdf = await renderHtmlToPdf(html, DANFE_PDF_OPTIONS);
    const pages = countPdfPages(pdf);
    if (pages > 1) {
      html = buildDanfeHtml(data, false, { totalPages: pages });
      pdf = await renderHtmlToPdf(html, DANFE_PDF_OPTIONS);
    }
    return saveIssuedPdfToFile(input.companyId, input.invoiceNumber, pdf, input.issueDate);
  } catch (err) {
    log.error({ err, invoiceNumber: input.invoiceNumber }, 'Falha ao gravar DANFE PDF');
    return null;
  }
}
