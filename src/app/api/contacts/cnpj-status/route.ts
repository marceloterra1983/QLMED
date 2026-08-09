import { NextResponse } from 'next/server';
import { requireAuth, unauthorizedResponse } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { apiError } from '@/lib/api-error';
import { cacheHeaders } from '@/lib/cache-headers';

/**
 * GET /api/contacts/cnpj-status?cnpjs=X,Y,Z
 * Returns CNPJ situacao cadastral from cnpj_cache (DB only, no external API calls).
 */
export async function GET(req: Request) {
  try {
    try {
      await requireAuth();
    } catch {
      return unauthorizedResponse();
    }

    const { searchParams } = new URL(req.url);
    const cnpjsParam = searchParams.get('cnpjs') || '';
    const cnpjs = cnpjsParam
      .split(',')
      .map((c) => c.replace(/\D/g, ''))
      .filter((c) => c.length >= 11);

    if (cnpjs.length === 0) {
      return NextResponse.json([]);
    }

    // Limit batch size
    const batch = cnpjs.slice(0, 100);

    const rows = await prisma.cnpjCache.findMany({
      where: { cnpj: { in: batch } },
      select: { cnpj: true, data: true },
    });

    const results = rows.map((row) => {
      try {
        const data = typeof row.data === 'string' ? JSON.parse(row.data) : row.data;
        if (!data || typeof data !== 'object' || Array.isArray(data)) {
          return { cnpj: row.cnpj, status: null };
        }
        return {
          cnpj: row.cnpj,
          status:
            (typeof data.situacaoCadastral === 'string' && data.situacaoCadastral) ||
            (typeof data.descSituacao === 'string' && data.descSituacao) ||
            null,
        };
      } catch {
        return { cnpj: row.cnpj, status: null };
      }
    });

    return NextResponse.json(results, { headers: cacheHeaders('lookup') });
  } catch (error) {
    return apiError(error, 'contacts/cnpj-status');
  }
}
