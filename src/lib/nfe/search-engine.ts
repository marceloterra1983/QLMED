import { normalizeForSearch } from '@/lib/utils';

/**
 * Common Brazilian medical/hospital, geographical, and person name
 * canonical accent variants.
 */
const COMMON_ACCENT_MAP: Record<string, string> = {
  // Entidades e Organizações
  sao: 'são',
  clinica: 'clínica',
  medico: 'médico',
  convenio: 'convênio',
  cirurgico: 'cirúrgico',
  beneficencia: 'beneficência',
  fundacao: 'fundação',
  associacao: 'associação',
  assistencia: 'assistência',
  saude: 'saúde',
  servico: 'serviço',
  urgencia: 'urgência',
  emergencia: 'emergência',
  diagnostico: 'diagnóstico',
  farmacia: 'farmácia',
  laboratorio: 'laboratório',

  // Nomes de Pessoas
  joao: 'joão',
  jose: 'josé',
  mario: 'mário',
  marcio: 'márcio',
  marcia: 'márcia',
  lucio: 'lúcio',
  lucia: 'lúcia',
  sergio: 'sérgio',
  claudio: 'cláudio',
  valerio: 'valério',
  valeria: 'valéria',
  julio: 'júlio',
  cesar: 'césar',
  andre: 'andré',
  antonio: 'antônio',
  angela: 'ângela',
  monica: 'mônica',
  fatima: 'fátima',
  sonia: 'sônia',
  celia: 'célia',
  cassia: 'cássia',
  inacio: 'inácio',
  helena: 'helêna',

  // Cidades e Estados
  vitoria: 'vitória',
  cuiaba: 'cuiabá',
  brasilia: 'brasília',
  goiania: 'goiânia',
  marilia: 'marília',
  maceio: 'maceió',
  belem: 'belém',
  amapa: 'amapá',
  paraiba: 'paraíba',
  piaui: 'piauí',
  rondonia: 'rondônia',
  chapeco: 'chapecó',
  ribeirao: 'ribeirão',
};

const NOISE_STOPWORDS = new Set([
  'nf',
  'nfe',
  'nf-e',
  'nota',
  'fiscal',
  'danfe',
  'dr',
  'dr.',
  'dra',
  'dra.',
  'doutor',
  'doutora',
]);

/**
 * Generates an array of search variants for a term:
 * 1. Raw term as typed
 * 2. Unaccented term
 * 3. Known canonical Portuguese accented variants
 */
export function expandAccentVariants(term: string): string[] {
  const trimmed = term.trim();
  if (!trimmed) return [];

  const unaccented = normalizeForSearch(trimmed);
  const variants = new Set<string>();

  variants.add(trimmed);
  variants.add(unaccented);

  // If unaccented has a mapped canonical accented version, add it
  const mapped = COMMON_ACCENT_MAP[unaccented];
  if (mapped) {
    variants.add(mapped);
  }

  // Common suffix patterns for Portuguese words:
  // -ao -> -ão (e.g. fundacao -> fundação)
  if (unaccented.endsWith('ao') && unaccented.length > 3) {
    variants.add(unaccented.slice(0, -2) + 'ão');
  }
  // -coes -> -ções (e.g. autorizacoes -> autorizações)
  if (unaccented.endsWith('coes') && unaccented.length > 4) {
    variants.add(unaccented.slice(0, -4) + 'ções');
  }

  return Array.from(variants);
}

export interface ParsedSearchCriteria {
  raw: string;
  exactAccessKey?: string;
  exactCnpj?: string;
  exactCpf?: string;
  totalValueAmount?: number;
  tokens: string[];
}

/**
 * Parses raw search input into structured criteria.
 */
