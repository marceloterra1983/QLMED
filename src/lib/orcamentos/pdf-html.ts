import { esc, fmtCep, fmtCnpj, fmtFone } from '@/lib/pdf/pdf-utils';
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

export function buildQuoteHtml(quote: QuotePdfView, issuer: QuoteIssuer, page = 1): string {
  const numberLabel = formatQuoteNumber(quote.number);
  const date = isoToBr(quote.issuedAt);
  const cancelled = quote.status === 'cancelled';
  const rows = quote.items
    .map((item) => {
      const discount = item.discount === '0.00' || item.discount === '0' ? '' : fmtBr(item.discount);
      return `<tr>
        <td class="c">${String(item.lineNumber).padStart(3, '0')}</td>
        <td>${esc(item.code)}</td>
        <td>${esc(item.description)}</td>
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

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8"/>
<title>Orçamento ${esc(numberLabel)}</title>
<style>
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body { font-family: Arial, Helvetica, sans-serif; font-size: 10px; color: #111; }
  .page { position: relative; padding: 8px 10px; }
  .watermark { position: absolute; top: 42%; left: 18%; font-size: 64px; color: rgba(180,0,0,.28); font-weight: 700; letter-spacing: 8px; transform: rotate(-18deg); }
  .head { display: table; width: 100%; }
  .head-left, .head-right { display: table-cell; vertical-align: top; }
  .head-left { width: 62%; font-size: 11px; font-weight: 700; line-height: 1.35; text-align: center; }
  .head-right { width: 38%; text-align: right; font-size: 10px; padding-top: 4px; }
  .meta span { display: inline-block; margin-left: 18px; }
  .title { text-align: center; font-size: 16px; font-weight: 700; letter-spacing: 2px; margin: 14px 0 8px; }
  .intro { margin: 0 0 10px; }
  table.box, table.items { width: 100%; border-collapse: collapse; }
  table.box td { padding: 2px 4px; vertical-align: top; }
  .lbl { font-weight: 700; padding-right: 6px; white-space: nowrap; }
  table.items { margin-top: 10px; }
  table.items th { border-top: 1px solid #000; border-bottom: 1px solid #000; font-size: 9px; text-align: left; padding: 3px 4px; }
  table.items td { padding: 3px 4px; font-size: 9px; vertical-align: top; }
  table.items .c { text-align: center; }
  table.items .r { text-align: right; }
  .totals { width: 280px; margin-left: auto; margin-top: 8px; }
  .totals td { padding: 2px 4px; }
  .totals .r { text-align: right; font-weight: 700; }
  .clinical { margin-top: 12px; width: 100%; }
  .clinical td { padding: 2px 6px 2px 0; vertical-align: top; }
  .obs { margin-top: 8px; }
  .sign { margin-top: 16px; }
  .contacts { margin-top: 8px; line-height: 1.45; }
</style>
</head>
<body>
<div class="page">
  ${cancelled ? '<div class="watermark">CANCELADO</div>' : ''}
  <div class="head">
    <div class="head-left">
      ${esc(issuer.razaoSocial)}<br>
      CNPJ: ${esc(fmtCnpj(issuer.cnpj))} - Insc. Estadual: ${esc(issuer.ie)}<br>
      ${esc(issuer.addressLine)}<br>
      Fone: ${esc(fmtFone(issuer.phone))}<br>
      ${esc(issuer.email)}
    </div>
    <div class="head-right">
      <div class="meta">Data: ${esc(date)} <span>Pag. ${page}</span></div>
    </div>
  </div>
  <div class="title">ORÇAMENTO</div>
  <p class="intro">Segue abaixo os itens solicitados para orçamento:</p>
  <table class="box">
    <tr>
      <td class="lbl">No. :</td><td>${esc(numberLabel)}</td>
      <td class="lbl">Data:</td><td>${esc(date)}</td>
      <td class="lbl">Cliente:</td><td>${esc(quote.customerName)}</td>
      <td class="lbl">Cód.:</td><td>${esc(quote.customerCode)}</td>
    </tr>
    <tr>
      <td class="lbl">Endereço:</td>
      <td colspan="7">${esc(quote.customerStreet)} ${esc(quote.customerNumber)} ${esc(quote.customerDistrict)}
        ${esc(quote.customerCity)} ${esc(quote.customerState)} ${esc(fmtCep(quote.customerZip || ''))}</td>
    </tr>
    <tr>
      <td class="lbl">CNPJ.:</td><td>${esc(fmtCnpj(quote.customerCnpj))}</td>
      <td class="lbl">Inscr. Est.:</td><td>${esc(quote.customerIe)}</td>
      <td class="lbl">Vendedor:</td><td colspan="3">${esc(quote.salesperson) || '____'}</td>
    </tr>
  </table>
  <table class="items">
    <thead>
      <tr>
        <th>Ítem</th><th>Código</th><th>Descrição</th><th>R.V.S.</th><th>NCM</th>
        <th>Un.</th><th>Qtde.</th><th>Pr. Un.</th><th>Desc.</th><th>Total</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
  <table class="totals">
    <tr><td>Sub-Total:</td><td class="r">${esc(fmtBr(quote.subtotal))}</td></tr>
    <tr><td>Frete:</td><td class="r">${esc(fmtBr(quote.freight))}</td></tr>
    <tr><td>Total:</td><td class="r">${esc(fmtBr(quote.total))}</td></tr>
  </table>
  <table class="clinical">
    <tr>
      <td class="lbl">Médico :</td><td>${esc(quote.doctorName)}</td>
      <td class="lbl">Paciente :</td><td>${esc(quote.patientName)}</td>
    </tr>
    <tr>
      <td></td><td></td>
      <td class="lbl">Convênio :</td><td>${esc(quote.convenio)}</td>
    </tr>
    <tr>
      <td class="lbl">Local:</td><td colspan="3">${esc(quote.local)}</td>
    </tr>
  </table>
  <div class="obs"><span class="lbl">Obs:</span> ${esc(quote.notes)}</div>
  <div class="sign">Atenciosamente,</div>
  <div class="contacts">${contacts}</div>
</div>
</body>
</html>`;
}

export const QUOTE_PDF_OPTIONS = {
  format: 'A4' as const,
  landscape: true,
  printBackground: true,
  margin: { top: '8mm', right: '8mm', bottom: '10mm', left: '8mm' },
};
