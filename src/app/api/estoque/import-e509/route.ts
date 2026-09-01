import { NextResponse } from 'next/server';
import { requireEditor, unauthorizedResponse, forbiddenResponse } from '@/lib/auth';
import { getOrCreateSingleCompany } from '@/lib/single-company';
import prisma from '@/lib/prisma';
import { updateNfeEntryItemLot, cloneNfeEntryItemBatch } from '@/lib/stock-entry-store';
import { registerInvoiceEntry } from '@/lib/register-entry';
import ExcelJS from 'exceljs';
import { apiError, apiValidationError } from '@/lib/api-error';
import { createLogger } from '@/lib/logger';
import { z } from 'zod';
import { formDataWithLimit } from '@/lib/upload-limits';
import { assertSafeXlsx, assertRowCount, MAX_XLSX_BYTES } from '@/lib/xlsx-limits';

const log = createLogger('estoque/import-e509');

// E509 column indices (0-based)
const COL_NF_NUMBER = 0;
const COL_ACCESS_KEY = 8;
const COL_CODIGO_INTERNO = 32;
const COL_REFERENCIA = 33;
const COL_LOTE = 82;
const COL_QTDE_LOTE = 83;

const HEADER_ROW = 2;
const DATA_START_ROW = 4;

interface E509Row {
  nfNumber: string;
  accessKey: string;
  codigoInterno: string;
  referencia: string;
  lote: string;
  qtdeLote: number | null;
}

function cellStr(ws: ExcelJS.Worksheet, r: number, c: number): string {
  const cell = ws.getCell(r + 1, c + 1);
  return cell.value != null ? String(cell.value).trim() : '';
}

function cellNum(ws: ExcelJS.Worksheet, r: number, c: number): number | null {
  const cell = ws.getCell(r + 1, c + 1);
  if (cell.value == null) return null;
  const n = Number(cell.value);
  return isNaN(n) ? null : n;
}

