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
  const addressTop = [quote.customerStreet, quote.customerNumber, quote.customerDistrict]
    .filter((part) => part && part.trim())
    .map((part) => esc(part))
    .join('&nbsp;&nbsp;&nbsp;');
  const addressBottom = [quote.customerCity, quote.customerState, quote.customerZip ? fmtCep(quote.customerZip) : '']
    .filter((part) => part && String(part).trim())
    .map((part) => esc(part))
    .join('&nbsp;&nbsp;&nbsp;');

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8"/>
<title>Orçamento ${esc(numberLabel)}</title>
<style>
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body { font-family: Arial, Helvetica, sans-serif; font-size: 10px; color: #111; }
  .page { position: relative; padding: 6px 8px 10px; }
  .watermark { position: absolute; top: 38%; left: 12%; font-size: 72px; color: rgba(180,0,0,.22); font-weight: 700; letter-spacing: 10px; transform: rotate(-18deg); }
  table.issuer { width: 100%; border-collapse: collapse; }
  table.issuer td { font-size: 11px; font-weight: 700; line-height: 1.35; text-align: center; padding: 0; }
  table.issuer .meta { width: 34%; text-align: right; font-weight: 400; font-size: 10px; vertical-align: top; padding-top: 14px; }
  table.issuer .meta span { margin-left: 28px; }
  .title { text-align: center; font-size: 18px; font-weight: 700; letter-spacing: 6px; margin: 18px 0 12px; }
  .intro { margin: 0 0 12px; font-size: 11px; }
  table.box, table.items, table.foot { width: 100%; border-collapse: collapse; }
  table.box td { padding: 3px 8px 3px 0; vertical-align: top; font-size: 11px; }
  .lbl { font-weight: 700; white-space: nowrap; padding-right: 10px; }
  .addr2 { padding-left: 78px; }
  table.items { margin-top: 14px; }
  table.items th { border-top: 1px solid #000; border-bottom: 1px solid #000; font-size: 10px; font-weight: 700; text-align: left; padding: 4px 6px; }
  table.items td { padding: 5px 6px 2px; font-size: 10px; vertical-align: top; }
  table.items .c { text-align: center; }
  table.items .r { text-align: right; white-space: nowrap; }
  table.items .desc { width: 36%; }
  table.foot { margin-top: 8px; }
  table.foot td { vertical-align: top; font-size: 11px; padding: 2px 0; }
  table.totals { width: 100%; }
  table.totals td { padding: 2px 0 2px 12px; font-size: 11px; }
  table.totals .r { text-align: right; font-weight: 700; white-space: nowrap; width: 110px; }
  .obs { margin-top: 10px; font-size: 11px; }
  .sign { margin-top: 14px; font-size: 11px; }
  .rule { margin-top: 10px; border-top: 1px solid #000; width: 280px; }
  .contacts { margin-top: 6px; line-height: 1.5; font-size: 11px; }
</style>
</head>
<body>
<div class="page">
  ${cancelled ? '<div class="watermark">CANCELADO</div>' : ''}
  <table class="issuer">
    <tr><td colspan="2">${esc(issuer.razaoSocial)}</td></tr>
    <tr>
      <td>CNPJ: ${esc(fmtCnpj(issuer.cnpj))} - Insc. Estadual: ${esc(issuer.ie)}</td>
      <td class="meta">Data: ${esc(date)}<span>Pag. ${page}</span></td>
    </tr>
    <tr><td colspan="2">${esc(issuer.addressLine)}</td></tr>
    <tr><td colspan="2">Fone: ${esc(fmtFone(issuer.phone))}</td></tr>
    <tr><td colspan="2">${esc(issuer.email)}</td></tr>
  </table>
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
      <td colspan="7">${addressTop}</td>
    </tr>
    <tr>
      <td></td>
      <td class="addr2" colspan="7">${addressBottom}</td>
    </tr>
    <tr>
      <td class="lbl">CNPJ.:</td><td>${esc(fmtCnpj(quote.customerCnpj))}</td>
      <td class="lbl">Inscr. Est.:</td><td>${esc(quote.customerIe)}</td>
      <td class="lbl">Vendedor:</td><td colspan="3">${esc(quote.salesperson) || '—'}</td>
    </tr>
  </table>
  <table class="items">
    <thead>
      <tr>
        <th>Ítem</th><th>Código</th><th class="desc">Descrição</th><th>R.V.S.</th><th>NCM</th>
        <th>Un.</th><th class="r">Qtde.</th><th class="r">Pr. Un.</th><th class="r">Desc.</th><th class="r">Total</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
  <table class="foot">
    <tr>
      <td>
        <div><span class="lbl">Médico :</span> ${esc(quote.doctorName) || '—'}</div>
        <div><span class="lbl">Paciente :</span> ${esc(quote.patientName) || '—'}</div>
        <div><span class="lbl">Convênio :</span> ${esc(quote.convenio) || '—'}</div>
        <div><span class="lbl">Local:</span> ${esc(quote.local) || '—'}</div>
      </td>
      <td style="width:280px">
        <table class="totals">
          <tr><td>Sub-Total:</td><td class="r">${esc(fmtBr(quote.subtotal))}</td></tr>
          <tr><td>Frete:</td><td class="r">${esc(fmtBr(quote.freight))}</td></tr>
          <tr><td>Total:</td><td class="r">${esc(fmtBr(quote.total))}</td></tr>
        </table>
      </td>
    </tr>
  </table>
  <div class="obs"><span class="lbl">Obs:</span> ${esc(quote.notes)}</div>
  <div class="sign">Atenciosamente,</div>
  <div class="rule"></div>
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
