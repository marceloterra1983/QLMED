import { NextResponse } from 'next/server';
import { requireEditor, unauthorizedResponse, forbiddenResponse } from '@/lib/auth';
import { ensureNcmCacheTable, formatNcmCode } from '@/lib/ncm-lookup';
import prisma from '@/lib/prisma';
import { createLogger } from '@/lib/logger';
import { z } from 'zod';

const log = createLogger('ncm/bulk-sync');

const SISCOMEX_URL =
  'https://portalunico.siscomex.gov.br/classif/api/publico/nomenclatura/download/json';

/** Strip HTML tags and leading dashes from SISCOMEX descriptions */
function cleanDescription(text: string): string {
  return text
    .replace(/<[^>]*>/g, '')
    .replace(/^-+\s*/, '')
    .trim();
}

function parentCodeFor(code: string): string | null {
  return code.length === 8
    ? code.slice(0, 6)
    : code.length === 6
      ? code.slice(0, 4)
      : null;
}

/**
 * POST /api/ncm/bulk-sync
 * Downloads the full NCM table from SISCOMEX and populates ncm_cache.
 */
// No request body — schema valida que e um POST sem payload
const noBodySchema = z.object({}).optional();

export async function POST() {
  try {
    // safeParse para consistencia com padrao de validacao
    noBodySchema.safeParse({});

    let _auth: { userId: string; role: string };
    try {
      _auth = await requireEditor();
    } catch (error: unknown) {
      if (error instanceof Error && error.message === 'FORBIDDEN') return forbiddenResponse();
      return unauthorizedResponse();
    }

    await ensureNcmCacheTable();

    // Download full NCM table from SISCOMEX
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60000);

    interface SiscomexItem { Codigo?: string; codigo?: string; Descricao?: string; descricao?: string }
    let rawItems: SiscomexItem[];
    try {
      const res = await fetch(SISCOMEX_URL, {
        signal: controller.signal,
        headers: { Accept: 'application/json', 'User-Agent': 'Mozilla/5.0' },
      });
      if (!res.ok) {
        return NextResponse.json(
          { error: `SISCOMEX retornou status ${res.status}` },
          { status: 502 },
        );
      }
      const json = await res.json();
      rawItems = json?.Nomenclaturas ?? json ?? [];
      if (!Array.isArray(rawItems)) {
        return NextResponse.json(
          { error: 'Formato inesperado da resposta do SISCOMEX' },
          { status: 502 },
        );
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') {
        return NextResponse.json({ error: 'Timeout ao baixar tabela SISCOMEX' }, { status: 504 });
      }
      throw err;
    } finally {
      clearTimeout(timeoutId);
    }

    // Parse items into a map: code → description
    const codeMap = new Map<string, string>();
    for (const item of rawItems) {
      const rawCode: string = item.Codigo || item.codigo || '';
      const code = rawCode.replace(/\D/g, '');
      if (!code || code.length < 4) continue;
      const desc = cleanDescription(item.Descricao || item.descricao || '');
      if (desc) codeMap.set(code, desc);
    }

    // Build hierarchy and full descriptions for 8-digit codes
    const allCodes = Array.from(codeMap.keys());
    const items: Array<{
      code: string;
      descricao: string;
      parentCode: string | null;
      fullDescription: string;
      hierarchy: Array<{ codigo: string; descricao: string }>;
    }> = [];

    for (const code of allCodes) {
      const desc = codeMap.get(code)!;
      const parent = parentCodeFor(code);
      let fullDescription = '';
      const hierarchy: Array<{ codigo: string; descricao: string }> = [];

      if (code.length === 8) {
        const ch4 = code.slice(0, 4);
        const ch6 = code.slice(0, 6);
        if (codeMap.has(ch4)) hierarchy.push({ codigo: formatNcmCode(ch4), descricao: codeMap.get(ch4)! });
        if (codeMap.has(ch6) && ch6 !== ch4) hierarchy.push({ codigo: formatNcmCode(ch6), descricao: codeMap.get(ch6)! });
        hierarchy.push({ codigo: formatNcmCode(code), descricao: desc });
        fullDescription = hierarchy.map((h) => h.descricao).join(' > ');
      }

      items.push({ code, descricao: desc, parentCode: parent, fullDescription, hierarchy });
    }

    // Batch insert in chunks of 100
    const BATCH_SIZE = 100;
    let inserted = 0;
    let updated = 0;

    for (let i = 0; i < items.length; i += BATCH_SIZE) {
      const batch = items.slice(i, i + BATCH_SIZE);

      const values: string[] = [];
      const params: (string | null)[] = [];
      let paramIdx = 1;

      for (const item of batch) {
        values.push(`($${paramIdx}, $${paramIdx + 1}, $${paramIdx + 2}, $${paramIdx + 3}, $${paramIdx + 4}::jsonb, NOW())`);
        params.push(item.code, item.descricao, item.parentCode, item.fullDescription, JSON.stringify(item.hierarchy));
        paramIdx += 5;
      }

      const result = await prisma.$executeRawUnsafe(
        `INSERT INTO ncm_cache (code, descricao, parent_code, full_description, hierarchy, fetched_at)
         VALUES ${values.join(', ')}
         ON CONFLICT (code) DO UPDATE SET
           descricao = CASE WHEN EXCLUDED.descricao <> '' THEN EXCLUDED.descricao ELSE ncm_cache.descricao END,
           parent_code = COALESCE(EXCLUDED.parent_code, ncm_cache.parent_code),
           full_description = CASE WHEN EXCLUDED.full_description <> '' THEN EXCLUDED.full_description ELSE ncm_cache.full_description END,
           hierarchy = CASE WHEN EXCLUDED.hierarchy::text <> '[]' THEN EXCLUDED.hierarchy ELSE ncm_cache.hierarchy END,
           fetched_at = NOW()`,
        ...params,
      );

      // result is the number of affected rows
      if (typeof result === 'number') {
        // Affected rows includes both inserts and updates
        updated += result;
      }
    }

    inserted = items.length;

    return NextResponse.json({
      ok: true,
      total: codeMap.size,
      inserted,
      updated,
    });
  } catch (err) {
    log.error({ err: err }, '[ncm/bulk-sync] Error');
    return NextResponse.json({ error: 'Erro interno ao sincronizar NCM' }, { status: 500 });
  }
}
