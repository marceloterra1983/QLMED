import { NextResponse } from 'next/server';
import { requireEditor, unauthorizedResponse, forbiddenResponse } from '@/lib/auth';
import { getOrCreateSingleCompany } from '@/lib/single-company';
import { ensureProductRegistryTable } from '@/lib/product-registry-store';
import { refreshNcmCache, ensureNcmCacheTable } from '@/lib/ncm-lookup';
import prisma from '@/lib/prisma';
import { createLogger } from '@/lib/logger';
import { apiError, apiValidationError } from '@/lib/api-error';
import { z } from 'zod';

const log = createLogger('ncm/refresh');

/**
 * POST /api/ncm/refresh
 * Refreshes NCM descriptions from BrasilAPI for all NCMs used in product_registry.
 * Called from settings page when user accesses NCM configuration.
 */
// No request body — schema valida que e um POST sem payload
const noBodySchema = z.object({}).optional();

export async function POST() {
  try {
    // safeParse para consistencia com padrao de validacao
    noBodySchema.safeParse({});

    let auth: { userId: string; role: string };
    try {
      auth = await requireEditor();
    } catch (error: unknown) {
      if (error instanceof Error && error.message === 'FORBIDDEN') return forbiddenResponse();
      return unauthorizedResponse();
    }

    const company = await getOrCreateSingleCompany(auth.userId);
    await Promise.all([ensureProductRegistryTable(), ensureNcmCacheTable()]);

    // Get all distinct NCM codes from product_registry
    const ncmRows = await prisma.$queryRawUnsafe<{ ncm: string }[]>(
      `
      SELECT DISTINCT REPLACE(REPLACE(TRIM(ncm), '.', ''), ' ', '') AS ncm
      FROM product_registry
      WHERE company_id = $1
        AND ncm IS NOT NULL
        AND TRIM(ncm) <> ''
      `,
      company.id,
    );

    const codes = ncmRows.map((r) => r.ncm).filter((c) => c.length >= 4);

    if (codes.length === 0) {
      return NextResponse.json({ ok: true, totalNcms: 0, refreshed: 0, alreadyCached: 0 });
    }

    // Find codes that are already fresh in cache (fetched < 30 days ago with content)
    const freshRows = await prisma.$queryRawUnsafe<{ code: string }[]>(
      `
      SELECT code FROM ncm_cache
      WHERE code = ANY($1::text[])
        AND fetched_at > NOW() - INTERVAL '30 days'
        AND descricao <> ''
        AND hierarchy::text <> '[]'
      `,
      codes,
    );
    const freshCodes = new Set(freshRows.map((r) => r.code));
    const needRefresh = codes.filter((c) => !freshCodes.has(c));

    const updated = await refreshNcmCache(needRefresh);

    return NextResponse.json({
      ok: true,
      totalNcms: codes.length,
      refreshed: updated,
      alreadyCached: freshCodes.size,
    });
  } catch (error) {
    return apiError(error, 'ncm/refresh');
  }
}