export function tokenizeInvoiceSearch(search: string): ParsedSearchCriteria {
  const raw = search.trim();
  if (!raw) {
    return { raw: '', tokens: [] };
  }

  const allDigits = raw.replace(/\D/g, '');

  // 1. Check if input is a 44-digit Access Key (even if spaced or hyphenated)
  if (allDigits.length === 44) {
    return { raw, exactAccessKey: allDigits, tokens: [] };
  }

  // 2. Check if input is a pure masked/unmasked CNPJ (14 digits)
  if (allDigits.length === 14 && /^\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}$/.test(raw.replace(/\s+/g, ''))) {
    return { raw, exactCnpj: allDigits, tokens: [] };
  }

  // 3. Check if input is a pure masked/unmasked CPF (11 digits)
  if (allDigits.length === 11 && /^\d{3}\.?\d{3}\.?\d{3}-?\d{2}$/.test(raw.replace(/\s+/g, ''))) {
    return { raw, exactCpf: allDigits, tokens: [] };
  }

  // 4. Check if input is a monetary value: "R$ 4.760,00", "4.760,00", "4760,00", "4760.00"
  const moneyMatch = /^(?:r\$\s*)?(\d{1,3}(?:\.\d{3})*|\d+)[,.](\d{2})$/i.exec(raw);
  let totalValueAmount: number | undefined;
  if (moneyMatch) {
    const whole = Number.parseInt(moneyMatch[1].replace(/\./g, ''), 10);
    const frac = Number.parseInt(moneyMatch[2], 10);
    if (Number.isFinite(whole) && Number.isFinite(frac)) {
      totalValueAmount = whole + frac / 100;
    }
  }

  // 5. Tokenize words and strip noise stopwords
  const rawWords = raw.split(/\s+/).filter(Boolean);
  const filteredWords = rawWords.filter((w) => {
    const norm = normalizeForSearch(w);
    return !NOISE_STOPWORDS.has(norm);
  });

  // If all words were stopwords (e.g. user searched literally "NF"), fallback to raw words
  const wordsToUse = filteredWords.length > 0 ? filteredWords : rawWords;

  return {
    raw,
    totalValueAmount,
    tokens: wordsToUse,
  };
}

export interface BuildSearchConditionsOptions {
  nicknameCnpjs?: string[];
  searchXmlContent?: boolean;
}

/**
 * Builds Prisma WHERE clauses given parsed criteria.
 */
export function buildInvoiceSearchConditions(
  criteria: ParsedSearchCriteria,
  options: BuildSearchConditionsOptions = {},
): Record<string, unknown> {
  // 1. Direct Access Key match
  if (criteria.exactAccessKey) {
    return { accessKey: criteria.exactAccessKey };
  }

  // 2. Direct CNPJ match
  if (criteria.exactCnpj) {
    return {
      OR: [
        { recipientCnpj: criteria.exactCnpj },
        { senderCnpj: criteria.exactCnpj },
      ],
    };
  }

  // 3. Direct CPF match
  if (criteria.exactCpf) {
    return {
      OR: [
        { recipientCnpj: criteria.exactCpf },
        { senderCnpj: criteria.exactCpf },
      ],
    };
  }

  const andConditions: Record<string, unknown>[] = [];
  const nicknameCnpjs = options.nicknameCnpjs ?? [];
  const searchXmlContent = options.searchXmlContent ?? true;

  // 4. If monetary value was detected, allow matching totalValue directly or within search
  if (criteria.totalValueAmount !== undefined && criteria.tokens.length === 1) {
    const amt = criteria.totalValueAmount;
    return {
      OR: [
        { totalValue: { gte: amt - 0.009, lte: amt + 0.009 } },
        { number: { contains: criteria.tokens[0], mode: 'insensitive' } },
      ],
    };
  }

  // 5. Multi-token text and number matching
  for (const token of criteria.tokens) {
    const variants = expandAccentVariants(token);
    const tokenDigits = token.replace(/\D/g, '');
    const strippedZeroDigits = tokenDigits.replace(/^0+/, '');

    const fieldConditions: Record<string, unknown>[] = [];

    // For every accent variant, match across text columns
    for (const variant of variants) {
      fieldConditions.push(
        { senderName: { contains: variant, mode: 'insensitive' } },
        { recipientName: { contains: variant, mode: 'insensitive' } },
        { patientName: { contains: variant, mode: 'insensitive' } },
        { convenioName: { contains: variant, mode: 'insensitive' } },
        { doctorName: { contains: variant, mode: 'insensitive' } },
        { number: { contains: variant, mode: 'insensitive' } },
        { accessKey: { contains: variant, mode: 'insensitive' } },
      );

      if (searchXmlContent && variant.length >= 3) {
        fieldConditions.push({
          xmlContent: { contains: variant, mode: 'insensitive' },
        });
      }
    }

    // If token has digits, search in document numbers and CNPJs
    if (tokenDigits.length >= 2) {
      fieldConditions.push(
        { recipientCnpj: { contains: tokenDigits, mode: 'insensitive' } },
        { senderCnpj: { contains: tokenDigits, mode: 'insensitive' } },
        { accessKey: { contains: tokenDigits, mode: 'insensitive' } },
      );

      if (strippedZeroDigits && strippedZeroDigits !== tokenDigits) {
        fieldConditions.push({
          number: { contains: strippedZeroDigits, mode: 'insensitive' },
        });
      }
    }

    // Add nickname CNPJ matches
    if (nicknameCnpjs.length > 0) {
      fieldConditions.push(
        { senderCnpj: { in: nicknameCnpjs } },
        { recipientCnpj: { in: nicknameCnpjs } },
      );
    }

    andConditions.push({ OR: fieldConditions });
  }

  return andConditions.length > 0 ? { AND: andConditions } : {};
}

