/** Interpreta texto (pdftotext -layout) de orçamento SPICA H020 ou do modelo simples. */

export type ParsedQuoteItem = {
  lineNumber: number;
  code: string;
  description: string;
  manufacturer: string | null;
  rvs: string | null;
  ncm: string | null;
  unit: string | null;
  quantity: string;
  unitPrice: string;
  discount: string;
  lineTotal: string;
};

export type ParsedQuote = {
  layout: 'h020' | 'simples';
  number: number | null;
  numberLabel: string | null;
  issuedAt: string | null;
  customerName: string | null;
  customerCnpj: string | null;
  customerIe: string | null;
  customerCode: string | null;
  salesperson: string | null;
  patientName: string | null;
  doctorName: string | null;
  convenio: string | null;
  local: string | null;
  notes: string | null;
  freight: string;
  subtotal: string;
  total: string;
  items: ParsedQuoteItem[];
  warnings: string[];
};

const MONEY_RE = /\d{1,3}(?:\.\d{3})*,\d{2}/;

export function parseBrMoney(token: string): string | null {
  const t = token.trim();
  if (!MONEY_RE.test(t) || t.replace(MONEY_RE, '') !== '') return null;
  return t.replace(/\./g, '').replace(',', '.');
}

export function parseBrDate(token: string): string | null {
  const m = token.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;
  return `${m[3]}-${m[2]}-${m[1]}`;
}

function digits(value: string | null | undefined): string {
  return (value || '').replace(/\D/g, '');
}

function collapseSpace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function fieldAfter(text: string, label: RegExp): string | null {
  const m = text.match(label);
  if (!m) return null;
  const raw = collapseSpace(m[1] || '');
  if (!raw || /^_+$/.test(raw)) return null;
  return raw;
}

const QL_MED_CNPJ = '07832309000197';

function lastMoneyLabeled(text: string, label: string): string | null {
  const re = new RegExp(`${label}\\s*:\\s*(${MONEY_RE.source})`, 'gi');
  let last: string | null = null;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    last = parseBrMoney(m[1]);
  }
  return last;
}

function moneyLabeled(text: string, ...labels: string[]): string {
  for (const label of labels) {
    const value = lastMoneyLabeled(text, label);
    if (value) return value;
  }
  return '0.00';
}

function customerCnpjFrom(text: string): string | null {
  const found = [...text.matchAll(/CNPJ\.?:\s*([\d./-]+)/gi)].map((m) => digits(m[1]));
  return found.find((cnpj) => cnpj.length >= 11 && cnpj !== QL_MED_CNPJ) || null;
}

function isQuoteDocument(text: string): boolean {
  return /OR[CÇ]AMENTO/i.test(text);
}

function parseH020Items(text: string, warnings: string[]): ParsedQuoteItem[] {
  const hasNcm = /\bNCM\b/.test(text);
  const lines = text.split('\n');
  const items: ParsedQuoteItem[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const start = line.match(/^\s*(\d{3})\s+(\S+(?:\s+\d)?)\s+(.+)$/);
    if (!start) continue;
    if (/^No\./i.test(line.trim()) || /Cliente:/i.test(line)) continue;
    let rest = start[3];
    const next = lines[i + 1] || '';
    if (next && !/^\s*\d{3}\s/.test(next) && !/Sub-Total|Frete|Total:|Obs:|Atenciosamente|Forma de Pag/i.test(next) && next.trim()) {
      const extra = next.trim();
      if (!MONEY_RE.test(extra) && extra.length < 80) {
        rest = `${rest} ${extra}`;
      }
    }
    const tokens = collapseSpace(rest).split(' ');
    const moneys: string[] = [];
    while (tokens.length && parseBrMoney(tokens[tokens.length - 1])) {
      moneys.unshift(parseBrMoney(tokens.pop() as string) as string);
    }
    if (moneys.length < 2) {
      warnings.push(`linha ${start[1]} sem preços`);
      continue;
    }
    const lineTotal = moneys[moneys.length - 1];
    const unitPrice = moneys.length === 2 ? moneys[0] : moneys[moneys.length - 3] || moneys[0];
    const discount = moneys.length >= 3 ? moneys[moneys.length - 2] : '0.00';
    const qtyTok = tokens.pop();
    const unitTok = tokens.pop();
    let ncm: string | null = null;
    let rvs: string | null = null;
    if (hasNcm && tokens.length && /^\d{8}$/.test(tokens[tokens.length - 1] || '')) {
      ncm = tokens.pop() || null;
    }
    if (tokens.length && /^\d{8,14}$/.test(tokens[tokens.length - 1] || '')) {
      rvs = tokens.pop() || null;
    }
    let manufacturer: string | null = null;
    if (!hasNcm && tokens.length >= 2) {
      const maybeMfr = tokens[tokens.length - 1];
      if (maybeMfr && !/^\d+$/.test(maybeMfr) && maybeMfr.length <= 24) {
        manufacturer = tokens.pop() || null;
      }
    }
    const description = collapseSpace(tokens.join(' '));
    items.push({
      lineNumber: Number.parseInt(start[1], 10),
      code: collapseSpace(start[2]),
      description,
      manufacturer,
      rvs,
      ncm,
      unit: unitTok || null,
      quantity: qtyTok || '1',
      unitPrice,
      discount,
      lineTotal,
    });
  }
  return items;
}

