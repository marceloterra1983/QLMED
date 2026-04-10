import prisma from '@/lib/prisma';
import { createLogger } from '@/lib/logger';

const log = createLogger('ncm-lookup');

export interface NcmHierarchyLevel {
  codigo: string;
  descricao: string;
}

export interface NcmResult {
  codigo: string;
  descricao: string;
  hierarchy: NcmHierarchyLevel[];
  fullDescription: string;
}

export interface NcmSearchItem {
  codigo: string;
  descricao: string;
  fullDescription: string;
}

// ── Table setup ──

type InitState = { promise?: Promise<void> };
const globalForNcm = globalThis as unknown as {
  ncmCacheInitState?: InitState;
  ncmMemoryCache?: Map<string, { result: NcmResult | null; at: number }>;
};

if (!globalForNcm.ncmCacheInitState) {
  globalForNcm.ncmCacheInitState = {};
}
const initState = globalForNcm.ncmCacheInitState;

// Short in-memory TTL (10 min) to avoid repeated DB reads within same request burst
const MEMORY_TTL_MS = 10 * 60 * 1000;

function getMemoryCache(): Map<string, { result: NcmResult | null; at: number }> {
  if (!globalForNcm.ncmMemoryCache) globalForNcm.ncmMemoryCache = new Map();
  return globalForNcm.ncmMemoryCache;
}

export async function ensureNcmCacheTable(): Promise<void> {
  if (!initState.promise) {
    initState.promise = (async () => {
      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS ncm_cache (
          code TEXT PRIMARY KEY,
          descricao TEXT NOT NULL DEFAULT '',
          parent_code TEXT,
          full_description TEXT NOT NULL DEFAULT '',
          hierarchy JSONB NOT NULL DEFAULT '[]',
          fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      await prisma.$executeRawUnsafe(`
        CREATE INDEX IF NOT EXISTS ncm_cache_parent_idx ON ncm_cache (parent_code)
      `);
    })().catch((err) => {
      initState.promise = undefined;
      throw err;
    });
  }
  return initState.promise;
}

// ── Formatting ──

export function formatNcmCode(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 8) {
    return `${digits.slice(0, 4)}.${digits.slice(4, 6)}.${digits.slice(6, 8)}`;
  }
  return digits;
}

function normalizeCode(codigo: string): string {
  return codigo.replace(/\D/g, '');
}

function parentCodeFor(code: string): string | null {
  return code.length === 8 ? code.slice(0, 6)
    : code.length === 6 ? code.slice(0, 4)
    : null;
}

/** Clean BrasilAPI description: strip HTML tags and leading dash prefixes */
function cleanDescription(text: string): string {
  return text
    .replace(/<[^>]*>/g, '')
    .replace(/^-+\s*/, '')
    .trim();
}

// ── BrasilAPI fetch (fallback only) ──

async function fetchOneFromApi(code: string): Promise<{ codigo: string; descricao: string } | null> {
  const digits = code.replace(/\D/g, '');
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetch(`https://brasilapi.com.br/api/ncm/v1/${digits}`, {
      signal: controller.signal,
      headers: { Accept: 'application/json', 'User-Agent': 'Mozilla/5.0' },
    });
    if (!res.ok) return null;
    const data = await res.json();
    return { codigo: data.codigo || digits, descricao: cleanDescription(data.descricao || '') };
  } catch {
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function fetchSearchFromApi(term: string): Promise<Array<{ codigo: string; descricao: string }>> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(`https://brasilapi.com.br/api/ncm/v1?search=${encodeURIComponent(term)}`, {
      signal: controller.signal,
      headers: { Accept: 'application/json', 'User-Agent': 'Mozilla/5.0' },
    });
    if (!res.ok) return [];
    const data = await res.json();
    if (!Array.isArray(data)) return [];
    return data.map((item: any) => ({
      codigo: item.codigo || '',
      descricao: cleanDescription(item.descricao || ''),
    }));
  } catch {
    return [];
  } finally {
    clearTimeout(timeoutId);
  }
}

// ── DB cache read/write ──

function parseHierarchy(raw: unknown): NcmHierarchyLevel[] {
  try {
    if (Array.isArray(raw)) return raw;
    if (typeof raw === 'string') return JSON.parse(raw);
  } catch { /* corrupted JSON */ }
  return [];
}

async function getFromDb(code: string): Promise<NcmResult | null> {
  const rows = await prisma.$queryRawUnsafe<any[]>(
    `SELECT code, descricao, full_description, hierarchy FROM ncm_cache WHERE code = $1`,
    code,
  );
  if (rows.length === 0) return null;
  const row = rows[0];
  const hierarchy = parseHierarchy(row.hierarchy);
  return {
    codigo: formatNcmCode(row.code),
    descricao: row.descricao || '',
    hierarchy,
    fullDescription: row.full_description || '',
  };
}

