import { parseXmlSafeNoMerge } from '@/lib/safe-xml-parser';
import { gv } from '@/lib/xml-helpers';
import type { PdfInvoiceView, Party } from './pdf-types';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function parseXml(xml: string): Promise<any> {
  return parseXmlSafeNoMerge(xml);
}

export function esc(text: string | null | undefined): string {
  if (!text) return '';
  return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function fmtCnpj(v: string): string {
  const d = (v || '').replace(/\D/g, '');
  if (d.length === 14) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
  if (d.length === 11) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
  return v || '';
}

export function fmtCep(v: string): string {
  const d = (v || '').replace(/\D/g, '');
  if (d.length === 8) return `${d.slice(0, 5)}-${d.slice(5)}`;
  return v || '';
}

export function fmtFone(v: string): string {
  const d = (v || '').replace(/\D/g, '');
  if (d.length === 10) return `(${d.slice(0, 2)})${d.slice(2, 6)}-${d.slice(6)}`;
  if (d.length === 11) return `(${d.slice(0, 2)})${d.slice(2, 7)}-${d.slice(7)}`;
  return v || '';
}

export function fmtNum(v: string | number | null | undefined, dec: number = 2): string {
  const n = typeof v === 'number' ? v : parseFloat(String(v || '0'));
  if (isNaN(n)) return '0,' + '0'.repeat(dec);
  return n.toLocaleString('pt-BR', { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

export function fmtCurrency(v: string | number | null | undefined): string {
  return 'R$ ' + fmtNum(v, 2);
}

export function fmtKey(k: string): string {
  return (k || '').replace(/\D/g, '').replace(/(.{4})/g, '$1 ').trim();
}

export function fmtNfNum(n: string): string {
  const d = (n || '0').replace(/\D/g, '').padStart(9, '0');
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
}

export function fmtDate(v: string): string {
  if (!v) return '';
  try { return new Date(v).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' }); } catch { return v; }
}

export function fmtTime(v: string): string {
  if (!v) return '';
  try { return new Date(v).toLocaleTimeString('pt-BR'); } catch { return ''; }
}

export function fmtDateTime(v: string): string {
  return `${fmtDate(v)} ${fmtTime(v)}`.trim();
}

export function modFreteLabel(m: string): string {
  const map: Record<string, string> = {
    '0': 'FRETE POR CONTA DO EMITENTE',
    '1': 'FRETE POR CONTA DO DESTINATARIO',
    '2': 'FRETE POR CONTA DE TERCEIROS',
    '3': 'TRANSPORTE PROPRIO REMETENTE',
    '4': 'TRANSPORTE PROPRIO DESTINATARIO',
    '9': 'SEM FRETE',
  };
  return map[m] || '';
}

export function modFreteCode(m: string): string {
  const map: Record<string, string> = {
    '0': '0 - EMIT',
    '1': '1 - DEST/REM',
    '2': '2 - TERCEIROS',
    '3': '3 - REMETENTE',
    '4': '4 - DESTINATARIO',
    '9': '9 - SEM FRETE',
  };
  return map[m] || m || '';
}

export function getPdfFilename(invoice: PdfInvoiceView): string {
  if (invoice.type === 'CTE') {
    return `QLMED/${invoice.accessKey}-cte.pdf`;
  }

  const typeLabel: Record<string, string> = { NFE: 'NFe', CTE: 'CTe', NFSE: 'NFSe' };
  const tl = typeLabel[invoice.type] || invoice.type;
  return `DANFE_${tl}_${invoice.number}_${invoice.accessKey.slice(0, 12)}.pdf`;
}

export function hasParty(party: Party): boolean {
  return Boolean((party.nome || '').trim() || (party.cnpj || '').trim());
}

export function getParty(node: object): Party {
  return {
    nome: gv(node, 'xNome') || gv(node, 'xFant'),
    cnpj: gv(node, 'CNPJ') || gv(node, 'CPF'),
  };
}
