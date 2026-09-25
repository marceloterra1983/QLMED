import { esc, fmtCep, fmtCnpj, fmtFone } from '@/lib/pdf/pdf-utils';
import { DANFE_LOGO_SVG } from '@/lib/pdf/danfe-logo';
import { QUOTE_CLOSING_CONTACTS, type QuoteIssuer } from './issuer';
import { formatQuoteNumber } from './totals';

export type QuotePdfItem = {
  lineNumber: number;
  code: string;
  description: string;
  rvs: string | null;
  ncm: string | null;
  unit: string | null;
  quantity: string;
  unitPrice: string;
  discount: string;
  lineTotal: string;
};

export type QuotePdfView = {
  number: number;
  issuedAt: string;
  status: 'draft' | 'issued' | 'cancelled';
  customerName: string;
  customerCnpj: string;
  customerIe: string | null;
  customerCode: string | null;
  customerStreet: string | null;
  customerNumber: string | null;
  customerDistrict: string | null;
  customerCity: string | null;
  customerState: string | null;
  customerZip: string | null;
  salesperson: string | null;
  paymentTerms?: string | null;
  patientName: string | null;
  doctorName: string | null;
  convenio: string | null;
  local: string | null;
  notes: string | null;
  freight: string;
  subtotal: string;
  total: string;
  items: QuotePdfItem[];
};