export async function POST(req: Request) {
  try {
    let userId: string;
    try {
      const auth = await requireEditor();
      userId = auth.userId;
    } catch (e: unknown) {
      if (e instanceof Error && e.message === 'FORBIDDEN') return forbiddenResponse();
      return unauthorizedResponse();
    }
    const company = await getOrCreateSingleCompany(userId);

    const formData = await formDataWithLimit(req, MAX_XLSX_BYTES);
    const file = formData.get('file') as File | null;
    const fileSchema = z.object({ file: z.instanceof(File, { message: 'Arquivo e obrigatorio' }) });
    const fileParsed = fileSchema.safeParse({ file });
    if (!fileParsed.success) return apiValidationError(fileParsed.error);

    const arrayBuf = await fileParsed.data.file.arrayBuffer();
    // Zip-bomb: medir o custo do unzip antes de o exceljs pagá-lo.
    await assertSafeXlsx(arrayBuf);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(arrayBuf);
    const ws = workbook.worksheets[0];
    if (!ws || ws.rowCount === 0) {
      return NextResponse.json({ error: 'Planilha vazia' }, { status: 400 });
    }
    assertRowCount(ws.rowCount);

    const lastRow = ws.rowCount - 1; // Convert to 0-based for existing loop

    // Validate headers
    const headerNF = cellStr(ws, HEADER_ROW, COL_NF_NUMBER);
    const headerLote = cellStr(ws, HEADER_ROW, COL_LOTE);
    if (!headerNF.includes('NF') || !headerLote.includes('Lote')) {
      return NextResponse.json({
        error: `Formato E509 não reconhecido. Cabeçalho col 0: "${headerNF}", col 82: "${headerLote}"`,
      }, { status: 400 });
    }

    // Parse data rows
    const rows: E509Row[] = [];
    for (let r = DATA_START_ROW; r <= lastRow; r++) {
      const lote = cellStr(ws, r, COL_LOTE);
      if (!lote) continue;

      const nfNumber = cellStr(ws, r, COL_NF_NUMBER).replace(/^0+/, '');
      const accessKey = cellStr(ws, r, COL_ACCESS_KEY);
      if (!nfNumber && !accessKey) continue;

      rows.push({
        nfNumber,
        accessKey,
        codigoInterno: cellStr(ws, r, COL_CODIGO_INTERNO),
        referencia: cellStr(ws, r, COL_REFERENCIA),
        lote,
        qtdeLote: cellNum(ws, r, COL_QTDE_LOTE),
      });
    }

    if (rows.length === 0) {
      return NextResponse.json({ imported: 0, skipped: 0, notFound: 0, registered: 0, errors: [], totalRows: 0 });
    }

    // Collect unique access keys and NF numbers for batch lookup
    const accessKeys = Array.from(new Set(rows.filter((r) => r.accessKey).map((r) => r.accessKey)));
    const nfNumbers = Array.from(new Set(rows.map((r) => r.nfNumber).filter(Boolean)));

    // Find invoices by access key
    const invoiceByKey = new Map<string, string>(); // accessKey → invoiceId
    const invoiceByNumber = new Map<string, string>(); // number → invoiceId

    if (accessKeys.length > 0) {
      const BATCH = 100;
      for (let i = 0; i < accessKeys.length; i += BATCH) {
        const batch = accessKeys.slice(i, i + BATCH);
        const akRows = await prisma.invoice.findMany({
          where: { companyId: company.id, accessKey: { in: batch } },
          select: { id: true, accessKey: true, number: true },
        });
        for (const row of akRows) {
          if (row.accessKey) invoiceByKey.set(row.accessKey, row.id);
          if (row.number) invoiceByNumber.set(row.number.replace(/^0+/, ''), row.id);
        }
      }
    }

    // Fallback: find invoices by number
    const missingNumbers = nfNumbers.filter((n) => !invoiceByNumber.has(n));
    if (missingNumbers.length > 0) {
      const BATCH = 100;
      for (let i = 0; i < missingNumbers.length; i += BATCH) {
        const batch = missingNumbers.slice(i, i + BATCH);
        const nRows = await prisma.invoice.findMany({
          where: { companyId: company.id, number: { in: batch } },
          select: { id: true, number: true },
        });
        for (const row of nRows) {
          if (row.number) invoiceByNumber.set(row.number.replace(/^0+/, ''), row.id);
        }
      }
    }

    // Step 1: Auto-register invoices that don't have nfe_entry_item rows yet
    const allInvoiceIds = Array.from(
      new Set([...Array.from(invoiceByKey.values()), ...Array.from(invoiceByNumber.values())]),
    );

    const existingEntries = new Set<string>();
    if (allInvoiceIds.length > 0) {
      const BATCH = 100;
      for (let i = 0; i < allInvoiceIds.length; i += BATCH) {
        const batch = allInvoiceIds.slice(i, i + BATCH);
        const entryRows = await prisma.nfeEntryItem.findMany({
          where: { companyId: company.id, invoiceId: { in: batch } },
          select: { invoiceId: true },
          distinct: ['invoiceId'],
        });
        for (const row of entryRows) existingEntries.add(row.invoiceId);
      }
    }

    let autoRegistered = 0;
    const toRegister = allInvoiceIds.filter((id) => !existingEntries.has(id));
    for (const invoiceId of toRegister) {
      try {
        const result = await registerInvoiceEntry(company.id, invoiceId, userId);
        if (result) autoRegistered++;
      } catch (err) {
        log.error({ err }, `Failed to auto-register invoice ${invoiceId}`);
      }
    }

    // Step 2: Now fill in lots from E509
    let imported = 0;
    let skipped = 0;
    let notFound = 0;

    for (const row of rows) {
      let invoiceId = row.accessKey ? invoiceByKey.get(row.accessKey) : undefined;
      if (!invoiceId) invoiceId = invoiceByNumber.get(row.nfNumber);

      if (!invoiceId) {
        notFound++;
        continue;
      }

      let matchRows: Array<{ id: number; lot: string | null; quantity: number | null }> = [];
      if (row.referencia) {
        matchRows = await prisma.nfeEntryItem.findMany({
          where: {
            companyId: company.id,
            invoiceId,
            supplierCode: row.referencia,
          },
          select: { id: true, lot: true, quantity: true },
          orderBy: { id: 'asc' },
          take: 10,
        });
      }
      if (matchRows.length === 0 && row.codigoInterno) {
        matchRows = await prisma.nfeEntryItem.findMany({
          where: {
            companyId: company.id,
            invoiceId,
            codigoInterno: row.codigoInterno,
          },
          select: { id: true, lot: true, quantity: true },
          orderBy: { id: 'asc' },
          take: 10,
        });
      }

      if (matchRows.length === 0) {
        notFound++;
        continue;
      }

      const nullLotRow = matchRows.find((r) => r.lot == null);
      const itemQty = Number(matchRows[0].quantity || 0);
      if (nullLotRow) {
        const effQty = itemQty === 1 ? 1 : row.qtdeLote;
        await updateNfeEntryItemLot(company.id, invoiceId, nullLotRow.id, {
          lot: row.lote,
          lotQuantity: effQty,
        });
        imported++;
      } else {
        const existingLot = matchRows.find((r) => r.lot === row.lote);
        if (existingLot) {
          skipped++;
        } else {
          await cloneNfeEntryItemBatch(company.id, invoiceId, matchRows[0].id, {
            lot: row.lote,
            lotQuantity: itemQty === 1 ? 1 : row.qtdeLote,
          });
          imported++;
        }
      }
    }

    return NextResponse.json({
      imported,
      skipped,
      notFound,
      registered: autoRegistered,
      totalRows: rows.length,
    });
  } catch (error) {
    return apiError(error, 'estoque/import-e509');
  }
}
