import { UNIMED_CG_ORDEM_COMPRA_SUBJECT_RE, type UnimedCgParseStatus } from './constants';

export type ParsedUnimedCgPurchaseOrderItem = {
  productCode: string | null;
  description: string;
  unit: string | null;
  quantity: string;
  unitPrice: string;
  lineTotal: string;
};

export type ParsedUnimedCgPurchaseOrder = {
  orderNumber: string;
  requestNumber: string | null;
  orderDate: Date | null;
  billingCnpj: string | null;
  buyerName: string | null;
  paymentTerms: string | null;
  paymentTermsCode: string | null;
  deliveryFrom: Date | null;
  deliveryTo: Date | null;
  supplierName: string | null;
  supplierCnpj: string | null;
  totalAmount: string;
  items: ParsedUnimedCgPurchaseOrderItem[];
  parseStatus: UnimedCgParseStatus;
};

const ITEM_UNITS = 'UNIDADE|CX|CAIXA|KIT|PC|P[CÇ]|FRASCO|AMPOLA|PAR|PCT';

export function isUnimedCgPurchaseOrderSubject(subject: string): boolean {
  return UNIMED_CG_ORDEM_COMPRA_SUBJECT_RE.test(subject);
}

export function extractOrderNumberFromSubject(subject: string): string | null {
  return /ordem\s+de\s+compras?\s+(\d+)/i.exec(subject)?.[1] ?? null;
}

export function buildPurchaseOrderFileName(orderNumber: string): string {
  const safe = orderNumber.replace(/[^\d]/g, '') || '0';
  return `UNIMED-CG-OC ${safe}.pdf`;
}

export function digitsOnly(value: string | null | undefined): string | null {
  const digits = (value ?? '').replace(/\D/g, '');
  return digits || null;
}

/** Converte "2.100,00" / "50,0000" em string decimal canônica. Sem float. */
export function parseSoulMvNumber(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const cleaned = raw.trim().replace(/\s/g, '');
  const match = /^(\d{1,3}(?:\.\d{3})*|\d+),(\d+)$/.exec(cleaned);
  if (!match) return null;
  const whole = match[1].replace(/\./g, '');
  const frac = match[2];
  if (!/^\d+$/.test(whole) || !/^\d+$/.test(frac)) return null;
  return `${whole}.${frac}`;
}

function labeled(text: string, re: RegExp): string | null {
  const match = re.exec(text);
  const value = match?.[1]?.replace(/\s+/g, ' ').trim();
  return value || null;
}

function parseBrDate(raw: string | null): Date | null {
  if (!raw) return null;
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(raw.trim());
  if (!match) return null;
  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year
    || date.getUTCMonth() !== month - 1
    || date.getUTCDate() !== day
  ) {
    return null;
  }
  return date;
}

function money2(raw: string | null): string {
  const parsed = parseSoulMvNumber(raw);
  if (!parsed) return '0.00';
  const [whole, frac = ''] = parsed.split('.');
  return `${whole}.${(frac + '00').slice(0, 2)}`;
}

export function computePurchaseOrderParseStatus(input: {
  orderNumber: string | null;
  billingCnpj: string | null;
  paymentTerms: string | null;
  items: ParsedUnimedCgPurchaseOrderItem[];
}): UnimedCgParseStatus {
  if (!input.orderNumber) return 'falha';
  const hasItem = input.items.some(
    (item) => item.description.trim() && item.quantity && item.unitPrice && item.lineTotal,
  );
  const ok = Boolean(input.billingCnpj?.trim())
    && Boolean(input.paymentTerms?.trim())
    && hasItem;
  return ok ? 'ok' : 'parcial';
}

