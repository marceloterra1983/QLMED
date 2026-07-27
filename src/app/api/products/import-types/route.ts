import { NextResponse } from 'next/server';
import { requireEditor, unauthorizedResponse, forbiddenResponse } from '@/lib/auth';
import { getOrCreateSingleCompany } from '@/lib/single-company';
import prisma from '@/lib/prisma';
import { apiError, apiValidationError } from '@/lib/api-error';
import { z } from 'zod';

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

    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const fileSchema = z.object({ file: z.instanceof(File, { message: 'Arquivo nao enviado' }) });
    const fileParsed = fileSchema.safeParse({ file });
    if (!fileParsed.success) return apiValidationError(fileParsed.error);

    const buf = await fileParsed.data.file.arrayBuffer();
    const ExcelJS = (await import('exceljs')).default;
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buf);
    const worksheet = workbook.worksheets[0];

    const allRows: string[][] = [];
    worksheet.eachRow({ includeEmpty: true }, (row) => {
      const values = row.values as (string | number | null | undefined)[];
      allRows.push(values.slice(1).map((v) => (v != null ? String(v) : '')));
    });

    let dataStart = 0;
    for (let i = 0; i < Math.min(10, allRows.length); i++) {
      const first = String(allRows[i][0] || '').trim();
      if (first === 'Código' || first === 'Codigo') {
        dataStart = i + 1;
        break;
      }
    }

    type ProductEntry = { code: string; tipo: string; subtipo: string };
    const entries: ProductEntry[] = [];

    let currentTipo = '';
    let currentSubtipo = '';

    const isGroupRow = (row: string[]) =>
      String(row[0] || '').trim() !== '' &&
      String(row[1] || '').trim() === '' &&
      String(row[2] || '').trim() === '' &&
      String(row[3] || '').trim() === '';

    const isTipoRow = (val: string) => /^\d+\s*[-–]\s*/.test(val);

    for (let i = dataStart; i < allRows.length; i++) {
      const row = allRows[i].map((c) => String(c || '').trim());
      if (isGroupRow(row)) {
        const label = row[0];
        if (isTipoRow(label)) {
          currentTipo = label.replace(/^\d+\s*[-–]\s*/, '').trim();
          currentSubtipo = '';
        } else {
          currentSubtipo = label;
        }
        continue;
      }

      const code = row[0];
      if (!code || !currentTipo) continue;
      if (code === 'Código' || code === 'Codigo') continue;

      entries.push({ code, tipo: currentTipo, subtipo: currentSubtipo });
    }

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