import type { Invoice } from '@/types';

/**
 * Extracts the product name or code from xmlContent that matches any of the given search tokens.
 */
export function extractMatchedProductSnippet(
  xmlContent: string | null | undefined,
  tokens: string[],
): string | null {
  if (!xmlContent || tokens.length === 0) return null;

  const variants = Array.from(
    new Set(
      tokens
        .flatMap(expandAccentVariants)
        .map(normalizeForSearch)
        .filter((t) => t.length >= 2),
    ),
  );

  if (variants.length === 0) return null;

  // 1. Search in <xProd>...</xProd>
  const xProdRegex = /<xProd>([^<]+)<\/xProd>/gi;
  let match: RegExpExecArray | null;
  while ((match = xProdRegex.exec(xmlContent)) !== null) {
    const rawProd = match[1].trim();
    const normProd = normalizeForSearch(rawProd);
    for (const v of variants) {
      if (v.length >= 3 && normProd.includes(v)) {
        return rawProd;
      }
    }
  }

  // 2. Search in <cProd>...</cProd> (product code)
  const cProdRegex = /<cProd>([^<]+)<\/cProd>/gi;
  while ((match = cProdRegex.exec(xmlContent)) !== null) {
    const rawCode = match[1].trim();
    const normCode = normalizeForSearch(rawCode);
    for (const v of variants) {
      if (v.length >= 2 && normCode.includes(v)) {
        return `Código: ${rawCode}`;
      }
    }
  }

  return null;
}

/**
 * Calculates a quantitative relevance score for an invoice relative to parsed search criteria.
 * Higher score = more relevant (placed at the top of results).
 */
