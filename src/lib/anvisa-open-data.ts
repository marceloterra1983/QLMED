import { normalizeForSearch } from '@/lib/utils';

type DatasetKind = 'medicamentos' | 'produtos_saude';
type AnvisaMatchMethod = 'catalog_code_exact' | 'catalog_name';

interface RawCatalogEntry {
  registration: string;
  productName: string;
  holder: string | null;
  process: string | null;
  status: string | null;
  source: DatasetKind;
}

interface CatalogEntry extends RawCatalogEntry {
  normalizedName: string;
  tokens: string[];
}

interface ParsedHeader {
  registrationIndex: number;
  productNameIndex: number;
  holderIndex: number;
  processIndex: number;
  statusIndex: number;
}

interface CatalogIndex {
  loadedAt: number;
  entries: CatalogEntry[];
  byRegistration: Map<string, CatalogEntry>;
  tokenIndex: Map<string, number[]>;
}

export interface AnvisaLookupInput {
  code: string | null | undefined;
  description: string | null | undefined;
}

export interface AnvisaLookupResult {
  registration: string;
  method: AnvisaMatchMethod;
  confidence: number;
  matchedProductName: string;
  holder: string | null;
  process: string | null;
  status: string | null;
  source: DatasetKind;
}

const DATASET_URLS: Array<{ source: DatasetKind; url: string }> = [
  {
    source: 'medicamentos',
    url: 'https://dados.anvisa.gov.br/dados/CONSULTAS/PRODUTOS/TA_CONSULTA_MEDICAMENTOS.CSV',
  },
  {
    source: 'produtos_saude',
    url: 'https://dados.anvisa.gov.br/dados/CONSULTAS/PRODUTOS/TA_CONSULTA_PRODUTOS_SAUDE.CSV',
  },
];

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_TOKEN_BUCKET = 10000;
const MIN_TOKEN_LENGTH = 4;

const STOPWORDS = new Set([
  'de',
  'da',
  'do',
  'das',
  'dos',
  'para',
  'com',
  'sem',
  'uso',
  'adulto',
  'infantil',
  'solucao',
  'solucaoes',
  'produto',
  'produtos',
  'medicamento',
  'medicamentos',
  'unidade',
  'ml',
  'mg',
  'mcg',
  'g',
  'kg',
  'l',
  'lt',
  'cx',
  'fr',
  'amp',
  'capsula',
  'capsulas',
  'comprimido',
  'comprimidos',
]);

const globalForAnvisa = globalThis as unknown as {
  anvisaCatalogCache?: CatalogIndex;
  anvisaCatalogInFlight?: Promise<CatalogIndex>;
};

function stripDigits(value: string | null | undefined) {
  return (value || '').replace(/\D/g, '');
}

function normalizeHeader(value: string) {
  return normalizeForSearch(value)
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function cleanCsvCell(value: string | undefined) {
  if (!value) return '';
  return value.trim().replace(/^"(.*)"$/, '$1').trim();
}

function parseCsvLine(line: string): string[] {
  const columns: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    const nextChar = line[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === ';' && !inQuotes) {
      columns.push(current);
      current = '';
      continue;
    }

    current += char;
  }

  columns.push(current);
  return columns;
}

function findHeaderIndex(
  headers: string[],
  matcher: (header: string) => boolean,
  fallback = -1
) {
  const index = headers.findIndex(matcher);
  return index >= 0 ? index : fallback;
}

function parseHeader(columns: string[]): ParsedHeader | null {
  const headers = columns.map((column) => normalizeHeader(column));

  const registrationIndex = findHeaderIndex(headers, (header) => {
    if (!header.includes('registro')) return false;
    if (header.includes('detentor')) return false;
    return true;
  });

  const productNameIndex = findHeaderIndex(headers, (header) => {
    if (header.includes('nome_produto')) return true;
    return header.includes('produto') && header.includes('nome');
  });

  if (registrationIndex < 0 || productNameIndex < 0) {
    return null;
  }

  const holderIndex = findHeaderIndex(headers, (header) => {
    return header.includes('detentor') || header.includes('razao_social') || header.includes('empresa');
  });
  const processIndex = findHeaderIndex(headers, (header) => header.includes('processo'));
  const statusIndex = findHeaderIndex(headers, (header) => header.includes('situacao') || header.includes('status'));

  return {
    registrationIndex,
    productNameIndex,
    holderIndex,
    processIndex,
    statusIndex,
  };
}

function tokenizeName(name: string) {
  const normalized = normalizeForSearch(name)
    .replace(/[^a-z0-9\s]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!normalized) return [];

  const tokens = normalized
    .split(' ')
    .filter((token) => token.length >= MIN_TOKEN_LENGTH)
    .filter((token) => !STOPWORDS.has(token));

  return Array.from(new Set(tokens));
}

