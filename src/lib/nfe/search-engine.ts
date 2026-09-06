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
