import { NextResponse } from 'next/server';
import { requireEditor, unauthorizedResponse, forbiddenResponse } from '@/lib/auth';
import { getOrCreateSingleCompany } from '@/lib/single-company';
import prisma from '@/lib/prisma';
import { ensureStockEntryTable } from '@/lib/stock-entry-store';
import { registerInvoiceEntry } from '@/lib/register-entry';
import ExcelJS from 'exceljs';
import { apiError, apiValidationError } from '@/lib/api-error';
import { createLogger } from '@/lib/logger';
import { z } from 'zod';

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
    await ensureStockEntryTable();

    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const fileSchema = z.object({ file: z.instanceof(File, { message: 'Arquivo e obrigatorio' }) });
    const fileParsed = fileSchema.safeParse({ file });
    if (!fileParsed.success) return apiValidationError(fileParsed.error);

    const arrayBuf = await fileParsed.data.file.arrayBuffer();
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(arrayBuf);
    const ws = workbook.worksheets[0];
    if (!ws || ws.rowCount === 0) {
      return NextResponse.json({ error: 'Planilha vazia' }, { status: 400 });
    }

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
    const accessKeys = Array.from(new Set(rows.filter(r => r.accessKey).map(r => r.accessKey)));
    const nfNumbers = Array.from(new Set(rows.map(r => r.nfNumber).filter(Boolean)));

    // Find invoices by access key
    const invoiceByKey = new Map<string, string>(); // accessKey → invoiceId
    const invoiceByNumber = new Map<string, string>(); // number → invoiceId

    if (accessKeys.length > 0) {
      // Query in batches to avoid too many params
      const BATCH = 100;
      for (let i = 0; i < accessKeys.length; i += BATCH) {
        const batch = accessKeys.slice(i, i + BATCH);
        const akPlaceholders = batch.map((_, j) => `$${j + 2}`).join(', ');
        const akRows = await prisma.$queryRawUnsafe<any[]>(
          `SELECT i.id, i."accessKey", i.number FROM "Invoice" i
           WHERE i."companyId" = $1 AND i."accessKey" IN (${akPlaceholders})`,
          company.id, ...batch
        );
        for (const row of akRows) {
          if (row.accessKey) invoiceByKey.set(row.accessKey, row.id);
          if (row.number) invoiceByNumber.set(row.number.replace(/^0+/, ''), row.id);
        }
      }
    }

    // Fallback: find invoices by number
    const missingNumbers = nfNumbers.filter(n => !invoiceByNumber.has(n));
    if (missingNumbers.length > 0) {
      const BATCH = 100;
      for (let i = 0; i < missingNumbers.length; i += BATCH) {
        const batch = missingNumbers.slice(i, i + BATCH);
        const nPlaceholders = batch.map((_, j) => `$${j + 2}`).join(', ');
        const nRows = await prisma.$queryRawUnsafe<any[]>(
          `SELECT id, number FROM "Invoice" WHERE "companyId" = $1 AND number IN (${nPlaceholders})`,
          company.id, ...batch
        );
        for (const row of nRows) {
          if (row.number) invoiceByNumber.set(row.number.replace(/^0+/, ''), row.id);
        }
      }
    }

    // Step 1: Auto-register invoices that don't have nfe_entry_item rows yet
    const allInvoiceIds = Array.from(new Set([...Array.from(invoiceByKey.values()), ...Array.from(invoiceByNumber.values())]));

    // Check which already have entries
    const existingEntries = new Set<string>();
    if (allInvoiceIds.length > 0) {
      const BATCH = 100;
      for (let i = 0; i < allInvoiceIds.length; i += BATCH) {
        const batch = allInvoiceIds.slice(i, i + BATCH);
        const ph = batch.map((_, j) => `$${j + 2}`).join(', ');
        const entryRows = await prisma.$queryRawUnsafe<any[]>(
          `SELECT DISTINCT invoice_id FROM nfe_entry_item WHERE company_id = $1 AND invoice_id IN (${ph})`,
          company.id, ...batch
        );
        for (const row of entryRows) existingEntries.add(row.invoice_id);
      }
    }

    // Register missing ones
    let autoRegistered = 0;
    const toRegister = allInvoiceIds.filter(id => !existingEntries.has(id));
    for (const invoiceId of toRegister) {
      try {
        const result = await registerInvoiceEntry(company.id, invoiceId, userId);
        if (result) autoRegistered++;
      } catch (err) {
        log.error({ err: err }, 'Failed to auto-register invoice ${invoiceId}');
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

      // Find matching nfe_entry_item by supplier_code (referencia) or codigo_interno
      let matchRows: any[] = [];
      if (row.referencia) {
        matchRows = await prisma.$queryRawUnsafe<any[]>(
          `SELECT id, lot, quantity FROM nfe_entry_item
           WHERE company_id = $1 AND invoice_id = $2 AND supplier_code = $3
           ORDER BY id LIMIT 10`,
          company.id, invoiceId, row.referencia
        );
      }
      if (matchRows.length === 0 && row.codigoInterno) {
        matchRows = await prisma.$queryRawUnsafe<any[]>(
          `SELECT id, lot, quantity FROM nfe_entry_item
           WHERE company_id = $1 AND invoice_id = $2 AND codigo_interno = $3
           ORDER BY id LIMIT 10`,
          company.id, invoiceId, row.codigoInterno
        );
      }

      if (matchRows.length === 0) {
        notFound++;
        continue;
      }

      // Find a row with lot=NULL to update, or insert if all have different lots
      const nullLotRow = matchRows.find((r: any) => r.lot == null);
      const itemQty = Number(matchRows[0].quantity || 0);
      if (nullLotRow) {
        const effQty = itemQty === 1 ? 1 : row.qtdeLote;
        await prisma.$executeRawUnsafe(
          `UPDATE nfe_entry_item SET lot = $2, lot_quantity = $3 WHERE id = $1`,
          nullLotRow.id, row.lote, effQty
        );
        imported++;
      } else {
        const existingLot = matchRows.find((r: any) => r.lot === row.lote);
        if (existingLot) {
          skipped++;
        } else {
          // Insert new batch row by duplicating the first matched item
          const src = matchRows[0];
          await prisma.$executeRawUnsafe(
            `INSERT INTO nfe_entry_item (
               stock_entry_id, company_id, invoice_id, item_number,
               supplier_code, supplier_description, ncm, cfop, cest, ean, anvisa, unit,
               registry_id, codigo_interno, product_name, manufacturer, product_type, product_subtype,
               quantity, unit_price, total_value_gross, item_discount, total_value_net,
               origem, cst_icms, base_icms, aliq_icms, valor_icms,
               base_icms_st, valor_icms_st,
               cst_ipi, aliq_ipi, base_ipi, valor_ipi,
               cst_pis, aliq_pis, base_pis, valor_pis,
               cst_cofins, aliq_cofins, base_cofins, valor_cofins,
               valor_fcp,
               rateio_frete, rateio_seguro, rateio_outras_desp, rateio_desconto,
               lot, lot_serial, lot_quantity, lot_fabrication, lot_expiry
             )
             SELECT
               stock_entry_id, company_id, invoice_id, item_number,
               supplier_code, supplier_description, ncm, cfop, cest, ean, anvisa, unit,
               registry_id, codigo_interno, product_name, manufacturer, product_type, product_subtype,
               quantity, unit_price, total_value_gross, item_discount, total_value_net,
               origem, cst_icms, base_icms, aliq_icms, valor_icms,
               base_icms_st, valor_icms_st,
               cst_ipi, aliq_ipi, base_ipi, valor_ipi,
               cst_pis, aliq_pis, base_pis, valor_pis,
               cst_cofins, aliq_cofins, base_cofins, valor_cofins,
               valor_fcp,
               rateio_frete, rateio_seguro, rateio_outras_desp, rateio_desconto,
               $2, lot_serial, $3, lot_fabrication, lot_expiry
             FROM nfe_entry_item WHERE id = $1`,
            src.id, row.lote, itemQty === 1 ? 1 : row.qtdeLote
          );
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