function isInactiveStatus(status: string | null) {
  if (!status) return false;
  const normalized = normalizeForSearch(status);
  return (
    normalized.includes('cancel') ||
    normalized.includes('inativ') ||
    normalized.includes('suspens') ||
    normalized.includes('vencid') ||
    normalized.includes('indefer')
  );
}

function shouldReplace(existing: CatalogEntry, candidate: RawCatalogEntry) {
  const existingInactive = isInactiveStatus(existing.status);
  const candidateInactive = isInactiveStatus(candidate.status);

  if (existingInactive !== candidateInactive) {
    return existingInactive && !candidateInactive;
  }

  if ((candidate.productName || '').length !== (existing.productName || '').length) {
    return (candidate.productName || '').length > (existing.productName || '').length;
  }

  return false;
}

function normalizeRegistrationCandidates(value: string) {
  if (!value) return [];
  const variants = new Set<string>();
  variants.add(value);

  const noLeadingZero = value.replace(/^0+/, '');
  if (noLeadingZero) variants.add(noLeadingZero);

  if (value.length < 13) variants.add(value.padStart(13, '0'));
  if (value.length < 9) variants.add(value.padStart(9, '0'));

  return Array.from(variants);
}

async function fetchDatasetEntries(dataset: { source: DatasetKind; url: string }): Promise<RawCatalogEntry[]> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 120000);

  try {
    const response = await fetch(dataset.url, {
      cache: 'no-store',
      signal: controller.signal,
      headers: { Accept: 'text/csv,*/*;q=0.9', 'User-Agent': 'Mozilla/5.0' },
    });

    if (!response.ok || !response.body) {
      throw new Error(`Falha ao baixar ${dataset.source}: HTTP ${response.status}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder('latin1');

    let pending = '';
    let header: ParsedHeader | null = null;
    const entries: RawCatalogEntry[] = [];

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      pending += decoder.decode(value, { stream: true });
      const lines = pending.split(/\r?\n/);
      pending = lines.pop() || '';

      for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line) continue;

        const columns = parseCsvLine(line).map((column) => cleanCsvCell(column));
        if (!header) {
          const firstColumn = (columns[0] || '').replace(/^\uFEFF/, '');
          if (firstColumn !== columns[0]) {
            columns[0] = firstColumn;
          }

          header = parseHeader(columns);
          continue;
        }

        const registration = stripDigits(columns[header.registrationIndex]);
        const productName = cleanCsvCell(columns[header.productNameIndex]);

        if (!registration || !productName) continue;

        entries.push({
          registration,
          productName,
          holder: header.holderIndex >= 0 ? cleanCsvCell(columns[header.holderIndex]) || null : null,
          process: header.processIndex >= 0 ? cleanCsvCell(columns[header.processIndex]) || null : null,
          status: header.statusIndex >= 0 ? cleanCsvCell(columns[header.statusIndex]) || null : null,
          source: dataset.source,
        });
      }
    }

    const remaining = pending.trim();
    if (remaining && header) {
      const columns = parseCsvLine(remaining).map((column) => cleanCsvCell(column));
      const registration = stripDigits(columns[header.registrationIndex]);
      const productName = cleanCsvCell(columns[header.productNameIndex]);
      if (registration && productName) {
        entries.push({
          registration,
          productName,
          holder: header.holderIndex >= 0 ? cleanCsvCell(columns[header.holderIndex]) || null : null,
          process: header.processIndex >= 0 ? cleanCsvCell(columns[header.processIndex]) || null : null,
          status: header.statusIndex >= 0 ? cleanCsvCell(columns[header.statusIndex]) || null : null,
          source: dataset.source,
        });
      }
    }

    return entries;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function buildCatalogIndex(): Promise<CatalogIndex> {
  const datasets = await Promise.allSettled(DATASET_URLS.map((dataset) => fetchDatasetEntries(dataset)));
  const rawEntries: RawCatalogEntry[] = [];

  for (const dataset of datasets) {
    if (dataset.status === 'fulfilled') {
      rawEntries.push(...dataset.value);
    }
  }

  const byRegistration = new Map<string, CatalogEntry>();

  for (const raw of rawEntries) {
    const normalizedName = normalizeForSearch(raw.productName || '');
    const tokens = tokenizeName(raw.productName || '');
    const candidate: CatalogEntry = { ...raw, normalizedName, tokens };

    const existing = byRegistration.get(raw.registration);
    if (!existing) {
      byRegistration.set(raw.registration, candidate);
      continue;
    }

    if (shouldReplace(existing, raw)) {
      byRegistration.set(raw.registration, candidate);
    }
  }

  const entries = Array.from(byRegistration.values());
  const tokenIndex = new Map<string, number[]>();

  entries.forEach((entry, entryIndex) => {
    const uniqueTokens = Array.from(new Set(entry.tokens));
    for (const token of uniqueTokens) {
      const current = tokenIndex.get(token);
      if (!current) {
        tokenIndex.set(token, [entryIndex]);
        continue;
      }

      if (current.length < MAX_TOKEN_BUCKET) {
        current.push(entryIndex);
      }
    }
  });

  return {
    loadedAt: Date.now(),
    entries,
    byRegistration,
    tokenIndex,
  };
}

async function getCatalogIndex(): Promise<CatalogIndex> {
  const cached = globalForAnvisa.anvisaCatalogCache;
  if (cached && Date.now() - cached.loadedAt < CACHE_TTL_MS) {
    return cached;
  }

  if (globalForAnvisa.anvisaCatalogInFlight) {
    return globalForAnvisa.anvisaCatalogInFlight;
  }

  const inFlight = buildCatalogIndex()
    .then((index) => {
      globalForAnvisa.anvisaCatalogCache = index;
      return index;
    })
    .finally(() => {
      globalForAnvisa.anvisaCatalogInFlight = undefined;
    });

  globalForAnvisa.anvisaCatalogInFlight = inFlight;
  return inFlight;
}

export async function resolveAnvisaByCodeAndName(input: AnvisaLookupInput): Promise<AnvisaLookupResult | null> {
  const codeDigits = stripDigits(input.code);
  const description = (input.description || '').trim();

  if (!codeDigits && !description) {
    return null;
  }

  const index = await getCatalogIndex();

  if (codeDigits.length >= 7) {
    for (const candidate of normalizeRegistrationCandidates(codeDigits)) {
      const exact = index.byRegistration.get(candidate);
      if (!exact) continue;

      return {
        registration: exact.registration,
        method: 'catalog_code_exact',
        confidence: 0.99,
        matchedProductName: exact.productName,
        holder: exact.holder,
        process: exact.process,
        status: exact.status,
        source: exact.source,
      };
    }
  }

  const normalizedDescription = normalizeForSearch(description);
  const queryTokens = tokenizeName(description);
  if (queryTokens.length === 0) return null;

  const candidateWeights = new Map<number, number>();
  for (const token of queryTokens) {
    const tokenCandidates = index.tokenIndex.get(token);
    if (!tokenCandidates || tokenCandidates.length === 0) continue;

    const tokenWeight = 1 / Math.sqrt(tokenCandidates.length);
    for (const candidateIndex of tokenCandidates) {
      candidateWeights.set(
        candidateIndex,
        (candidateWeights.get(candidateIndex) || 0) + tokenWeight
      );
    }
  }

  if (candidateWeights.size === 0) {
    return null;
  }

  const rankedCandidates = Array.from(candidateWeights.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 250)
    .map(([candidateIndex]) => index.entries[candidateIndex]);

  let best: { entry: CatalogEntry; score: number } | null = null;
  const queryTokenSet = new Set(queryTokens);

  for (const entry of rankedCandidates) {
    const entryTokenSet = new Set(entry.tokens);
    let commonTokens = 0;

    queryTokenSet.forEach((token) => {
      if (entryTokenSet.has(token)) commonTokens += 1;
    });

    const overlapScore = commonTokens / queryTokens.length;
    const containsScore =
      normalizedDescription && entry.normalizedName
        ? (entry.normalizedName.includes(normalizedDescription) || normalizedDescription.includes(entry.normalizedName)
          ? 1
          : 0)
        : 0;

    const codeHint =
      codeDigits && codeDigits.length >= 7
        ? (entry.registration.includes(codeDigits) || codeDigits.includes(entry.registration) ? 0.2 : 0)
        : 0;

    const statusBonus = isInactiveStatus(entry.status) ? -0.1 : 0.05;
    const score = overlapScore * 0.7 + containsScore * 0.25 + codeHint + statusBonus;

    if (!best || score > best.score) {
      best = { entry, score };
    }
  }

  if (!best || best.score < 0.55) {
    return null;
  }

  return {
    registration: best.entry.registration,
    method: 'catalog_name',
    confidence: Math.min(0.98, Number(best.score.toFixed(3))),
    matchedProductName: best.entry.productName,
    holder: best.entry.holder,
    process: best.entry.process,
    status: best.entry.status,
    source: best.entry.source,
  };
}
