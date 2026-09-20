import { NextResponse } from 'next/server';
import { requireEditor, unauthorizedResponse, forbiddenResponse } from '@/lib/auth';
import { getOrCreateSingleCompany } from '@/lib/single-company';
import prisma from '@/lib/prisma';
import { updateNfeEntryItemLot, cloneNfeEntryItemBatch } from '@/lib/stock-entry-store';
import { registerInvoiceEntry } from '@/lib/register-entry';
import { syncEntryItemMovement } from '@/lib/stock-ledger';
import { resolveUniqueLotExpiryFromXml } from '@/lib/e509/lot-expiry';
import { isOdsFile, streamOdsRows } from '@/lib/ods-rows';
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

type RowReader = {
  index0: number;
  str: (col: number) => string;
  num: (col: number) => number | null;
};

function collectE509FromRow(
  row: RowReader,
  state: { headerNF: string; headerLote: string; rows: E509Row[] },
): void {
  if (row.index0 === HEADER_ROW) {
    state.headerNF = row.str(COL_NF_NUMBER);
    state.headerLote = row.str(COL_LOTE);
    return;
  }
  if (row.index0 < DATA_START_ROW) return;

  const lote = row.str(COL_LOTE);
  if (!lote) return;

  const nfNumber = row.str(COL_NF_NUMBER).replace(/^0+/, '');
  const accessKey = row.str(COL_ACCESS_KEY);
  if (!nfNumber && !accessKey) return;

  state.rows.push({
    nfNumber,
    accessKey,
    codigoInterno: row.str(COL_CODIGO_INTERNO),
    referencia: row.str(COL_REFERENCIA),
    lote,
    qtdeLote: row.num(COL_QTDE_LOTE),
  });
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

    const state = { headerNF: '', headerLote: '', rows: [] as E509Row[] };
    const ods = await isOdsFile(fileParsed.data.file);
    const totalRows = ods
      ? await streamOdsRows(fileParsed.data.file, (row) => collectE509FromRow(row, state))
      : await streamXlsxRows(fileParsed.data.file, (row) => collectE509FromRow(row, state));

    if (totalRows === 0) {
      return NextResponse.json({ error: 'Planilha vazia' }, { status: 400 });
    }
    if (!state.headerNF.includes('NF') || !state.headerLote.includes('Lote')) {
      return NextResponse.json({
        error: `Formato E509 não reconhecido. Cabeçalho col 0: "${state.headerNF}", col 82: "${state.headerLote}"`,
      }, { status: 400 });
    }

    const rows = state.rows;
    if (rows.length === 0) {
      return NextResponse.json({ imported: 0, skipped: 0, notFound: 0, registered: 0, expiryFilled: 0, errors: [], totalRows: 0 });
    }

    const accessKeys = Array.from(new Set(rows.filter((r) => r.accessKey).map((r) => r.accessKey)));
    const nfNumbers = Array.from(new Set(rows.map((r) => r.nfNumber).filter(Boolean)));

    const invoiceByKey = new Map<string, string>();
    const invoiceByNumber = new Map<string, string>();
    const xmlByInvoiceId = new Map<string, string>();

    if (accessKeys.length > 0) {
      const BATCH = 100;
      for (let i = 0; i < accessKeys.length; i += BATCH) {
        const batch = accessKeys.slice(i, i + BATCH);
        const akRows = await prisma.invoice.findMany({
          where: { companyId: company.id, accessKey: { in: batch } },
          select: { id: true, accessKey: true, number: true, xmlContent: true },
        });
        for (const row of akRows) {
          if (row.accessKey) invoiceByKey.set(row.accessKey, row.id);
          if (row.number) invoiceByNumber.set(row.number.replace(/^0+/, ''), row.id);
          if (row.xmlContent) xmlByInvoiceId.set(row.id, row.xmlContent);
        }
      }
    }

    const missingNumbers = nfNumbers.filter((n) => !invoiceByNumber.has(n));
    if (missingNumbers.length > 0) {
      const BATCH = 100;
      for (let i = 0; i < missingNumbers.length; i += BATCH) {
        const batch = missingNumbers.slice(i, i + BATCH);
        const nRows = await prisma.invoice.findMany({
          where: { companyId: company.id, number: { in: batch } },
          select: { id: true, number: true, xmlContent: true },
        });
        for (const row of nRows) {
          if (row.number) invoiceByNumber.set(row.number.replace(/^0+/, ''), row.id);
          if (row.xmlContent) xmlByInvoiceId.set(row.id, row.xmlContent);
        }
      }
    }

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

    let imported = 0;
    let skipped = 0;
    let notFound = 0;
    let expiryFilled = 0;

    async function applyLot(
      invoiceId: string,
      itemId: number,
      data: { lot: string; lotExpiry?: string | null; lotQuantity?: number | null },
    ) {
      const updated = await updateNfeEntryItemLot(company.id, invoiceId, itemId, {
        lot: data.lot,
        lotExpiry: data.lotExpiry ?? null,
        lotQuantity: data.lotQuantity ?? null,
      });
      if (updated) {
        try {
          await syncEntryItemMovement(company.id, invoiceId, {
            id: Number(updated.id),
            itemNumber: Number(updated.item_number),
            codigoInterno: updated.codigo_interno,
            supplierCode: updated.supplier_code,
            productName: updated.product_name,
            supplierDescription: updated.supplier_description,
            registryId: updated.registry_id,
            lot: updated.lot,
            lotExpiry: updated.lot_expiry,
            lotSerial: updated.lot_serial,
            quantity: updated.quantity,
            lotQuantity: updated.lot_quantity,
          });
        } catch (err) {
          log.error({ err, invoiceId, itemId }, 'Falha ao espelhar lote E509 no ledger');
        }
      }
      return updated;
    }

    for (const row of rows) {
      let invoiceId = row.accessKey ? invoiceByKey.get(row.accessKey) : undefined;
      if (!invoiceId) invoiceId = invoiceByNumber.get(row.nfNumber);

      if (!invoiceId) {
        notFound++;
        continue;
      }

      const xml = xmlByInvoiceId.get(invoiceId) || '';
      const lotExpiry = resolveUniqueLotExpiryFromXml(xml, row.lote);

      let matchRows: Array<{ id: number; lot: string | null; lotExpiry: string | null; quantity: number | null }> = [];
      if (row.referencia) {
        matchRows = await prisma.nfeEntryItem.findMany({
          where: {
            companyId: company.id,
            invoiceId,
            supplierCode: row.referencia,
          },
          select: { id: true, lot: true, lotExpiry: true, quantity: true },
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
          select: { id: true, lot: true, lotExpiry: true, quantity: true },
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
        await applyLot(invoiceId, nullLotRow.id, {
          lot: row.lote,
          lotExpiry,
          lotQuantity: effQty,
        });
        imported++;
        if (lotExpiry) expiryFilled++;
      } else {
        const existingLot = matchRows.find((r) => r.lot === row.lote);
        if (existingLot) {
          if (lotExpiry && !existingLot.lotExpiry) {
            await applyLot(invoiceId, existingLot.id, {
              lot: row.lote,
              lotExpiry,
              lotQuantity: itemQty === 1 ? 1 : row.qtdeLote,
            });
            expiryFilled++;
          }
          skipped++;
        } else {
          const created = await cloneNfeEntryItemBatch(company.id, invoiceId, matchRows[0].id, {
            lot: row.lote,
            lotExpiry,
            lotQuantity: itemQty === 1 ? 1 : row.qtdeLote,
          });
          if (created) {
            try {
              await syncEntryItemMovement(company.id, invoiceId, {
                id: Number(created.id),
                itemNumber: Number(created.item_number),
                codigoInterno: created.codigo_interno,
                supplierCode: created.supplier_code,
                productName: created.product_name,
                supplierDescription: created.supplier_description,
                registryId: created.registry_id,
                lot: created.lot,
                lotExpiry: created.lot_expiry,
                lotSerial: created.lot_serial,
                quantity: created.quantity,
                lotQuantity: created.lot_quantity,
              });
            } catch (err) {
              log.error({ err, invoiceId }, 'Falha ao espelhar clone E509 no ledger');
            }
          }
          imported++;
          if (lotExpiry) expiryFilled++;
        }
      }
    }

    return NextResponse.json({
      imported,
      skipped,
      notFound,
      registered: autoRegistered,
      expiryFilled,
      totalRows: rows.length,
      format: ods ? 'ods' : 'xlsx',
    });
  } catch (error) {
    return apiError(error, 'estoque/import-e509');
  }
}