async function saveToDb(code: string, descricao: string, parentCode: string | null, fullDescription: string, hierarchy: NcmHierarchyLevel[]): Promise<void> {
  try {
    await prisma.$executeRawUnsafe(
      `
      INSERT INTO ncm_cache (code, descricao, parent_code, full_description, hierarchy, fetched_at)
      VALUES ($1, $2, $3, $4, $5::jsonb, NOW())
      ON CONFLICT (code) DO UPDATE SET
        descricao = CASE WHEN EXCLUDED.descricao <> '' THEN EXCLUDED.descricao ELSE ncm_cache.descricao END,
        parent_code = COALESCE(EXCLUDED.parent_code, ncm_cache.parent_code),
        full_description = CASE WHEN EXCLUDED.full_description <> '' THEN EXCLUDED.full_description ELSE ncm_cache.full_description END,
        hierarchy = CASE WHEN EXCLUDED.hierarchy::text <> '[]' THEN EXCLUDED.hierarchy ELSE ncm_cache.hierarchy END,
        fetched_at = NOW()
      `,
      code,
      descricao,
      parentCode,
      fullDescription,
      JSON.stringify(hierarchy),
    );
  } catch (err) {
    log.error({ err }, 'Error saving to DB');
  }
}

/** Batch save multiple NCM items to DB */
async function saveBatchToDb(items: Array<{ code: string; descricao: string }>): Promise<void> {
  for (const item of items) {
    await saveToDb(item.code, item.descricao, parentCodeFor(item.code), '', []);
  }
}

/** Search ncm_cache by code prefix */
async function searchFromDb(term: string, limit: number): Promise<NcmSearchItem[]> {
  const digits = term.replace(/\D/g, '');
  const isCodeSearch = digits.length >= 2 && digits === term.trim();

  let rows: any[];
  if (isCodeSearch) {
    rows = await prisma.$queryRawUnsafe<any[]>(
      `SELECT code, descricao, full_description FROM ncm_cache
       WHERE code LIKE $1 AND LENGTH(code) = 8
       ORDER BY code
       LIMIT $2`,
      `${digits}%`,
      limit,
    );
  } else {
    rows = await prisma.$queryRawUnsafe<any[]>(
      `SELECT code, descricao, full_description FROM ncm_cache
       WHERE LENGTH(code) = 8 AND (LOWER(descricao) LIKE $1 OR LOWER(full_description) LIKE $1)
       ORDER BY code
       LIMIT $2`,
      `%${term.toLowerCase()}%`,
      limit,
    );
  }

  return rows.map((row: any) => ({
    codigo: row.code,
    descricao: row.descricao || '',
    fullDescription: row.full_description || '',
  }));
}

// ── Build hierarchy (DB-first, API fallback) ──

async function buildHierarchy(digits: string): Promise<NcmHierarchyLevel[]> {
  const levels: NcmHierarchyLevel[] = [];

  const prefixes: string[] = [];
  if (digits.length >= 4) prefixes.push(digits.slice(0, 4));
  if (digits.length >= 6) prefixes.push(digits.slice(0, 6));
  if (digits.length >= 8) prefixes.push(digits.slice(0, 8));

  // Batch DB lookup — single query instead of N+1
  const dbRows = await prisma.$queryRawUnsafe<any[]>(
    `SELECT code, descricao FROM ncm_cache WHERE code = ANY($1::text[])`,
    prefixes,
  );

  const dbResults = new Map<string, { codigo: string; descricao: string }>();
  for (const row of dbRows) {
    if (row.descricao) {
      dbResults.set(row.code, { codigo: row.code, descricao: row.descricao });
    }
  }

  const missingPrefixes = prefixes.filter((p) => !dbResults.has(p));

  // If any missing, fetch from API and save to DB
  if (missingPrefixes.length > 0) {
    const searchTerm = digits.slice(0, 4);
    const searchResults = await fetchSearchFromApi(searchTerm);

    const toSave: Array<{ code: string; descricao: string }> = [];
    for (const item of searchResults) {
      const norm = normalizeCode(item.codigo);
      if (!norm) continue;
      if (!dbResults.has(norm)) {
        dbResults.set(norm, { codigo: item.codigo, descricao: item.descricao });
      }
      toSave.push({ code: norm, descricao: item.descricao });
    }

    // Batch save all API results
    await saveBatchToDb(toSave);

    // Still missing? Fetch individually
    for (const prefix of missingPrefixes) {
      if (!dbResults.has(prefix)) {
        const single = await fetchOneFromApi(prefix);
        if (single) {
          dbResults.set(prefix, single);
          await saveToDb(prefix, single.descricao, parentCodeFor(prefix), '', []);
        }
      }
    }
  }

  // Build the chain
  for (const prefix of prefixes) {
    const entry = dbResults.get(prefix);
    if (entry && entry.descricao) {
      levels.push({ codigo: entry.codigo, descricao: entry.descricao });
    }
  }

  return levels;
}

