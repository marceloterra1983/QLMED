import { NextResponse } from 'next/server';
import { requireAuth, unauthorizedResponse } from '@/lib/auth';
import { getOrCreateSingleCompany } from '@/lib/single-company';
import { ensureProductRegistryTable } from '@/lib/product-registry-store';
import prisma from '@/lib/prisma';

export async function POST(req: Request) {
  try {
    let userId: string;
    try { userId = await requireAuth(); } catch { return unauthorizedResponse(); }

    const company = await getOrCreateSingleCompany(userId);
    await ensureProductRegistryTable();

    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    if (!file) return NextResponse.json({ error: 'Arquivo não enviado' }, { status: 400 });

    const buf = await file.arrayBuffer();
    const ExcelJS = (await import('exceljs')).default;
    const workbook = new ExcelJS.Workbook();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await workbook.xlsx.load(Buffer.from(buf) as any);
    const worksheet = workbook.worksheets[0];

    // Convert to row arrays (equivalent to sheet_to_json with header: 1)
    const allRows: string[][] = [];
    worksheet.eachRow({ includeEmpty: true }, (row) => {
      const values = row.values as (string | number | null | undefined)[];
      // row.values is 1-based (index 0 is undefined), slice from 1
      allRows.push(values.slice(1).map(v => v != null ? String(v) : ''));
    });

    // Find header row (has "Código" in first column)
    let dataStart = 0;
    for (let i = 0; i < Math.min(10, allRows.length); i++) {
      const first = String(allRows[i][0] || '').trim();
      if (first === 'Código' || first === 'Codigo') { dataStart = i + 1; break; }
    }

    // Parse: track tipo (level 1) and subtipo (level 2)
    // A group row has value only in col 0, all other cols empty
    // Tipo rows look like "N - NAME" (start with digit + space + dash)
    // Subtipo rows are any other group row
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
      // Skip if it looks like a header
      if (code === 'Código' || code === 'Codigo') continue;

      entries.push({ code, tipo: currentTipo, subtipo: currentSubtipo });
    }

    if (entries.length === 0) {
      return NextResponse.json({ error: 'Nenhum produto encontrado no arquivo' }, { status: 400 });
    }

    // Fetch all registry rows for this company to match by code
    const registryRows = await prisma.$queryRawUnsafe<Array<{ id: string; code: string | null }>>(
      `SELECT id, code FROM product_registry WHERE company_id = $1`,
      company.id,
    );

    // Build code → id map (normalize code: trim, uppercase)
    const codeToId = new Map<string, string>();
    for (const r of registryRows) {
      if (r.code) codeToId.set(r.code.trim().toUpperCase(), r.id);
    }

    // Batch updates
    let updated = 0;
    for (const entry of entries) {
      const id = codeToId.get(entry.code.toUpperCase());
      if (!id) continue;
      await prisma.$executeRawUnsafe(
        `UPDATE product_registry SET product_type = $2, product_subtype = $3, updated_at = NOW() WHERE id = $1`,
        id,
        entry.tipo || null,
        entry.subtipo || null,
      );
      updated++;
    }

    return NextResponse.json({
      parsed: entries.length,
      matched: updated,
      total: registryRows.length,
    });
  } catch (error) {
    console.error('Error importing product types:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