export function scoreInvoiceRelevance(
  invoice: Partial<Invoice>,
  criteria: ParsedSearchCriteria,
): number {
  let score = 0;
  const rawDigits = criteria.raw.replace(/\D/g, '');
  const rawNorm = normalizeForSearch(criteria.raw);

  // 1. Exact Access Key match
  if (criteria.exactAccessKey && invoice.accessKey === criteria.exactAccessKey) {
    return 3000;
  }

  // 2. Exact CNPJ or CPF match
  const cleanRecipientCnpj = (invoice.recipientCnpj || '').replace(/\D/g, '');
  const cleanSenderCnpj = (invoice.senderCnpj || '').replace(/\D/g, '');
  if (criteria.exactCnpj) {
    if (cleanRecipientCnpj === criteria.exactCnpj || cleanSenderCnpj === criteria.exactCnpj) {
      score += 2500;
    }
  }
  if (criteria.exactCpf) {
    if (cleanRecipientCnpj === criteria.exactCpf || cleanSenderCnpj === criteria.exactCpf) {
      score += 2500;
    }
  }

  // 3. Invoice Number match (exact number has very high priority)
  const invNumber = (invoice.number || '').trim();
  const invNumberClean = invNumber.replace(/^0+/, '');
  if (rawDigits.length >= 1) {
    const rawDigitsClean = rawDigits.replace(/^0+/, '');
    if (invNumber === rawDigits || invNumberClean === rawDigitsClean) {
      score += 2200; // Exact invoice number!
    } else if (invNumber.startsWith(rawDigits) || invNumberClean.startsWith(rawDigitsClean)) {
      score += 900;
    } else if (invNumber.includes(rawDigits)) {
      score += 450;
    }
  }

  // 4. Monetary value match
  if (criteria.totalValueAmount !== undefined && typeof invoice.totalValue === 'number') {
    const diff = Math.abs(invoice.totalValue - criteria.totalValueAmount);
    if (diff < 0.01) {
      score += 1800;
    } else if (diff < 1.0) {
      score += 600;
    }
  }

  // 5. Text fields evaluation
  const fields = [
    { text: normalizeForSearch(invoice.recipientName || ''), baseWeight: 400, prefixWeight: 300, exactWeight: 600 },
    { text: normalizeForSearch(invoice.patientName || ''), baseWeight: 380, prefixWeight: 280, exactWeight: 550 },
    { text: normalizeForSearch(invoice.doctorName || ''), baseWeight: 320, prefixWeight: 220, exactWeight: 450 },
    { text: normalizeForSearch(invoice.convenioName || ''), baseWeight: 320, prefixWeight: 220, exactWeight: 450 },
    { text: normalizeForSearch(invoice.senderName || ''), baseWeight: 150, prefixWeight: 100, exactWeight: 200 },
  ];

  // Check full raw query against fields (phrase matching)
  if (rawNorm.length >= 3) {
    for (const f of fields) {
      if (!f.text) continue;
      if (f.text === rawNorm) {
        score += f.exactWeight * 2;
      } else if (f.text.startsWith(rawNorm)) {
        score += f.exactWeight + f.prefixWeight;
      } else if (f.text.includes(rawNorm)) {
        score += f.exactWeight;
      }
    }
  }

  // Check individual tokens
  for (const token of criteria.tokens) {
    const tokenNorm = normalizeForSearch(token);
    if (!tokenNorm || tokenNorm.length < 2) continue;

    for (const f of fields) {
      if (!f.text) continue;
      if (f.text === tokenNorm) {
        score += f.exactWeight;
      } else if (f.text.startsWith(tokenNorm)) {
        score += f.baseWeight + f.prefixWeight;
      } else if (f.text.includes(tokenNorm)) {
        score += f.baseWeight;
      }
    }
  }

  // 6. Matched XML product content
  if (invoice.xmlContent && criteria.tokens.length > 0) {
    const product = extractMatchedProductSnippet(invoice.xmlContent, criteria.tokens);
    if (product) {
      score += 350;
    }
  }

  return score;
}

/**
 * Sorts invoices by relevance to the search string, breaking ties by emission date descending.
 */
export function sortInvoicesByRelevance<T extends Partial<Invoice>>(
  invoices: T[],
  search: string,
): T[] {
  if (!search || !search.trim() || invoices.length <= 1) return invoices;
  const criteria = tokenizeInvoiceSearch(search);
  if (
    criteria.tokens.length === 0 &&
    !criteria.exactAccessKey &&
    !criteria.exactCnpj &&
    !criteria.exactCpf &&
    criteria.totalValueAmount === undefined
  ) {
    return invoices;
  }

  const scored = invoices.map((inv) => ({
    invoice: inv,
    score: scoreInvoiceRelevance(inv, criteria),
    dateMs: inv.issueDate ? new Date(inv.issueDate).getTime() : 0,
  }));

  scored.sort((a, b) => {
    if (b.score !== a.score) {
      return b.score - a.score;
    }
    return b.dateMs - a.dateMs;
  });

  return scored.map((s) => s.invoice);
}
