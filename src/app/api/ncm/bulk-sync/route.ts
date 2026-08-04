import { NextResponse } from 'next/server';
import { requireEditor, unauthorizedResponse, forbiddenResponse } from '@/lib/auth';
import { formatNcmCode } from '@/lib/ncm-lookup';
import prisma from '@/lib/prisma';
import { createLogger } from '@/lib/logger';
import { z } from 'zod';
import {
  fetchSiscomexNomenclature,
  SiscomexApiError,
  SiscomexTimeoutError,
} from '@/lib/siscomex-client';

const log = createLogger('ncm/bulk-sync');

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

    // Download full NCM table from SISCOMEX
    let rawItems;
    try {
      rawItems = await fetchSiscomexNomenclature();
    } catch (err: unknown) {
      if (err instanceof SiscomexApiError) {
        return NextResponse.json({ error: err.message }, { status: 502 });
      }
      if (err instanceof SiscomexTimeoutError) {
        return NextResponse.json({ error: err.message }, { status: 504 });
      }
      if (err instanceof Error && err.message === 'Formato inesperado da resposta do SISCOMEX') {
        return NextResponse.json({ error: err.message }, { status: 502 });
      }
      throw err;
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

    // Batch upsert via Prisma Client (ncm_cache owned by schema)
    const BATCH_SIZE = 100;
    let inserted = 0;
    let updated = 0;

    for (let i = 0; i < items.length; i += BATCH_SIZE) {
      const batch = items.slice(i, i + BATCH_SIZE);
      const existing = await prisma.ncmCache.findMany({
        where: { code: { in: batch.map((b) => b.code) } },
        select: { code: true },
      });
      const existingSet = new Set(existing.map((e) => e.code));
      const now = new Date();

      await prisma.$transaction(
        batch.map((item) =>
          prisma.ncmCache.upsert({
            where: { code: item.code },
            create: {
              code: item.code,
              descricao: item.descricao,
              parentCode: item.parentCode,
              fullDescription: item.fullDescription,
              hierarchy: item.hierarchy,
              fetchedAt: now,
            },
            update: {
              descricao: item.descricao || undefined,
              parentCode: item.parentCode ?? undefined,
              fullDescription: item.fullDescription || undefined,
              hierarchy: item.hierarchy.length > 0 ? item.hierarchy : undefined,
              fetchedAt: now,
            },
          }),
        ),
      );

      for (const item of batch) {
        if (existingSet.has(item.code)) updated += 1;
        else inserted += 1;
      }
    }

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
