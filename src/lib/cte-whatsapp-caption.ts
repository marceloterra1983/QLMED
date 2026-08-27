const BRANDS = [
  'AZUL',
  'PANTANAL',
  'GOL',
  'LATAM',
  'JADLOG',
  'BRASPRESS',
  'JAMEF',
  'CORREIOS',
  'RODONAVES',
  'FEDEX',
  'DHL',
  'TNT',
  'TOTAL',
] as const;

const SKIP_TOKENS = new Set([
  'SA',
  'S.A',
  'S.A.',
  'S/A',
  'LTDA',
  'LTDA.',
  'EIRELI',
  'ME',
  'EPP',
  'LINHAS',
  'AEREAS',
  'AEREA',
  'AEREOS',
  'AEREO',
  'BRASILEIRAS',
  'BRASILEIRA',
  'TRANSPORTES',
  'TRANSPORTADORA',
  'TRANSPORTE',
  'LOGISTICA',
  'LOGISTICS',
  'CARGO',
  'EXPRESS',
  'EXPRESSO',
  'CIA',
  'COMPANHIA',
  'E',
]);

const CITY_DISPLAY: Record<string, string> = {
  'CAMPO GRANDE': 'C.G.',
  'SAO PAULO': 'São Paulo',
};

const SMALL_WORDS = new Set(['DE', 'DA', 'DO', 'DAS', 'DOS']);

export function foldName(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export function shortCarrierName(raw: string | null | undefined): string {
  const name = (raw || '').trim();
  if (!name) return '-';
  const folded = foldName(name);
  for (const brand of BRANDS) {
    if (new RegExp(`\\b${brand}\\b`).test(folded)) return brand;
  }
  const tokens = name.split(/[\s,./-]+/).filter(Boolean);
  for (const token of tokens) {
    const key = foldName(token);
    if (!SKIP_TOKENS.has(key) && !SKIP_TOKENS.has(key.replace(/\./g, ''))) {
      return token.toUpperCase();
    }
  }
  return foldName(tokens[0] || '-') || '-';
}

export function abbreviateCity(name: string): string {
  const key = foldName(name);
  if (CITY_DISPLAY[key]) return CITY_DISPLAY[key];
  return name
    .trim()
    .split(/\s+/)
    .map((part, index) => {
      const folded = foldName(part);
      if (index > 0 && SMALL_WORDS.has(folded)) return part.toLowerCase();
      return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
    })
    .join(' ');
}

function xmlTag(xml: string, tag: string): string | null {
  const re = new RegExp(`<(?:[\\w-]+:)?${tag}(?:\\s[^>]*)?>([^<]+)</(?:[\\w-]+:)?${tag}>`, 'i');
  const value = xml.match(re)?.[1]?.trim();
  return value || null;
}

export function extractCteRouteCities(xml: string): {
  originCity: string | null;
  destCity: string | null;
} {
  return {
    originCity: xmlTag(xml, 'xMunIni'),
    destCity: xmlTag(xml, 'xMunFim'),
  };
}

export function formatCaptionBrl(value: unknown): string {
  const raw = value == null ? 0 : Number(typeof value === 'object' ? String(value) : value);
  const number = Number.isFinite(raw) ? raw : 0;
  const [intPart, frac] = number.toFixed(2).split('.');
  const withDots = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `R$ ${withDots},${frac}`;
}

/** 🚚 sozinho aponta à esquerda no iPhone; 🚛➡️ lê origem → destino. */
export const CTE_ROUTE_MARKER = '🚛➡️';

export function buildCteWhatsappCaption(input: {
  number: string | null;
  senderName: string | null;
  originCity: string | null;
  destCity: string | null;
  totalValue: unknown;
}): string {
  const carrier = shortCarrierName(input.senderName);
  const lines = ['CT-e Recebido', '', carrier];
  const origin = input.originCity ? abbreviateCity(input.originCity) : '';
  const dest = input.destCity ? abbreviateCity(input.destCity) : '';
  if (origin && dest) lines.push(`${origin} ${CTE_ROUTE_MARKER} ${dest}`);
  lines.push(formatCaptionBrl(input.totalValue));
  return lines.join('\n');
}

export type ClaimInvoiceInput = {
  type: string;
  number: string | null;
  senderName: string | null;
  totalValue: unknown;
  xmlContent?: string | null;
};

type DecoratedClaimInvoice<T extends ClaimInvoiceInput> = Omit<T, 'xmlContent'> & {
  originCity?: string | null;
  destCity?: string | null;
  carrierShortName?: string;
  whatsappCaption?: string;
};

export function decorateClaimInvoice<T extends ClaimInvoiceInput>(
  invoice: T,
): DecoratedClaimInvoice<T> {
  const { xmlContent, ...rest } = invoice;
  if (invoice.type !== 'CTE') return rest;
  const route = extractCteRouteCities(xmlContent || '');
  return {
    ...rest,
    originCity: route.originCity,
    destCity: route.destCity,
    carrierShortName: shortCarrierName(invoice.senderName),
    whatsappCaption: buildCteWhatsappCaption({
      number: invoice.number,
      senderName: invoice.senderName,
      originCity: route.originCity,
      destCity: route.destCity,
      totalValue: invoice.totalValue,
    }),
  };
}
