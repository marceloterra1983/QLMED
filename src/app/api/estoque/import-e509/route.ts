import { NextResponse } from 'next/server';
import { requireEditor, unauthorizedResponse, forbiddenResponse } from '@/lib/auth';
import { getOrCreateSingleCompany } from '@/lib/single-company';
import prisma from '@/lib/prisma';
import { updateNfeEntryItemLot, cloneNfeEntryItemBatch } from '@/lib/stock-entry-store';
import { registerInvoiceEntry } from '@/lib/register-entry';
import { apiError, apiValidationError } from '@/lib/api-error';
import { createLogger } from '@/lib/logger';
import { z } from 'zod';
import { formDataWithLimit } from '@/lib/upload-limits';
import { streamXlsxRows, MAX_XLSX_BYTES } from '@/lib/xlsx-limits';

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

    // Streaming: `workbook.xlsx.load()` monta o livro inteiro e mata o processo
    // bem antes do teto do upload (medições em `streamXlsxRows`). Aqui o custo
    // é o da linha, e o cabeçalho é conferido depois de a leitura terminar.
    let headerNF = '';
    let headerLote = '';
    const rows: E509Row[] = [];
    const totalRows = await streamXlsxRows(fileParsed.data.file, (row) => {
      if (row.index0 === HEADER_ROW) {
        headerNF = row.str(COL_NF_NUMBER);
        headerLote = row.str(COL_LOTE);
        return;
      }
      if (row.index0 < DATA_START_ROW) return;

      const lote = row.str(COL_LOTE);
      if (!lote) return;

      const nfNumber = row.str(COL_NF_NUMBER).replace(/^0+/, '');
      const accessKey = row.str(COL_ACCESS_KEY);
      if (!nfNumber && !accessKey) return;

      rows.push({
        nfNumber,
        accessKey,
        codigoInterno: row.str(COL_CODIGO_INTERNO),
        referencia: row.str(COL_REFERENCIA),
        lote,
        qtdeLote: row.num(COL_QTDE_LOTE),
      });
    });

    if (totalRows === 0) {
      return NextResponse.json({ error: 'Planilha vazia' }, { status: 400 });
    }
    if (!headerNF.includes('NF') || !headerLote.includes('Lote')) {
      return NextResponse.json({
        error: `Formato E509 não reconhecido. Cabeçalho col 0: "${headerNF}", col 82: "${headerLote}"`,
      }, { status: 400 });
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
