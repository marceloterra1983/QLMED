import {
  extractCteRecebedorCnpj,
  extractCteRecebedorName,
  extractCteRemetenteCnpj,
  extractCteRemetenteName,
} from '@/lib/cte-party-extractors';

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

const QL_CNPJ = (process.env.SINGLE_COMPANY_CNPJ || '07832309000197').replace(/\D/g, '');

const PARTY_SKIP = new Set(['SA', 'S.A', 'S.A.', 'S/A', 'LTDA', 'LTDA.', 'EIRELI', 'ME', 'EPP']);

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

export function isQlParty(name?: string | null, cnpj?: string | null): boolean {
  const digits = (cnpj || '').replace(/\D/g, '');
  if (digits && digits === QL_CNPJ) return true;
  return /\bQL\s*MED\b/i.test((name || '').trim());
}

export function shortPartyName(raw: string | null | undefined): string {
  const tokens = (raw || '')
    .trim()
    .split(/[\s,./]+/)
    .filter(Boolean)
    .filter((token) => {
      const key = foldName(token);
      return !PARTY_SKIP.has(key) && !PARTY_SKIP.has(key.replace(/\./g, ''));
    });
  if (tokens.length === 0) return '';
  return tokens
    .map((part, index) => {
      const folded = foldName(part);
      if (index > 0 && SMALL_WORDS.has(folded)) return part.toLowerCase();
      return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
    })
    .join(' ');
}

function cityWithParty(
  city: string,
  name?: string | null,
  cnpj?: string | null,
): string {
  if (isQlParty(name, cnpj)) return city;
  const party = shortPartyName(name);
  return party ? `${city} (${party})` : city;
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

/** Só a seta: caminhão no WhatsApp aponta para o lado errado no iPhone. */
export const CTE_ROUTE_MARKER = '➡️';

export function buildCteWhatsappCaption(input: {
  number: string | null;
  senderName: string | null;
  originCity: string | null;
  destCity: string | null;
  totalValue: unknown;
  originPartyName?: string | null;
  originPartyCnpj?: string | null;
  destPartyName?: string | null;
  destPartyCnpj?: string | null;
}): string {
  const carrier = shortCarrierName(input.senderName);
  const lines = ['CT-e Recebido', '', carrier];
  const origin = input.originCity ? abbreviateCity(input.originCity) : '';
  const dest = input.destCity ? abbreviateCity(input.destCity) : '';
  if (origin && dest) {
    lines.push(
      `${cityWithParty(origin, input.originPartyName, input.originPartyCnpj)} ${CTE_ROUTE_MARKER} ${cityWithParty(dest, input.destPartyName, input.destPartyCnpj)}`,
    );
  }
  lines.push(formatCaptionBrl(input.totalValue));
  return lines.join('\n');
}

export function buildNfeWhatsappCaption(input: {
  number: string | null;
  senderName: string | null;
  senderShortName?: string | null;
  totalValue: unknown;
}): string {
  const short = (input.senderShortName || '').trim();
  const full = (input.senderName || '').trim();
  const name = short || full || '-';
  return [
    'NF-e Recebida',
    '',
    `Número: ${input.number || '-'}`,
    name,
    formatCaptionBrl(input.totalValue),
  ].join('\n');
}

export type ClaimInvoiceInput = {
  type: string;
  number: string | null;
  senderName: string | null;
  totalValue: unknown;
  xmlContent?: string | null;
  /** Apelido do cadastro; prioridade sobre senderName no caption de NF-e. */
  senderShortName?: string | null;
};

type DecoratedClaimInvoice<T extends ClaimInvoiceInput> = Omit<
  T,
  'xmlContent' | 'senderShortName'
> & {
  originCity?: string | null;
  destCity?: string | null;
  carrierShortName?: string;
  whatsappCaption?: string;
};

export function decorateClaimInvoice<T extends ClaimInvoiceInput>(
  invoice: T,
): DecoratedClaimInvoice<T> {
  const { xmlContent, senderShortName, ...rest } = invoice;
  if (invoice.type === 'NFE') {
    return {
      ...rest,
      whatsappCaption: buildNfeWhatsappCaption({
        number: invoice.number,
        senderName: invoice.senderName,
        senderShortName,
        totalValue: invoice.totalValue,
      }),
    };
  }
  if (invoice.type !== 'CTE') return rest;
  const xml = xmlContent || '';
  const route = extractCteRouteCities(xml);
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
      originPartyName: extractCteRemetenteName(xml),
      originPartyCnpj: extractCteRemetenteCnpj(xml),
      destPartyName: extractCteRecebedorName(xml),
      destPartyCnpj: extractCteRecebedorCnpj(xml),
    }),
  };
}
