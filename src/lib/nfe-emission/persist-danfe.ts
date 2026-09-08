import { createLogger } from '@/lib/logger';
import { extractDanfeData, buildDanfeHtml } from '@/lib/pdf/danfe-generator';
import { parseXml } from '@/lib/pdf/pdf-utils';
import { renderHtmlToPdf } from '@/lib/pdf/render';
import { saveIssuedPdfToFile } from '@/lib/xml-file-store';

const log = createLogger('nfe-emission');

/**
 * Grava o DANFE no backup local após autorização. Falha de render não
 * pode desfazer a NF-e — o XML já está na SEFAZ.
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
    const html = buildDanfeHtml(data, false);
    const pdf = await renderHtmlToPdf(html, {
      format: 'A4',
      printBackground: true,
      margin: { top: '4mm', right: '4mm', bottom: '4mm', left: '4mm' },
    });
    return saveIssuedPdfToFile(input.companyId, input.invoiceNumber, pdf, input.issueDate);
  } catch (err) {
    log.error({ err, invoiceNumber: input.invoiceNumber }, 'Falha ao gravar DANFE PDF');
    return null;
  }
}