function parseItems(text: string): ParsedUnimedCgPurchaseOrderItem[] {
  const lines = text.split('\n');
  const headerIdx = lines.findIndex((line) => /Produto\b/.test(line) && /Vl\.?\s*Total/i.test(line));
  const start = headerIdx >= 0 ? headerIdx + 1 : 0;
  const items: ParsedUnimedCgPurchaseOrderItem[] = [];
  const unitRe = new RegExp(`\\b(${ITEM_UNITS})\\b`, 'i');
  const startRe = /^(\d+)\s*-\s*(.*)$/;

  let current: { code: string; desc: string[]; unit: string | null; quantity: string; unitPrice: string; lineTotal: string } | null = null;

  const flush = () => {
    if (!current) return;
    const description = current.desc.join(' ').replace(/\s+/g, ' ').trim();
    if (description) {
      items.push({
        productCode: current.code,
        description,
        unit: current.unit,
        quantity: current.quantity,
        unitPrice: current.unitPrice,
        lineTotal: current.lineTotal,
      });
    }
    current = null;
  };

  for (let i = start; i < lines.length; i += 1) {
    const line = lines[i] ?? '';
    if (/Total dos Produtos/i.test(line) || /Valor Total \(=\)/i.test(line)) {
      flush();
      break;
    }
    if (/^\s*Detalhamento:/i.test(line) || /^\s*COMPRADOR\b/i.test(line)) {
      continue;
    }

    const started = startRe.exec(line.trim());
    if (started) {
      flush();
      const rest = started[2] ?? '';
      const unitMatch = unitRe.exec(rest);
      const afterUnit = unitMatch ? rest.slice((unitMatch.index ?? 0) + unitMatch[0].length) : rest;
      const nums = [...afterUnit.matchAll(/(\d{1,3}(?:\.\d{3})+|\d+),(\d+)/g)].map((m) => `${m[1]},${m[2]}`);
      const qty = parseSoulMvNumber(nums[0]) ?? '0';
      const unitPrice = money2(nums[1] ?? null);
      const lineTotal = money2(nums.length ? nums[nums.length - 1] : null);
      const descHead = unitMatch ? rest.slice(0, unitMatch.index).trim() : rest.trim();
      current = {
        code: started[1],
        desc: descHead ? [descHead] : [],
        unit: unitMatch?.[1]?.toUpperCase() ?? null,
        quantity: qty,
        unitPrice,
        lineTotal,
      };
      continue;
    }

    if (current) {
      const extra = line.trim();
      if (extra && !/^(Fabricante|Lote|Qt\.|Unidade)\b/i.test(extra)) {
        current.desc.push(extra);
      }
    }
  }
  flush();
  return items;
}

export function parsePurchaseOrderText(
  text: string,
  subjectOrderNumber: string | null = null,
): ParsedUnimedCgPurchaseOrder {
  const orderFromPdf = labeled(text, /Ord\.\s*Compra:\s*(\d+)/i);
  const orderNumber = orderFromPdf || subjectOrderNumber || '';
  const requestNumber = labeled(text, /Solicita[cç][aã]o:\s*(\d+)/i);
  const orderDate = parseBrDate(labeled(text, /Dt\s*Ord\.\s*Compra:\s*(\d{2}\/\d{2}\/\d{4})/i));
  const buyerName = labeled(text, /Comprador:\s*([^\n]+)/i);
  const billingCnpj = digitsOnly(
    labeled(text, /Comprador:[\s\S]{0,400}?CNPJ:\s*([\d./-]+)/i),
  );
  const supplierCnpj = digitsOnly(labeled(text, /CNPJ\/CPF:\s*([\d./-]+)/i));
  const supplierName = labeled(
    text,
    /Fornecedor:\s*\d*\s*([^\n]*QL MED[^\n]*)/i,
  ) || labeled(text, /Fornecedor:\s*[^\n-]*-\s*([^\n]+)/i);
  const paymentTerms = labeled(text, /Desc\.\s*Condi[cç][aã]o\s+de\s+Pgto\.:\s*([^\n]+)/i);
  const paymentTermsCode = labeled(text, /C[oó]d\.\s*Condi[cç][aã]o\s+de\s+Pgto\.:\s*(\d+)/i);
  const deliveryMatch = /(\d{2}\/\d{2}\/\d{4})\s*[àa]\s*(\d{2}\/\d{2}\/\d{4})/i.exec(text);
  const deliveryFrom = parseBrDate(deliveryMatch?.[1] ?? null);
  const deliveryTo = parseBrDate(deliveryMatch?.[2] ?? null);

  const items = parseItems(text);
  const totalRaw = labeled(text, /Valor Total\s*\(=\)\s*:\s*([\d.]+,[\d]+)/i)
    || items[0]?.lineTotal
    || null;
  const totalAmount = money2(totalRaw);

  const parsed = {
    orderNumber,
    requestNumber,
    orderDate,
    billingCnpj,
    buyerName: buyerName?.replace(/\s+/g, ' ').trim() || null,
    paymentTerms: paymentTerms?.replace(/\s+/g, ' ').trim() || null,
    paymentTermsCode,
    deliveryFrom,
    deliveryTo,
    supplierName: supplierName?.replace(/\s+/g, ' ').replace(/^\d+\s*/, '').trim() || null,
    supplierCnpj,
    totalAmount,
    items,
  };

  return {
    ...parsed,
    parseStatus: computePurchaseOrderParseStatus(parsed),
  };
}
