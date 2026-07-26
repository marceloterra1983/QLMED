import prisma from '@/lib/prisma';
import { createLogger } from '@/lib/logger';
import type { Prisma } from '@prisma/client';

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

// ── In-memory cache ──
// ncm_cache is owned by Prisma (Phase 11 baseline). No ensure* DDL.

const globalForNcm = globalThis as unknown as {
  ncmMemoryCache?: Map<string, { result: NcmResult | null; at: number }>;
};

// Short in-memory TTL (10 min) to avoid repeated DB reads within same request burst
const MEMORY_TTL_MS = 10 * 60 * 1000;

function getMemoryCache(): Map<string, { result: NcmResult | null; at: number }> {
  if (!globalForNcm.ncmMemoryCache) globalForNcm.ncmMemoryCache = new Map();
  return globalForNcm.ncmMemoryCache;
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
    return data.map((item: { codigo?: string; descricao?: string }) => ({
      codigo: item.codigo || '',
      descricao: cleanDescription(item.descricao || ''),
    }));
  } catch {
    return [];
  } finally {
    clearTimeout(timeoutId);
  }
}

// ── DB cache read/write (Prisma Client — ncm_cache) ──

function parseHierarchy(raw: unknown): NcmHierarchyLevel[] {
  try {
    if (Array.isArray(raw)) return raw as NcmHierarchyLevel[];
    if (typeof raw === 'string') return JSON.parse(raw) as NcmHierarchyLevel[];
  } catch { /* corrupted JSON */ }
  return [];
}

async function getFromDb(code: string): Promise<NcmResult | null> {
  const row = await prisma.ncmCache.findUnique({ where: { code } });
  if (!row) return null;
  const hierarchy = parseHierarchy(row.hierarchy);
  return {
    codigo: formatNcmCode(row.code),
    descricao: row.descricao || '',
    hierarchy,
    fullDescription: row.fullDescription || '',
  };
}

async function saveToDb(
  code: string,
  descricao: string,
  parentCode: string | null,
  fullDescription: string,
  hierarchy: NcmHierarchyLevel[],
): Promise<void> {
  try {
    const existing = await prisma.ncmCache.findUnique({ where: { code } });
    const nextDescricao = descricao !== '' ? descricao : (existing?.descricao ?? '');
    const nextParent = parentCode ?? existing?.parentCode ?? null;
    const nextFull =
      fullDescription !== '' ? fullDescription : (existing?.fullDescription ?? '');
    const nextHierarchy =
      hierarchy.length > 0 ? hierarchy : parseHierarchy(existing?.hierarchy ?? []);

    const hierarchyJson = nextHierarchy as unknown as Prisma.InputJsonValue;
    await prisma.ncmCache.upsert({
      where: { code },
      create: {
        code,
        descricao: nextDescricao,
        parentCode: nextParent,
        fullDescription: nextFull,
        hierarchy: hierarchyJson,
        fetchedAt: new Date(),
      },
      update: {
        descricao: nextDescricao,
        parentCode: nextParent,
        fullDescription: nextFull,
        hierarchy: hierarchyJson,
        fetchedAt: new Date(),
      },
    });
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

/** Search ncm_cache by code prefix or description (leaf codes only, length 8) */
async function searchFromDb(term: string, limit: number): Promise<NcmSearchItem[]> {
  const digits = term.replace(/\D/g, '');
  const isCodeSearch = digits.length >= 2 && digits === term.trim();

  const rows = isCodeSearch
    ? await prisma.ncmCache.findMany({
        where: { code: { startsWith: digits } },
        orderBy: { code: 'asc' },
        take: limit * 3,
        select: { code: true, descricao: true, fullDescription: true },
      })
    : await prisma.ncmCache.findMany({
        where: {
          OR: [
            { descricao: { contains: term, mode: 'insensitive' } },
            { fullDescription: { contains: term, mode: 'insensitive' } },
          ],
        },
        orderBy: { code: 'asc' },
        take: limit * 3,
        select: { code: true, descricao: true, fullDescription: true },
      });

  return rows
    .filter((row) => row.code.length === 8)
    .slice(0, limit)
    .map((row) => ({
      codigo: row.code,
      descricao: row.descricao || '',
      fullDescription: row.fullDescription || '',
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
  const dbRows = await prisma.ncmCache.findMany({
    where: { code: { in: prefixes } },
    select: { code: true, descricao: true },
  });

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

  // Usage counts still come from product_registry (raw until that store migrates).
  const usageRows = await prisma.$queryRawUnsafe<Array<{ ncm_clean: string; usage_count: number }>>(
    `
    SELECT REPLACE(REPLACE(ncm, '.', ''), ' ', '') AS ncm_clean, COUNT(*)::int AS usage_count
    FROM product_registry
    WHERE company_id = $1 AND ncm IS NOT NULL AND TRIM(ncm) <> ''
    GROUP BY REPLACE(REPLACE(ncm, '.', ''), ' ', '')
    `,
    companyId,
  );
  const usage = new Map(usageRows.map((r) => [r.ncm_clean, r.usage_count]));

  const candidates = await searchFromDb(cleaned, Math.max(limit * 5, 50));
  if (candidates.length > 0) {
    return candidates
      .map((c) => ({
        ...c,
        _u: usage.get(c.codigo.replace(/\D/g, '')) ?? 0,
      }))
      .sort((a, b) => b._u - a._u || a.codigo.localeCompare(b.codigo))
      .slice(0, limit)
      .map(({ _u: _unused, ...rest }) => rest);
  }

  // Fallback: search API then return (usage sort only applies to DB hits)
  return searchNcm(cleaned, limit);
}

/**
 * Refresh NCM cache from BrasilAPI for a list of NCM codes.
 * Called from settings page to update descriptions.
 */
export async function refreshNcmCache(codes: string[]): Promise<number> {
  if (codes.length === 0) return 0;
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