function parseH020(text: string): ParsedQuote {
  const warnings: string[] = [];
  const header = text.match(
    /No\.\s*:\s*(\d+)\s+Data:\s+(\d{2}\/\d{2}\/\d{4})\s+Cliente:\s+(.+?)\s+C[oó]d\.:\s+(\S+)/,
  );
  const number = header ? Number.parseInt(header[1], 10) : null;
  const issuedAt = header ? parseBrDate(header[2]) : parseBrDate(fieldAfter(text, /Data:\s+(\d{2}\/\d{2}\/\d{4})/) || '');
  const customerName = header ? collapseSpace(header[3]) : fieldAfter(text, /Cliente:\s+(.+?)(?:\s+C[oó]d|$)/);
  const customerCode = header && header[4] !== '____' ? header[4] : null;
  const cnpjRaw = customerCnpjFrom(text);
  const ie = fieldAfter(text, /Inscr\.\s*Est\.:\s+(\S+)/);
  const salesperson = fieldAfter(text, /Vendedor:\s+(\S.*?)(?:\n|$)/);
  const patientName =
    fieldAfter(text, /Paciente\s*:\s+(.+?)(?:\n|$)/) ||
    fieldAfter(text, /PACIENTE:\s+(.+?)(?:\n|$)/);
  const doctorName = fieldAfter(text, /M[eé]dico\s*:\s+(.+?)(?:\s{2,}Conv[eê]nio|\n|$)/);
  const convenio = fieldAfter(text, /Conv[eê]nio\s*:\s+(.+?)(?:\s{2,}Total:|\n|$)/);
  const local = fieldAfter(text, /Local:\s+(.+?)(?:\n|$)/);
  const notes = fieldAfter(text, /Obs:\s+(.+?)(?:\n\s*Atenciosamente|\n\s*$)/);
  const items = parseH020Items(text, warnings);
  if (!header) warnings.push('cabeçalho H020 incompleto');
  if (items.length === 0) warnings.push('nenhum item H020');
  return {
    layout: 'h020',
    number: number && number > 0 ? number : null,
    numberLabel: number && number > 0 ? String(number).padStart(8, '0') : null,
    issuedAt,
    customerName,
    customerCnpj: digits(cnpjRaw) || null,
    customerIe: ie,
    customerCode,
    salesperson: salesperson && !/^_+$/.test(salesperson) ? salesperson : null,
    patientName,
    doctorName,
    convenio,
    local,
    notes,
    freight: lastMoneyLabeled(text, 'Frete') || '0.00',
    subtotal: lastMoneyLabeled(text, 'Sub-Total') || '0.00',
    total: lastMoneyLabeled(text, 'Total') || '0.00',
    items,
    warnings,
  };
}

function parseSimplesItems(text: string, warnings: string[]): ParsedQuoteItem[] {
  const items: ParsedQuoteItem[] = [];
  const lines = text.split('\n');
  let lineNumber = 0;
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || /^(Cliente|CNPJ|Endereço|Código|Forma|OBSERVAÇÕES|Atenciosamente|DATA|ORÇAMENTO)/i.test(trimmed)) {
      continue;
    }
    const tokens = collapseSpace(trimmed).split(' ');
    if (tokens.length < 5) continue;
    const total = parseBrMoney(tokens[tokens.length - 1] || '');
    const unitPrice = parseBrMoney(tokens[tokens.length - 2] || '');
    const qty = tokens[tokens.length - 3];
    if (!total || !unitPrice || !/^\d+(?:[.,]\d+)?$/.test(qty || '')) continue;
    const rvsTok = tokens[tokens.length - 4];
    const rvs = rvsTok && /^\d{8,14}$/.test(rvsTok) ? rvsTok : null;
    const body = tokens.slice(1, rvs ? -4 : -3);
    let manufacturer: string | null = null;
    if (body.length >= 2 && body[body.length - 1] && !/^\d/.test(body[body.length - 1])) {
      manufacturer = body.pop() || null;
    }
    lineNumber += 1;
    items.push({
      lineNumber,
      code: tokens[0],
      description: collapseSpace(body.join(' ')),
      manufacturer,
      rvs,
      ncm: null,
      unit: 'UN',
      quantity: qty.replace(',', '.'),
      unitPrice,
      discount: '0.00',
      lineTotal: total,
    });
  }
  if (items.length === 0) warnings.push('nenhum item simples');
  return items;
}

function parseSimples(text: string): ParsedQuote {
  const warnings: string[] = [];
  const issuedAt = parseBrDate(fieldAfter(text, /DATA:\s+(\d{2}\/\d{2}\/\d{4})/) || '');
  const customerName = fieldAfter(text, /Cliente:\s+(.+)/);
  const cnpjRaw = customerCnpjFrom(text);
  const patientName = fieldAfter(text, /PACIENTE:\s+(.+)/);
  const notes = fieldAfter(text, /OBSERVA[CÇ][OÕ]ES:\s+(.+)/);
  const closing = [...text.matchAll(/([A-Za-zÀ-ú]+)\s+-\s+([a-z.]+@qlmed\.com\.br)/gi)].map((m) => m[1]);
  return {
    layout: 'simples',
    number: null,
    numberLabel: null,
    issuedAt,
    customerName,
    customerCnpj: digits(cnpjRaw) || null,
    customerIe: null,
    customerCode: null,
    salesperson: closing[0] || null,
    patientName,
    doctorName: null,
    convenio: null,
    local: null,
    notes,
    freight: '0.00',
    subtotal: moneyLabeled(text, 'Valor Total', 'Total'),
    total: moneyLabeled(text, 'Valor Total', 'Total'),
    items: parseSimplesItems(text, warnings),
    warnings,
  };
}

export function parseQuotePdfText(text: string): ParsedQuote | null {
  if (!isQuoteDocument(text)) return null;
  if (/H020_L_Orcamento|No\.\s*:/i.test(text)) return parseH020(text);
  return parseSimples(text);
}
