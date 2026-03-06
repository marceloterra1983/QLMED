import { NextResponse } from 'next/server';
import { requireAuth, requireEditor, unauthorizedResponse, forbiddenResponse } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { getOrCreateSingleCompany } from '@/lib/single-company';
import { extractProductsFromXml } from '@/lib/product-aggregation';
import { ensureProductRegistryTable } from '@/lib/product-registry-store';
import { getNfeEntryItemsByInvoice, updateNfeEntryItemLot, cloneNfeEntryItemBatch, deleteNfeEntryItemBatch } from '@/lib/stock-entry-store';
import { normalizeCode, stripNonAlnum } from '@/lib/code-utils';

export async function GET(req: Request, { params }: { params: { invoiceId: string } }) {
  try {
    let userId: string;
    try {
      userId = await requireAuth();
    } catch {
      return unauthorizedResponse();
    }
    const company = await getOrCreateSingleCompany(userId);
    const { invoiceId } = params;

    const invoice = await prisma.invoice.findFirst({
      where: { id: invoiceId, companyId: company.id },
      select: { id: true, number: true, senderName: true, senderCnpj: true, issueDate: true, totalValue: true, xmlContent: true },
    });

    if (!invoice) {
      return NextResponse.json({ error: 'Nota não encontrada' }, { status: 404 });
    }

    // Try persisted nfe_entry_item rows first
    const persistedRows = await getNfeEntryItemsByInvoice(company.id, invoiceId);

    if (persistedRows.length > 0) {
      // Group rows by item_number → 1 item with batches[]
      const groupMap = new Map<number, { rows: any[] }>();
      for (const r of persistedRows) {
        const num = Number(r.item_number);
        if (!groupMap.has(num)) groupMap.set(num, { rows: [] });
        groupMap.get(num)!.rows.push(r);
      }

      const items = Array.from(groupMap.entries())
        .sort(([a], [b]) => a - b)
        .map(([itemNum, { rows }]) => {
          const r = rows[0]; // first row for item-level fields
          const batches = rows
            .filter((row: any) => row.lot != null)
            .map((row: any) => ({
              id: Number(row.id),
              lot: row.lot,
              serial: row.lot_serial || null,
              quantity: row.lot_quantity != null ? Number(row.lot_quantity) : null,
              fabrication: row.lot_fabrication || null,
              expiry: row.lot_expiry || null,
            }));

          return {
            id: Number(r.id),
            batchIds: rows.map((row: any) => Number(row.id)),
            index: itemNum,
            code: r.supplier_code,
            description: r.supplier_description,
            unit: r.unit,
            ncm: r.ncm,
            cfop: r.cfop,
            cest: r.cest,
            ean: r.ean,
            anvisa: r.anvisa,
            quantity: Number(r.quantity || 0),
            unitPrice: Number(r.unit_price || 0),
            totalValue: Number(r.total_value_gross || 0),
            itemDiscount: Number(r.item_discount || 0),
            totalValueNet: Number(r.total_value_net || 0),
            batches,
            matchStatus: r.registry_id ? 'matched' as const : 'unmatched' as const,
            registryId: r.registry_id,
            codigoInterno: r.codigo_interno,
            registryDescription: r.product_name,
            manufacturer: r.manufacturer,
            productType: r.product_type,
            productSubtype: r.product_subtype,
            // Keep flat lot fields from first row for backward compat
            lot: r.lot,
            lotSerial: r.lot_serial,
            lotQuantity: r.lot_quantity != null ? Number(r.lot_quantity) : null,
            lotFabrication: r.lot_fabrication,
            lotExpiry: r.lot_expiry,
            origem: r.origem,
            cstIcms: r.cst_icms,
            baseIcms: r.base_icms != null ? Number(r.base_icms) : null,
            aliqIcms: r.aliq_icms != null ? Number(r.aliq_icms) : null,
            valorIcms: r.valor_icms != null ? Number(r.valor_icms) : null,
            baseIcmsSt: r.base_icms_st != null ? Number(r.base_icms_st) : null,
            valorIcmsSt: r.valor_icms_st != null ? Number(r.valor_icms_st) : null,
            cstIpi: r.cst_ipi,
            aliqIpi: r.aliq_ipi != null ? Number(r.aliq_ipi) : null,
            baseIpi: r.base_ipi != null ? Number(r.base_ipi) : null,
            valorIpi: r.valor_ipi != null ? Number(r.valor_ipi) : null,
            cstPis: r.cst_pis,
            aliqPis: r.aliq_pis != null ? Number(r.aliq_pis) : null,
            basePis: r.base_pis != null ? Number(r.base_pis) : null,
            valorPis: r.valor_pis != null ? Number(r.valor_pis) : null,
            cstCofins: r.cst_cofins,
            aliqCofins: r.aliq_cofins != null ? Number(r.aliq_cofins) : null,
            baseCofins: r.base_cofins != null ? Number(r.base_cofins) : null,
            valorCofins: r.valor_cofins != null ? Number(r.valor_cofins) : null,
            valorFcp: r.valor_fcp != null ? Number(r.valor_fcp) : null,
            rateioFrete: Number(r.rateio_frete || 0),
            rateioSeguro: Number(r.rateio_seguro || 0),
            rateioOutrasDesp: Number(r.rateio_outras_desp || 0),
            rateioDesconto: Number(r.rateio_desconto || 0),
          };
        });

      const matchedItemNumbers = new Set(
        items.filter((i) => i.matchStatus === 'matched').map((i) => i.index)
      );

      return NextResponse.json({
        invoice: {
          id: invoice.id,
          number: invoice.number,
          supplierName: invoice.senderName,
          supplierCnpj: invoice.senderCnpj,
          issueDate: invoice.issueDate,
          totalValue: invoice.totalValue,
        },
        items,
        summary: {
          totalItems: items.length,
          matchedItems: matchedItemNumbers.size,
          unmatchedItems: items.length - matchedItemNumbers.size,
        },
        source: 'persisted',
      });
    }

    // Fallback: parse XML on-the-fly (not yet registered)
    if (!invoice.xmlContent) {
      return NextResponse.json({ error: 'XML da nota não disponível' }, { status: 404 });
    }

    const products = await extractProductsFromXml(invoice.xmlContent);

    await ensureProductRegistryTable();
    const allRegistryRows = await prisma.$queryRawUnsafe<any[]>(
      `SELECT id, codigo, code, description, short_name
       FROM product_registry
       WHERE company_id = $1 AND code IS NOT NULL AND code != ''
             AND codigo IS NOT NULL AND codigo != ''`,
      company.id
    );

    const registryByCode = new Map<string, any>();
    const registryByAlnum = new Map<string, any>();

    for (const row of allRegistryRows) {
      const norm = normalizeCode(row.code || '');
      if (!norm) continue;
      const alnum = stripNonAlnum(norm);

      if (!registryByCode.has(norm) || (row.codigo && !registryByCode.get(norm)?.codigo)) {
        registryByCode.set(norm, row);
      }
      if (alnum && (!registryByAlnum.has(alnum) || (row.codigo && !registryByAlnum.get(alnum)?.codigo))) {
        registryByAlnum.set(alnum, row);
      }
    }

    const items = products.map((product, index) => {
      const nfeCode = normalizeCode(product.code || '');
      let registry = nfeCode ? registryByCode.get(nfeCode) : undefined;
      if (!registry && nfeCode) {
        const alnum = stripNonAlnum(nfeCode);
        if (alnum) registry = registryByAlnum.get(alnum);
      }
      return {
        index: index + 1,
        code: product.code,
        description: product.description,
        unit: product.unit,
        ncm: product.ncm,
        ean: product.ean,
        anvisa: product.anvisa,
        quantity: product.quantity,
        unitPrice: product.unitPrice,
        totalValue: product.totalValue,
        batches: product.batches,
        matchStatus: registry ? 'matched' as const : 'unmatched' as const,
        registryId: registry?.id ?? null,
        codigoInterno: registry?.codigo ?? null,
        registryDescription: registry?.short_name ?? registry?.description ?? null,
      };
    });

    const matchedCount = items.filter((i) => i.matchStatus === 'matched').length;

    return NextResponse.json({
      invoice: {
        id: invoice.id,
        number: invoice.number,
        supplierName: invoice.senderName,
        supplierCnpj: invoice.senderCnpj,
        issueDate: invoice.issueDate,
        totalValue: invoice.totalValue,
      },
      items,
      summary: {
        totalItems: items.length,
        matchedItems: matchedCount,
        unmatchedItems: items.length - matchedCount,
      },
      source: 'xml',
    });
  } catch (error) {
    console.error('Error fetching invoice items:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}

export async function PATCH(req: Request, { params }: { params: { invoiceId: string } }) {
  try {
    let userId: string;
    try {
      ({ userId } = await requireEditor());
    } catch (e: any) {
      if (e.message === 'FORBIDDEN') return forbiddenResponse();
      return unauthorizedResponse();
    }
    const company = await getOrCreateSingleCompany(userId);
    const { invoiceId } = params;

    const body = await req.json();
    const { itemId, lot, lotExpiry, lotQuantity } = body;

    if (!itemId) {
      return NextResponse.json({ error: 'itemId é obrigatório' }, { status: 400 });
    }

    const updated = await updateNfeEntryItemLot(company.id, invoiceId, itemId, {
      lot: lot ?? null,
      lotExpiry: lotExpiry ?? null,
      lotQuantity: lotQuantity != null ? Number(lotQuantity) : null,
    });

    if (!updated) {
      return NextResponse.json({ error: 'Item não encontrado' }, { status: 404 });
    }

    return NextResponse.json({ item: updated });
  } catch (error) {
    console.error('Error updating lot:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}

/** POST: Add a new batch row (clone from existing item row with new lot data) */
export async function POST(req: Request, { params }: { params: { invoiceId: string } }) {
  try {
    let userId: string;
    try {
      ({ userId } = await requireEditor());
    } catch (e: any) {
      if (e.message === 'FORBIDDEN') return forbiddenResponse();
      return unauthorizedResponse();
    }
    const company = await getOrCreateSingleCompany(userId);
    const { invoiceId } = params;

    const body = await req.json();
    const { sourceItemId, lot, lotExpiry, lotQuantity } = body;

    if (!sourceItemId || !lot) {
      return NextResponse.json({ error: 'sourceItemId e lot são obrigatórios' }, { status: 400 });
    }

    const created = await cloneNfeEntryItemBatch(company.id, invoiceId, Number(sourceItemId), {
      lot,
      lotExpiry: lotExpiry ?? null,
      lotQuantity: lotQuantity != null ? Number(lotQuantity) : null,
    });

    if (!created) {
      return NextResponse.json({ error: 'Item de origem não encontrado' }, { status: 404 });
    }

    return NextResponse.json({ item: created }, { status: 201 });
  } catch (error) {
    console.error('Error adding batch row:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}

/** DELETE: Remove a batch row (only if item has >1 rows) */
export async function DELETE(req: Request, { params }: { params: { invoiceId: string } }) {
  try {
    let userId: string;
    try {
      ({ userId } = await requireEditor());
    } catch (e: any) {
      if (e.message === 'FORBIDDEN') return forbiddenResponse();
      return unauthorizedResponse();
    }
    const company = await getOrCreateSingleCompany(userId);
    const { invoiceId } = params;

    const { searchParams } = new URL(req.url);
    const batchRowId = searchParams.get('batchRowId');

    if (!batchRowId) {
      return NextResponse.json({ error: 'batchRowId é obrigatório' }, { status: 400 });
    }

    const deleted = await deleteNfeEntryItemBatch(company.id, invoiceId, Number(batchRowId));

    if (!deleted) {
      return NextResponse.json({ error: 'Não é possível excluir (último lote do item ou não encontrado)' }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting batch row:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