function fmtBr(value: string): string {
  const [intRaw, fracRaw = '00'] = String(value).split('.');
  const sign = intRaw.startsWith('-') ? '-' : '';
  const int = intRaw.replace('-', '') || '0';
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${sign}${grouped},${fracRaw.padEnd(2, '0').slice(0, 2)}`;
}

function fmtQty(value: string): string {
  const n = String(value);
  if (n.includes('.')) {
    const trimmed = n.replace(/\.?0+$/, '');
    const [int, frac = ''] = trimmed.split('.');
    return frac ? `${int},${frac}` : int;
  }
  return n;
}

function isoToBr(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
}

function logo(page: number): string {
  return DANFE_LOGO_SVG
    .replaceAll('ql-danfe-disc', `ql-quote-disc-${page}`)
    .replaceAll('ql-danfe-cut-l', `ql-quote-cut-${page}`)
    .replace('class="emit-logo"', 'class="logo"');
}

function header(issuer: QuoteIssuer, date: string, page: number, withTitle: boolean): string {
  return `<table class="head">
    <tr>
      <td class="logo-cell">${logo(page)}</td>
      <td class="issuer">
        <div class="razao">${esc(issuer.razaoSocial)}</div>
        <div>CNPJ: ${esc(fmtCnpj(issuer.cnpj))} - Insc. Estadual: ${esc(issuer.ie)}</div>
        <div>${esc(issuer.addressLine)}</div>
        <div>Fone: ${esc(fmtFone(issuer.phone))}</div>
        <div class="mail">${esc(issuer.email)}</div>
      </td>
      <td class="meta">Data:&nbsp;&nbsp;${esc(date)}<span>Pag.&nbsp;&nbsp;${page}</span></td>
    </tr>
  </table>
  ${withTitle ? '<div class="titlebar">ORÇAMENTO</div>' : ''}`;
}

const CSS = `
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body { font-family: Arial, Helvetica, sans-serif; font-size: 11px; color: #000; }
  .sheet { page-break-after: always; }
  .sheet:last-child { page-break-after: auto; }
  .page { position: relative; }
  .watermark { position: absolute; top: 42%; left: 8%; font-size: 64px; color: rgba(180,0,0,.22); font-weight: 700; letter-spacing: 8px; transform: rotate(-18deg); }
  table.head { width: 100%; border: 1px solid #000; border-collapse: collapse; }
  table.head td { vertical-align: top; padding: 6px 8px 4px; }
  .logo-cell { width: 78px; padding-right: 0; }
  .logo { width: 64px; height: 58px; display: block; }
  .razao { font-size: 15px; font-weight: 700; letter-spacing: 0.3px; margin-bottom: 1px; }
  .issuer { font-size: 11px; font-weight: 700; line-height: 1.35; }
  .issuer .mail { font-weight: 400; }
  .meta { width: 250px; text-align: right; font-weight: 400; font-size: 11px; padding-top: 10px; white-space: nowrap; }
  .meta span { margin-left: 28px; }
  .titlebar { border: 1px solid #000; border-top: none; text-align: center; font-weight: 700; letter-spacing: 3px; font-size: 13px; padding: 2px 0 3px; }
  .intro { margin: 8px 2px 6px; font-size: 11px; }
  table.client { width: 100%; border: 1px solid #000; border-collapse: collapse; }
  table.client > tbody > tr > td { padding: 3px 6px; vertical-align: top; font-size: 11px; }
  table.client > tbody > tr.band > td { border-bottom: 1px solid #000; }
  .lbl { font-weight: 700; white-space: nowrap; width: 1%; }
  table.addr { width: 100%; border-collapse: collapse; }
  table.addr td { padding: 1px 16px 1px 0; border: none; }
  table.addr .street { width: 46%; }
  table.addr .num { width: 14%; }
  table.items { width: 100%; border-collapse: collapse; margin-top: 12px; }
  table.items th { border-top: 1px solid #000; border-bottom: 1px solid #000; font-size: 11px; font-weight: 700; text-align: left; padding: 3px 4px; }
  table.items td { padding: 2px 4px 1px; font-size: 11px; vertical-align: top; }
  table.items .r, table.foot .r { text-align: right; white-space: nowrap; }
  table.items .c { text-align: center; }
  .desc { width: 36%; }
  table.foot { width: 100%; border-collapse: collapse; margin-top: 16px; table-layout: fixed; }
  table.foot td { font-size: 11px; padding: 3px 4px; vertical-align: baseline; }
  table.foot td:nth-child(1) { width: 36%; }
  table.foot td:nth-child(2) { width: 40%; }
  table.foot td:nth-child(3) { width: 24%; }
  table.foot .lbl { padding-right: 8px; }
  .obs { padding-top: 8px; }
  .close { margin-top: 36px; font-size: 12px; }
  .rule { margin: 8px 0 10px; border-top: 1px solid #000; width: 360px; }
  .contacts { line-height: 1.45; }
`;

export function buildQuoteHtml(quote: QuotePdfView, issuer: QuoteIssuer): string {
  const numberLabel = formatQuoteNumber(quote.number);
  const date = isoToBr(quote.issuedAt);
  const cancelled = quote.status === 'cancelled';
  const rows = quote.items
    .map((item) => {
      const discount = item.discount === '0.00' || item.discount === '0' ? '' : fmtBr(item.discount);
      return `<tr>
        <td class="c">${String(item.lineNumber).padStart(3, '0')}</td>
        <td>${esc(item.code)}</td>
        <td class="desc">${esc(item.description)}</td>
        <td>${esc(item.rvs)}</td>
        <td>${esc(item.ncm)}</td>
        <td class="c">${esc(item.unit || 'UN')}</td>
        <td class="r">${esc(fmtQty(item.quantity))}</td>
        <td class="r">${esc(fmtBr(item.unitPrice))}</td>
        <td class="r">${esc(discount)}</td>
        <td class="r">${esc(fmtBr(item.lineTotal))}</td>
      </tr>`;
    })
    .join('');
  const contacts = QUOTE_CLOSING_CONTACTS
    .map((c) => `${esc(c.name)} - ${esc(c.email)}`)
    .join('<br>');
  const zip = quote.customerZip ? fmtCep(quote.customerZip) : '';

  const body = `<p class="intro">Segue abaixo os itens solicitados para orçamento:</p>
  <table class="client">
    <tr class="band">
      <td class="lbl">No. :</td><td>${esc(numberLabel)}</td>
      <td class="lbl">Data:</td><td>${esc(date)}</td>
      <td class="lbl">Cliente:</td><td>${esc(quote.customerName)}</td>
      <td class="lbl">Cód.:</td><td>${esc(quote.customerCode)}</td>
    </tr>
    <tr class="band">
      <td class="lbl">Endereço:</td>
      <td colspan="7">
        <table class="addr">
          <tr>
            <td class="street">${esc(quote.customerStreet)}</td>
            <td class="num">${esc(quote.customerNumber)}</td>
            <td>${esc(quote.customerDistrict)}</td>
          </tr>
          <tr>
            <td>${esc(quote.customerCity)}</td>
            <td>${esc(quote.customerState)}</td>
            <td>${esc(zip)}</td>
          </tr>
        </table>
      </td>
    </tr>
    <tr>
      <td class="lbl">CNPJ.:</td><td>${esc(fmtCnpj(quote.customerCnpj))}</td>
      <td class="lbl">Inscr. Est.:</td><td>${esc(quote.customerIe)}</td>
      <td></td><td></td>
      <td class="lbl">Vendedor:</td><td>${esc(quote.salesperson)}</td>
    </tr>
  </table>
  <table class="items">
    <thead>
      <tr>
        <th>Ítem</th><th>Código</th><th class="desc">Descrição</th><th>R.V.S.</th><th>NCM</th>
        <th class="c">Un.</th><th class="r">Qtde.</th><th class="r">Pr. Un.</th><th class="r">Desc.</th><th class="r">Total</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
  <table class="foot">
    <tr>
      <td><span class="lbl">Forma de Pag.:</span> ${esc(quote.paymentTerms)}</td>
      <td>&nbsp;</td>
      <td class="r"><span class="lbl">Sub-Total:</span> ${esc(fmtBr(quote.subtotal))}</td>
    </tr>
    <tr>
      <td>&nbsp;</td>
      <td><span class="lbl">Paciente :</span> ${esc(quote.patientName)}</td>
      <td class="r"><span class="lbl">Frete:</span> ${esc(fmtBr(quote.freight))}</td>
    </tr>
    <tr>
      <td><span class="lbl">Médico :</span> ${esc(quote.doctorName)}</td>
      <td><span class="lbl">Convênio :</span> ${esc(quote.convenio)}</td>
      <td class="r"><span class="lbl">Total:</span> ${esc(fmtBr(quote.total))}</td>
    </tr>
    <tr>
      <td>&nbsp;</td>
      <td><span class="lbl">Local:</span> ${esc(quote.local)}</td>
      <td>&nbsp;</td>
    </tr>
    <tr>
      <td class="obs" colspan="3"><span class="lbl">Obs:</span> ${esc(quote.notes)}</td>
    </tr>
  </table>`;

  const closing = `<div class="close">Atenciosamente,</div>
  <div class="rule"></div>
  <div class="contacts">${contacts}</div>`;

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8"/>
<title>Orçamento ${esc(numberLabel)}</title>
<style>${CSS}</style>
</head>
<body>
<section class="sheet">
  <div class="page">
    ${cancelled ? '<div class="watermark">CANCELADO</div>' : ''}
    ${header(issuer, date, 1, true)}
    ${body}
  </div>
</section>
<section class="sheet">
  ${header(issuer, date, 2, false)}
  ${closing}
</section>
</body>
</html>`;
}

export const QUOTE_PDF_OPTIONS = {
  format: 'A4' as const,
  landscape: true,
  printBackground: true,
  margin: { top: '8mm', right: '8mm', bottom: '10mm', left: '8mm' },
};
