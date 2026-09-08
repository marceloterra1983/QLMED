import {
  computePurchaseOrderParseStatus,
  digitsOnly,
  parseSoulMvNumber,
  type ParsedUnimedCgPurchaseOrder,
  type ParsedUnimedCgPurchaseOrderItem,
} from './parse-purchase-order';

function labeled(text: string, re: RegExp): string | null {
  const match = re.exec(text);
  const value = match?.[1]?.replace(/\s+/g, ' ').trim();
  return value || null;
}

function parseBrDate(raw: string | null): Date | null {
  if (!raw) return null;
  const full = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(raw.trim());
  const short = /^(\d{2})\/(\d{2})\/(\d{2})$/.exec(raw.trim());
  const match = full ?? short;
  if (!match) return null;
  const day = Number(match[1]);
  const month = Number(match[2]);
  let year = Number(match[3]);
  if (!full && year < 100) year += 2000;
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

/** "R$ 56.000, 00" / "2.800,000000" / "42," → decimal canônico. Sem float. */
export function parseGtplanMoney(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const cleaned = raw.replace(/R\$/gi, '').replace(/\s/g, '');
  if (!cleaned) return null;
  const withFrac = /,\d+$/.test(cleaned) ? cleaned : `${cleaned.replace(/,$/, '')},00`;
  return parseSoulMvNumber(withFrac);
}

function money2(raw: string | null): string {
  const parsed = parseGtplanMoney(raw);
  if (!parsed) return '0.00';
  const [whole, frac = ''] = parsed.split('.');
  return `${whole}.${(frac + '00').slice(0, 2)}`;
}

export function isGtplanPurchaseOrderText(text: string): boolean {
  return /N[uú]mero da ordem:/i.test(text) || /sistema GTPlan/i.test(text);
}

function collectGtplanAmounts(block: string): string[] {
  const gluedIpi = block.replace(/\b0,(\s+)(\d{2})\b/g, '0,$2');
  const tokens = gluedIpi.split(/\s+/);
  const complete: string[] = [];
  const incomplete: string[] = [];
  const pads: string[] = [];
  for (const token of tokens) {
    const cleaned = token.replace(/R\$/gi, '');
    if (!cleaned) continue;
    if (/^\d{1,3}(?:\.\d{3})*,\d+$|^\d+,\d+$/.test(cleaned)) {
      complete.push(cleaned);
      continue;
    }
    if (/^\d{1,3}(?:\.\d{3})*,$|^\d+,$/.test(cleaned)) {
      incomplete.push(cleaned);
      continue;
    }
    if (/^0{4,}$/.test(cleaned)) {
      pads.push(cleaned);
    }
  }
  const amounts: string[] = [];
  for (const raw of complete) {
    amounts.push(money2(raw));
  }
  for (let i = 0; i < incomplete.length; i += 1) {
    amounts.push(money2(`${incomplete[i]}${pads[i] ?? '00'}`));
  }
  return amounts;
}

function parseGtplanItems(text: string): {
  items: ParsedUnimedCgPurchaseOrderItem[];
  deliveryTo: Date | null;
} {
  const lines = text.split('\n');
  const headerIdx = lines.findIndex((line) => /Desc\.\s*\(Marca\)/i.test(line) && /Qtd/i.test(line));
  const start = headerIdx >= 0 ? headerIdx + 1 : 0;
  const items: ParsedUnimedCgPurchaseOrderItem[] = [];
  let deliveryTo: Date | null = null;
  let i = start;
  while (i < lines.length) {
    const line = lines[i] ?? '';
    if (/Termos e Condi/i.test(line) || /Observa[cç]/i.test(line)) break;
    const started = /^(\d{3,})\s+(.+)$/.exec(line.trim());
    if (!started) {
      i += 1;
      continue;
    }
    const code = started[1];
    const chunk = [started[2]];
    i += 1;
    while (i < lines.length) {
      const next = lines[i] ?? '';
      if (/^\d{3,}\s+\S/.test(next.trim())) break;
      if (/Termos e Condi/i.test(next) || /Observa[cç]/i.test(next)) break;
      if (next.trim()) chunk.push(next.trim());
      i += 1;
    }
    const block = `${code} ${chunk.join(' ')}`;
    const qtyMatch = /\s(\d+)\s+UNIDAD/i.exec(block);
    const dateMatch = /(\d{2}\/\d{2}\/\d{2,4})/.exec(block);
    if (dateMatch && !deliveryTo) deliveryTo = parseBrDate(dateMatch[1]);
    const amounts = collectGtplanAmounts(block);
    const nonzero = amounts.filter((value) => value !== '0.00');
    const unitPrice = nonzero[0] ?? '0.00';
    const lineTotal = nonzero.length > 1 ? nonzero[nonzero.length - 1] : nonzero[0] ?? '0.00';
    const description = block
      .replace(/^\d{3,}\s+/, '')
      .replace(/\s+\d+\s+UNIDAD(?:E)?/i, ' ')
      .replace(/\bE\b/g, ' ')
      .replace(/R\$/gi, ' ')
      .replace(/\d{1,3}(?:\.\d{3})*,\d*/g, ' ')
      .replace(/\d+,\d*/g, ' ')
      .replace(/\d{1,3}(?:\.\d{3})*,/g, ' ')
      .replace(/\b\d{4,}\b/g, ' ')
      .replace(/\d{2}\/\d{2}\/\d{2,4}/g, ' ')
      .replace(/\b00\b/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (!description || !qtyMatch) continue;
    items.push({
      productCode: code,
      description,
      unit: 'UNIDADE',
      quantity: qtyMatch[1],
      unitPrice,
      lineTotal,
    });
  }
  return { items, deliveryTo };
}

export function parseGtplanPurchaseOrder(
  text: string,
  subjectOrderNumber: string | null = null,
): ParsedUnimedCgPurchaseOrder {
  const orderFromPdf = labeled(text, /N[uú]mero da ordem:\s*(\d+)/i);
  const orderNumber = orderFromPdf || subjectOrderNumber || '';
  const orderDate = parseBrDate(labeled(text, /Data Emiss[aã]o:\s*(\d{2}\/\d{2}\/\d{4})/i));
  const billingCnpj = digitsOnly(
    labeled(text, /Dados Faturamento[\s\S]{0,240}?CNPJ:\s*([\d./-]+)/i),
  );
  const supplierCnpj = digitsOnly(labeled(text, /Fornecedor:[\s\S]{0,80}?CNPJ:\s*([\d./-]+)/i));
  const supplierName = labeled(text, /Fornecedor:\s*([^(]+)/i);
  const buyerName = labeled(text, /Unidade:\s*([^\n]+)/i);
  const paymentRaw = labeled(text, /Cond\.\s*Pagamento:\s*([^\n]*?)(?=\s{2,}Contato|\s*$)/i) || labeled(text, /Cond\.\s*Pagamento:\s*(.+?)\s{2,}/i);
  const paymentTerms = paymentRaw?.replace(/\s*\(c[oó]d\.?\s*\d+\)\s*$/i, '').trim() || paymentRaw;
  const paymentTermsCode = /c[oó]d\.?\s*(\d+)/i.exec(paymentRaw ?? '')?.[1] ?? null;
  const { items, deliveryTo } = parseGtplanItems(text);
  const headerTotal = money2(labeled(text, /Valor Total:\s*(R\$\s*[\d.\s,]+)/i));
  const totalAmount = headerTotal !== '0.00' ? headerTotal : (items[0]?.lineTotal ?? '0.00');

  const parsed = {
    orderNumber,
    requestNumber: labeled(text, /IDC:\s*(\d+)/i),
    orderDate,
    billingCnpj,
    buyerName: buyerName?.replace(/\s+/g, ' ').trim() || null,
    paymentTerms: paymentTerms?.replace(/\s+/g, ' ').trim() || null,
    paymentTermsCode,
    deliveryFrom: null as Date | null,
    deliveryTo,
    supplierName: supplierName?.replace(/\s+/g, ' ').trim() || null,
    supplierCnpj,
    totalAmount,
    items,
  };

  return {
    ...parsed,
    parseStatus: computePurchaseOrderParseStatus(parsed),
  };
}