function buildFullDescription(hierarchy: NcmHierarchyLevel[]): string {
  if (hierarchy.length === 0) return '';
  return hierarchy.map((h) => h.descricao).join(' > ');
}

// ── Public API ──

export async function lookupNcm(code: string): Promise<NcmResult | null> {
  const digits = code.replace(/\D/g, '');
  if (digits.length < 4) return null;

  await ensureNcmCacheTable();

  // Check in-memory cache first (avoids DB hit for repeated lookups)
  const mem = getMemoryCache();
  const cached = mem.get(digits);
  if (cached && Date.now() - cached.at < MEMORY_TTL_MS) {
    return cached.result;
  }
  // Clean expired entry
  if (cached) mem.delete(digits);

  // Check DB cache
  const dbResult = await getFromDb(digits);
  if (dbResult && dbResult.hierarchy.length > 0) {
    mem.set(digits, { result: dbResult, at: Date.now() });
    return dbResult;
  }

  // Build from hierarchy (DB + API fallback)
  const hierarchy = await buildHierarchy(digits);

  if (hierarchy.length === 0) {
    mem.set(digits, { result: null, at: Date.now() });
    return null;
  }

  const last = hierarchy[hierarchy.length - 1];
  const fullDescription = buildFullDescription(hierarchy);
  const result: NcmResult = {
    codigo: formatNcmCode(digits),
    descricao: last.descricao,
    hierarchy,
    fullDescription,
  };

  // Save complete result to DB
  await saveToDb(digits, last.descricao, parentCodeFor(digits), fullDescription, hierarchy);

  mem.set(digits, { result, at: Date.now() });
  return result;
}

export async function searchNcm(term: string, limit = 20): Promise<NcmSearchItem[]> {
  const cleaned = term.trim();
  if (cleaned.length < 2) return [];

  await ensureNcmCacheTable();

  // Try DB first
  const dbResults = await searchFromDb(cleaned, limit);
  if (dbResults.length > 0) {
    return dbResults;
  }

  // Fallback to API and save results
  const raw = await fetchSearchFromApi(cleaned);
  if (raw.length === 0) return [];

  // Build lookup map for parent descriptions
  const hMap = new Map<string, { codigo: string; descricao: string }>();
  const toSave: Array<{ code: string; descricao: string }> = [];
  for (const item of raw) {
    const norm = normalizeCode(item.codigo);
    if (!norm) continue;
    hMap.set(norm, item);
    toSave.push({ code: norm, descricao: item.descricao });
  }

  // Batch save all API results (non-leaf included for hierarchy)
  await saveBatchToDb(toSave);

  // Filter to 8-digit codes only (leaf items) and build full descriptions
  const leafItems = raw.filter((item) => normalizeCode(item.codigo).length === 8);

  const results: NcmSearchItem[] = [];
  for (const item of leafItems.slice(0, limit)) {
    const norm = normalizeCode(item.codigo);
    const chapter = norm.slice(0, 4);
    const subpos = norm.slice(0, 6);
    const parentChapter = hMap.get(chapter);
    const parentSub = hMap.get(subpos);

    const parts: string[] = [];
    if (parentChapter?.descricao) parts.push(parentChapter.descricao);
    if (parentSub?.descricao && parentSub.descricao !== parentChapter?.descricao) parts.push(parentSub.descricao);
    parts.push(item.descricao);
    const fullDescription = parts.join(' > ');

    results.push({
      codigo: item.codigo,
      descricao: item.descricao,
      fullDescription,
    });

    // Update DB with full description (only leaf items)
    await saveToDb(norm, item.descricao, subpos, fullDescription, []);
  }

  return results;
}

/**
 * Search NCMs sorted by usage count in the company's product registry.
 * Most-used NCMs appear first.
 */
