import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { NextResponse } from 'next/server';
import { requireAuth, unauthorizedResponse } from '@/lib/auth';
import { getOrCreateSingleCompany } from '@/lib/single-company';
import { apiError } from '@/lib/api-error';
import { createBufferFileResponse } from '@/lib/file-response';
import { getQuoteArchive, quoteArchivePdfCandidates } from '@/lib/orcamentos/archive-store';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, ctx: Ctx) {
  try {
    let userId: string;
    try {
      userId = await requireAuth();
    } catch {
      return unauthorizedResponse();
    }
    const company = await getOrCreateSingleCompany(userId);
    const { id } = await ctx.params;
    const row = await getQuoteArchive(company.id, id);
    if (!row) return NextResponse.json({ error: 'Orçamento não encontrado' }, { status: 404 });
    const candidates = quoteArchivePdfCandidates(row.sourcePath);
    if (candidates.length === 0) {
      return NextResponse.json({ error: 'Arquivo fora da pasta de orçamentos' }, { status: 404 });
    }
    let pdf: Buffer | null = null;
    let fileName = path.basename(row.sourcePath);
    for (const candidate of candidates) {
      try {
        pdf = await readFile(candidate);
        fileName = path.basename(candidate);
        break;
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        if (code !== 'ENOENT') throw error;
      }
    }
    if (!pdf) return NextResponse.json({ error: 'Arquivo do orçamento não encontrado' }, { status: 404 });
    const download = new URL(req.url).searchParams.get('download') === '1';
    return createBufferFileResponse(pdf, {
      fileName,
      contentType: 'application/pdf',
      cacheControl: 'private, no-store',
      dispositionType: download ? 'attachment' : 'inline',
    });
  } catch (error) {
    return apiError(error, 'orcamentos/arquivo-pdf');
  }
}
