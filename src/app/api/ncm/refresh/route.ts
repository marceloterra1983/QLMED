import { NextResponse } from 'next/server';
import { requireEditor, unauthorizedResponse, forbiddenResponse } from '@/lib/auth';
import { getOrCreateSingleCompany } from '@/lib/single-company';
import { ensureProductRegistryTable } from '@/lib/product-registry-store';
import { refreshNcmCache } from '@/lib/ncm-lookup';
import prisma from '@/lib/prisma';
import { apiError } from '@/lib/api-error';
import { z } from 'zod';

/**
 * POST /api/ncm/refresh
 * Refreshes NCM descriptions from BrasilAPI for all NCMs used in product_registry.
 */
const noBodySchema = z.object({}).optional();

export async function POST() {
  try {
    noBodySchema.safeParse({});

    let auth: { userId: string; role: string };
    try {
      auth = await requireEditor();
    } catch (error: unknown) {
      if (error instanceof Error && error.message === 'FORBIDDEN') return forbiddenResponse();
      return unauthorizedResponse();
    }

    const company = await getOrCreateSingleCompany(auth.userId);
    await ensureProductRegistryTable();

    const ncmRows = await prisma.productRegistry.findMany({
      where: {
        companyId: company.id,
        ncm: { not: null },
        NOT: { ncm: '' },
      },
      select: { ncm: true },
      distinct: ['ncm'],
    });

    const codeSet = new Set<string>();
    for (const r of ncmRows) {
      const digits = (r.ncm || '').replace(/[.\s]/g, '').trim();
      if (digits.length >= 4) codeSet.add(digits);
    }
    const codes = Array.from(codeSet);

    if (codes.length === 0) {
      return NextResponse.json({ ok: true, totalNcms: 0, refreshed: 0, alreadyCached: 0 });
    }

    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const cacheRows = await prisma.ncmCache.findMany({
      where: {
        code: { in: codes },
        fetchedAt: { gt: since },
        NOT: { descricao: '' },
      },
      select: { code: true, hierarchy: true },
    });

    const freshCodes = new Set<string>();
    for (const row of cacheRows) {
      const h = row.hierarchy;
      const empty =
        h == null ||
        (Array.isArray(h) && h.length === 0) ||
        (typeof h === 'string' && (h === '[]' || h === ''));
      if (!empty) freshCodes.add(row.code);
    }

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
