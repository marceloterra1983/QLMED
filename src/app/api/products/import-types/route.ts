import { NextResponse } from 'next/server';
import { requireEditor, unauthorizedResponse, forbiddenResponse } from '@/lib/auth';
import { getOrCreateSingleCompany } from '@/lib/single-company';
import prisma from '@/lib/prisma';
import { apiError, apiValidationError } from '@/lib/api-error';
import { z } from 'zod';
import { formDataWithLimit } from '@/lib/upload-limits';
import { streamXlsxRows, MAX_XLSX_BYTES } from '@/lib/xlsx-limits';

export async function POST(req: Request) {
  try {
    let userId: string;
    try {
      userId = (await requireEditor()).userId;
    } catch (e: unknown) {
      if (e instanceof Error && e.message === 'FORBIDDEN') return forbiddenResponse();
      return unauthorizedResponse();
    }

    const company = await getOrCreateSingleCompany(userId);

    const formData = await formDataWithLimit(req, MAX_XLSX_BYTES);
    const file = formData.get('file') as File | null;
    const fileSchema = z.object({ file: z.instanceof(File, { message: 'Arquivo nao enviado' }) });
    const fileParsed = fileSchema.safeParse({ file });
    if (!fileParsed.success) return apiValidationError(fileParsed.error);

    type ProductEntry = { code: string; tipo: string; subtipo: string };
    const entries: ProductEntry[] = [];

    let currentTipo = '';
    let currentSubtipo = '';

    const isGroupRow = (c: string[]) => c[0] !== '' && c[1] === '' && c[2] === '' && c[3] === '';
    const isTipoRow = (val: string) => /^\d+\s*[-–]\s*/.test(val);
    const isHeader = (val: string) => val === 'Código' || val === 'Codigo';

    const parseRow = (c: string[]) => {
      if (isGroupRow(c)) {
        const label = c[0];
        if (isTipoRow(label)) {
          currentTipo = label.replace(/^\d+\s*[-–]\s*/, '').trim();
          currentSubtipo = '';
        } else {
          currentSubtipo = label;
        }
        return;
      }

      const code = c[0];
      if (!code || !currentTipo) return;
      if (isHeader(code)) return;

      entries.push({ code, tipo: currentTipo, subtipo: currentSubtipo });
    };

    // Streaming, uma linha de cada vez (ver `streamXlsxRows`). O cabeçalho
    // `Código` só é procurado nas dez primeiras linhas, como antes; enquanto
    // isso elas ficam guardadas, porque um ficheiro sem cabeçalho é lido desde
    // a primeira. Só as quatro primeiras colunas importam ao formato.
    const primeiras: string[][] = [];
    let cabecalhoDecidido = false;

    await streamXlsxRows(fileParsed.data.file, (row) => {
      const c = [row.str(0), row.str(1), row.str(2), row.str(3)];

      if (!cabecalhoDecidido) {
        if (row.index0 < 10) {
          if (isHeader(c[0])) {
            cabecalhoDecidido = true; // o que veio antes do cabeçalho não conta
            primeiras.length = 0;
          } else {
            primeiras.push(c);
          }
          return;
        }
        cabecalhoDecidido = true; // passou das dez sem cabeçalho: tudo é dado
        for (const anterior of primeiras) parseRow(anterior);
        primeiras.length = 0;
      }

      parseRow(c);
    });

    // Ficheiro com menos de dez linhas e sem cabeçalho.
    if (!cabecalhoDecidido) for (const anterior of primeiras) parseRow(anterior);

    if (entries.length === 0) {
      return NextResponse.json({ error: 'Nenhum produto encontrado no arquivo' }, { status: 400 });
    }

    const registryRows = await prisma.productRegistry.findMany({
      where: { companyId: company.id },
      select: { id: true, code: true },
    });

    const codeToId = new Map<string, string>();
    for (const r of registryRows) {
      if (r.code) codeToId.set(r.code.trim().toUpperCase(), r.id);
    }

    let updated = 0;
    const now = new Date();
    for (const entry of entries) {
      const id = codeToId.get(entry.code.toUpperCase());
      if (!id) continue;
      await prisma.productRegistry.update({
        where: { id },
        data: {
          productType: entry.tipo || null,
          productSubtype: entry.subtipo || null,
          updatedAt: now,
        },
      });
      updated++;
    }

    return NextResponse.json({
      parsed: entries.length,
      matched: updated,
      total: registryRows.length,
    });
  } catch (error) {
    return apiError(error, 'products/import-types');
  }
}
