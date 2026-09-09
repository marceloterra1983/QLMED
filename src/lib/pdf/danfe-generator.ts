import type { DanfeData, PdfInvoiceView } from './pdf-types';
import { esc, fmtCnpj, fmtKey, fmtDate, fmtCurrency, getPdfFilename } from './pdf-utils';
import { PDF_CSS } from './pdf-css';
import { buildDanfeHtml as buildIssuedDanfeHtml } from './danfe-html';
import { buildReceivedDanfeHtml } from './danfe-received-html';

export { extractDanfeData } from './danfe-extract';
export { buildIssuedDanfeHtml, buildReceivedDanfeHtml };

export interface BuildDanfeOptions {
  pageCount?: number;
  direction?: 'issued' | 'received';
}

export function buildDanfeHtml(
  data: DanfeData,
  autoPrint: boolean = false,
  options?: BuildDanfeOptions,
): string {
  if (options?.direction === 'received') {
    return buildReceivedDanfeHtml(data, autoPrint);
  }
  return buildIssuedDanfeHtml(data, autoPrint, options);
}

// ==================== Fallback for non-NFe ====================

export function buildFallbackHtml(invoice: PdfInvoiceView, autoPrint: boolean): string {
  const typeLabel: Record<string, string> = { NFE: 'NF-e', CTE: 'CT-e', NFSE: 'NFS-e' };
  const tl = typeLabel[invoice.type] || invoice.type;
  const now = new Date().toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const title = invoice.type === 'CTE' ? getPdfFilename(invoice) : `${tl} ${invoice.number}`;

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <title>${esc(title)}</title>
  <style>
    ${PDF_CSS}
    .simple-header { background: #333; color: #fff; padding: 15px 20px; }
    .simple-header h1 { font-size: 16px; margin-bottom: 4px; }
    .simple-header p { font-size: 10px; opacity: .8; }
    .simple-body { padding: 15px 20px; }
    .simple-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom: 15px; }
    .simple-card { border: 1px solid #ccc; border-radius: 4px; padding: 10px; }
    .simple-card h3 { font-size: 8px; text-transform: uppercase; color: #666; margin-bottom: 6px; font-weight: bold; }
    .simple-card .name { font-size: 12px; font-weight: bold; }
    .simple-card .cnpj { font-size: 10px; color: #555; font-family: monospace; }
    .simple-total { text-align: center; background: #f5f5f5; border: 1px solid #ccc; border-radius: 4px; padding: 12px; margin-bottom: 15px; }
    .simple-total .label { font-size: 9px; text-transform: uppercase; color: #666; }
    .simple-total .value { font-size: 24px; font-weight: bold; }
    .simple-key { border: 1px solid #ccc; border-radius: 4px; padding: 10px; margin-bottom: 15px; }
    .simple-key h3 { font-size: 8px; text-transform: uppercase; color: #666; margin-bottom: 4px; font-weight: bold; }
    .simple-key .val { font-family: monospace; font-size: 10px; word-break: break-all; letter-spacing: .5px; }
  </style>
</head>
<body>
  <div class="page">
    <div class="simple-header">
      <h1>${esc(invoice.company.razaoSocial)}</h1>
      <p>CNPJ: ${fmtCnpj(invoice.company.cnpj)} &mdash; ${tl} N&ordm; ${esc(invoice.number)} / S&eacute;rie ${esc(invoice.series || '1')}</p>
    </div>
    <div class="simple-body">
      <div class="simple-grid">
        <div class="simple-card">
          <h3>Emitente</h3>
          <div class="name">${esc(invoice.senderName)}</div>
          <div class="cnpj">CNPJ: ${fmtCnpj(invoice.senderCnpj)}</div>
        </div>
        <div class="simple-card">
          <h3>Destinat&aacute;rio</h3>
          <div class="name">${esc(invoice.recipientName)}</div>
          <div class="cnpj">CNPJ: ${fmtCnpj(invoice.recipientCnpj)}</div>
        </div>
      </div>
      <div class="simple-total">
        <div class="label">Valor Total</div>
        <div class="value">${fmtCurrency(Number(invoice.totalValue))}</div>
      </div>
      <div class="simple-key">
        <h3>Chave de Acesso</h3>
        <div class="val">${fmtKey(invoice.accessKey)}</div>
      </div>
      <div style="text-align:center; font-size:10px; color:#888; margin-top:20px;">
        Emiss&atilde;o: ${fmtDate(invoice.issueDate.toISOString())}
      </div>
    </div>
    <div class="footer-line" style="padding: 10px 20px;">
      <span>DATA E HORA DA IMPRESS&Atilde;O:${now}</span>
      <span>QLMED - Sistema de Gest&atilde;o Fiscal</span>
    </div>
  </div>
  ${autoPrint ? '<script>window.addEventListener("load", function() { window.print(); });</script>' : ''}
</body>
</html>`;
}