export async function searchNcmSorted(
  term: string,
  companyId: string,
  limit = 20,
): Promise<NcmSearchItem[]> {
  const cleaned = term.trim();
  if (cleaned.length < 2) return [];

  await ensureNcmCacheTable();

  const digits = cleaned.replace(/\D/g, '');
  const isCodeSearch = digits.length >= 2 && digits === cleaned;

  // Search DB with usage count sorting
  let rows: any[];
  if (isCodeSearch) {
    rows = await prisma.$queryRawUnsafe<any[]>(
      `
      SELECT nc.code, nc.descricao, nc.full_description,
        COALESCE(u.usage_count, 0)::int AS usage_count
      FROM ncm_cache nc
      LEFT JOIN (
        SELECT REPLACE(REPLACE(ncm, '.', ''), ' ', '') AS ncm_clean, COUNT(*)::int AS usage_count
        FROM product_registry
        WHERE company_id = $1 AND ncm IS NOT NULL AND TRIM(ncm) <> ''
        GROUP BY REPLACE(REPLACE(ncm, '.', ''), ' ', '')
      ) u ON u.ncm_clean = nc.code
      WHERE nc.code LIKE $2 AND LENGTH(nc.code) = 8
      ORDER BY COALESCE(u.usage_count, 0) DESC, nc.code ASC
      LIMIT $3
      `,
      companyId,
      `${digits}%`,
      limit,
    );
  } else {
    rows = await prisma.$queryRawUnsafe<any[]>(
      `
      SELECT nc.code, nc.descricao, nc.full_description,
        COALESCE(u.usage_count, 0)::int AS usage_count
      FROM ncm_cache nc
      LEFT JOIN (
        SELECT REPLACE(REPLACE(ncm, '.', ''), ' ', '') AS ncm_clean, COUNT(*)::int AS usage_count
        FROM product_registry
        WHERE company_id = $1 AND ncm IS NOT NULL AND TRIM(ncm) <> ''
        GROUP BY REPLACE(REPLACE(ncm, '.', ''), ' ', '')
      ) u ON u.ncm_clean = nc.code
      WHERE LENGTH(nc.code) = 8 AND (LOWER(nc.descricao) LIKE $2 OR LOWER(nc.full_description) LIKE $2)
      ORDER BY COALESCE(u.usage_count, 0) DESC, nc.code ASC
      LIMIT $3
      `,
      companyId,
      `%${cleaned.toLowerCase()}%`,
      limit,
    );
  }

  if (rows.length > 0) {
    return rows.map((row: any) => ({
      codigo: row.code,
      descricao: row.descricao || '',
      fullDescription: row.full_description || '',
    }));
  }

  // Fallback: search API then return sorted
  return searchNcm(cleaned, limit);
}

/**
 * Refresh NCM cache from BrasilAPI for a list of NCM codes.
 * Called from settings page to update descriptions.
 */
export async function refreshNcmCache(codes: string[]): Promise<number> {
  if (codes.length === 0) return 0;
  await ensureNcmCacheTable();
  let updated = 0;

  // Group by chapter (4-digit prefix) to avoid duplicate API calls
  const byChapter = new Map<string, string[]>();
  for (const code of codes) {
    const digits = code.replace(/\D/g, '');
    if (digits.length < 4) continue;
    const chapter = digits.slice(0, 4);
    if (!byChapter.has(chapter)) byChapter.set(chapter, []);
    byChapter.get(chapter)!.push(digits);
  }

  for (const [chapter, chapterCodes] of Array.from(byChapter.entries())) {
    // Fetch entire chapter from API (returns all levels)
    const searchResults = await fetchSearchFromApi(chapter);
    const apiMap = new Map<string, string>();
    for (const item of searchResults) {
      const norm = normalizeCode(item.codigo);
      if (norm) apiMap.set(norm, item.descricao);
    }

    // Save all API results
    for (const item of searchResults) {
      const norm = normalizeCode(item.codigo);
      if (!norm) continue;
      await saveToDb(norm, item.descricao, parentCodeFor(norm), '', []);
    }

    // Build and save full hierarchy for each requested code
    for (const digits of chapterCodes) {
      const hierarchy: NcmHierarchyLevel[] = [];
      const prefixes = [digits.slice(0, 4), digits.slice(0, 6), digits.slice(0, 8)].filter((p) => p.length >= 4 && p.length <= digits.length);

      for (const p of prefixes) {
        const desc = apiMap.get(p);
        if (desc) hierarchy.push({ codigo: p, descricao: desc });
      }

      if (hierarchy.length > 0) {
        const last = hierarchy[hierarchy.length - 1];
        const fullDescription = buildFullDescription(hierarchy);
        await saveToDb(digits, last.descricao, parentCodeFor(digits), fullDescription, hierarchy);
        updated++;
      }
    }
  }

  // Clear memory cache
  getMemoryCache().clear();

  return updated;
}
