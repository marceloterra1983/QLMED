import { randomUUID } from 'crypto';
import type { Prisma } from '@prisma/client';
import prisma from '@/lib/prisma';

export interface StockEntryRow {
  id: string;
  companyId: string;
  invoiceId: string;
  invoiceNumber: string | null;
  supplierName: string | null;
  supplierCnpj: string | null;
  issueDate: Date | null;
  totalValue: number | null;
  totalItems: number;
  matchedItems: number;
  status: 'pending' | 'partial' | 'registered';
  registeredAt: Date | null;
  registeredBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface UpsertStockEntryInput {
  companyId: string;
  invoiceId: string;
  invoiceNumber?: string | null;
  supplierName?: string | null;
  supplierCnpj?: string | null;
  issueDate?: Date | null;
  totalValue?: number | null;
  totalItems?: number;
  matchedItems?: number;
  status?: string;
  registeredBy?: string | null;
}

// stock_entry / nfe_entry_item are schema-owned (Phase 11 baseline).
// No CREATE/ALTER at runtime.

export async function ensureStockEntryTable(): Promise<void> {
  return;
}

function mapStockEntry(row: {
  id: string;
  companyId: string;
  invoiceId: string;
  invoiceNumber: string | null;
  supplierName: string | null;
  supplierCnpj: string | null;
  issueDate: Date | null;
  totalValue: number | null;
  totalItems: number | null;
  matchedItems: number | null;
  status: string;
  registeredAt: Date | null;
  registeredBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}): StockEntryRow {
  return {
    id: row.id,
    companyId: row.companyId,
    invoiceId: row.invoiceId,
    invoiceNumber: row.invoiceNumber ?? null,
    supplierName: row.supplierName ?? null,
    supplierCnpj: row.supplierCnpj ?? null,
    issueDate: row.issueDate,
    totalValue: row.totalValue === null || row.totalValue === undefined ? null : Number(row.totalValue),
    totalItems: Number(row.totalItems || 0),
    matchedItems: Number(row.matchedItems || 0),
    status: (row.status || 'pending') as StockEntryRow['status'],
    registeredAt: row.registeredAt,
    registeredBy: row.registeredBy ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function getStockEntryByInvoiceId(
  companyId: string,
  invoiceId: string,
): Promise<StockEntryRow | null> {
  const row = await prisma.stockEntry.findUnique({
    where: { companyId_invoiceId: { companyId, invoiceId } },
  });
  return row ? mapStockEntry(row) : null;
}

export async function getStockEntriesByInvoiceIds(
  companyId: string,
  invoiceIds: string[],
): Promise<Map<string, StockEntryRow>> {
  if (invoiceIds.length === 0) return new Map();
  const rows = await prisma.stockEntry.findMany({
    where: { companyId, invoiceId: { in: invoiceIds } },
  });
  const map = new Map<string, StockEntryRow>();
  for (const row of rows) {
    const entry = mapStockEntry(row);
    map.set(entry.invoiceId, entry);
  }
  return map;
}

export async function upsertStockEntry(input: UpsertStockEntryInput): Promise<StockEntryRow> {
  const now = new Date();
  const status = input.status ?? 'pending';
  const registeredAt = status === 'registered' ? now : null;
  const totalItems = input.totalItems ?? 0;
  const matchedItems = input.matchedItems ?? 0;

  const existing = await prisma.stockEntry.findUnique({
    where: {
      companyId_invoiceId: {
        companyId: input.companyId,
        invoiceId: input.invoiceId,
      },
    },
  });

  if (existing) {
    const updated = await prisma.stockEntry.update({
      where: { id: existing.id },
      data: {
        // COALESCE semantics from previous raw SQL
        invoiceNumber: input.invoiceNumber ?? existing.invoiceNumber,
        supplierName: input.supplierName ?? existing.supplierName,
        supplierCnpj: input.supplierCnpj ?? existing.supplierCnpj,
        issueDate: input.issueDate ?? existing.issueDate,
        totalValue: input.totalValue ?? existing.totalValue,
        totalItems,
        matchedItems,
        status,
        registeredAt,
        registeredBy: input.registeredBy ?? null,
        updatedAt: now,
      },
    });
    return mapStockEntry(updated);
  }

  const created = await prisma.stockEntry.create({
    data: {
      id: randomUUID(),
      companyId: input.companyId,
      invoiceId: input.invoiceId,
      invoiceNumber: input.invoiceNumber ?? null,
      supplierName: input.supplierName ?? null,
      supplierCnpj: input.supplierCnpj ?? null,
      issueDate: input.issueDate ?? null,
      totalValue: input.totalValue ?? null,
      totalItems,
      matchedItems,
      status,
      registeredAt,
      registeredBy: input.registeredBy ?? null,
      createdAt: now,
      updatedAt: now,
    },
  });
  return mapStockEntry(created);
}

// ── Fiscal totals UPDATE ──

export interface FiscalTotalsInput {
  emitterCity?: string | null;
  emitterState?: string | null;
  accessKey?: string | null;
  cfop?: string | null;
  totVprod?: number | null;
  totVdesc?: number | null;
  totVbc?: number | null;
  totVicms?: number | null;
  totVbcSt?: number | null;
  totVicmsSt?: number | null;
  totVfrete?: number | null;
  totVseg?: number | null;
  totVoutro?: number | null;
  totVipi?: number | null;
  totVpis?: number | null;
  totVcofins?: number | null;
  totVfcp?: number | null;
  totVnf?: number | null;
}

export async function updateStockEntryFiscalTotals(
  companyId: string,
  invoiceId: string,
  data: FiscalTotalsInput,
): Promise<void> {
  await prisma.stockEntry.updateMany({
    where: { companyId, invoiceId },
    data: {
      emitterCity: data.emitterCity ?? null,
      emitterState: data.emitterState ?? null,
      accessKey: data.accessKey ?? null,
      cfop: data.cfop ?? null,
      totVprod: data.totVprod ?? null,
      totVdesc: data.totVdesc ?? null,
      totVbc: data.totVbc ?? null,
      totVicms: data.totVicms ?? null,
      totVbcSt: data.totVbcSt ?? null,
      totVicmsSt: data.totVicmsSt ?? null,
      totVfrete: data.totVfrete ?? null,
      totVseg: data.totVseg ?? null,
      totVoutro: data.totVoutro ?? null,
      totVipi: data.totVipi ?? null,
      totVpis: data.totVpis ?? null,
      totVcofins: data.totVcofins ?? null,
      totVfcp: data.totVfcp ?? null,
      totVnf: data.totVnf ?? null,
      updatedAt: new Date(),
    },
  });
}

// ── nfe_entry_item CRUD ──
// Public row shape stays snake_case for API route compatibility.

export interface NfeEntryItemRow {
  id: number;
  stock_entry_id: string;
  company_id: string;
  invoice_id: string;
  item_number: number;
  supplier_code: string | null;
  supplier_description: string | null;
  ncm: string | null;
  cfop: string | null;
  cest: string | null;
  ean: string | null;
  anvisa: string | null;
  unit: string | null;
  registry_id: string | null;
  codigo_interno: string | null;
  product_name: string | null;
  manufacturer: string | null;
  product_type: string | null;
  product_subtype: string | null;
  quantity: number;
  unit_price: number;
  total_value_gross: number;
  item_discount: number;
  total_value_net: number;
  origem: string | null;
  cst_icms: string | null;
  base_icms: number | null;
  aliq_icms: number | null;
  valor_icms: number | null;
  base_icms_st: number | null;
  valor_icms_st: number | null;
  cst_ipi: string | null;
  aliq_ipi: number | null;
  base_ipi: number | null;
  valor_ipi: number | null;
  cst_pis: string | null;
  aliq_pis: number | null;
  base_pis: number | null;
  valor_pis: number | null;
  cst_cofins: string | null;
  aliq_cofins: number | null;
  base_cofins: number | null;
  valor_cofins: number | null;
  valor_fcp: number | null;
  rateio_frete: number;
  rateio_seguro: number;
  rateio_outras_desp: number;
  rateio_desconto: number;
  lot: string | null;
  lot_serial: string | null;
  lot_quantity: number | null;
  lot_fabrication: string | null;
  lot_expiry: string | null;
  created_at: Date;
  updated_at: Date | null;
}

export interface NfeEntryItemInput {
  stockEntryId: string;
  companyId: string;
  invoiceId: string;
  itemNumber: number;
  supplierCode?: string | null;
  supplierDescription?: string | null;
  ncm?: string | null;
  cfop?: string | null;
  cest?: string | null;
  ean?: string | null;
  anvisa?: string | null;
  unit?: string | null;
  registryId?: string | null;
  codigoInterno?: string | null;
  productName?: string | null;
  manufacturer?: string | null;
  productType?: string | null;
  productSubtype?: string | null;
  quantity?: number;
  unitPrice?: number;
  totalValueGross?: number;
  itemDiscount?: number;
  totalValueNet?: number;
  origem?: string | null;
  cstIcms?: string | null;
  baseIcms?: number | null;
  aliqIcms?: number | null;
  valorIcms?: number | null;
  baseIcmsSt?: number | null;
  valorIcmsSt?: number | null;
  cstIpi?: string | null;
  aliqIpi?: number | null;
  baseIpi?: number | null;
  valorIpi?: number | null;
  cstPis?: string | null;
  aliqPis?: number | null;
  basePis?: number | null;
  valorPis?: number | null;
  cstCofins?: string | null;
  aliqCofins?: number | null;
  baseCofins?: number | null;
  valorCofins?: number | null;
  valorFcp?: number | null;
  rateioFrete?: number;
  rateioSeguro?: number;
  rateioOutrasDesp?: number;
  rateioDesconto?: number;
  lot?: string | null;
  lotSerial?: string | null;
  lotQuantity?: number | null;
  lotFabrication?: string | null;
  lotExpiry?: string | null;
}

type DbClient = Prisma.TransactionClient | typeof prisma;

function mapNfeEntryItem(row: {
  id: number;
  stockEntryId: string;
  companyId: string;
  invoiceId: string;
  itemNumber: number;
  supplierCode: string | null;
  supplierDescription: string | null;
  ncm: string | null;
  cfop: string | null;
  cest: string | null;
  ean: string | null;
  anvisa: string | null;
  unit: string | null;
  registryId: string | null;
  codigoInterno: string | null;
  productName: string | null;
  manufacturer: string | null;
  productType: string | null;
  productSubtype: string | null;
  quantity: number | null;
  unitPrice: number | null;
  totalValueGross: number | null;
  itemDiscount: number | null;
  totalValueNet: number | null;
  origem: string | null;
  cstIcms: string | null;
  baseIcms: number | null;
  aliqIcms: number | null;
  valorIcms: number | null;
  baseIcmsSt: number | null;
  valorIcmsSt: number | null;
  cstIpi: string | null;
  aliqIpi: number | null;
  baseIpi: number | null;
  valorIpi: number | null;
  cstPis: string | null;
  aliqPis: number | null;
  basePis: number | null;
  valorPis: number | null;
  cstCofins: string | null;
  aliqCofins: number | null;
  baseCofins: number | null;
  valorCofins: number | null;
  valorFcp: number | null;
  rateioFrete: number | null;
  rateioSeguro: number | null;
  rateioOutrasDesp: number | null;
  rateioDesconto: number | null;
  lot: string | null;
  lotSerial: string | null;
  lotQuantity: number | null;
  lotFabrication: string | null;
  lotExpiry: string | null;
  createdAt: Date;
  updatedAt: Date | null;
}): NfeEntryItemRow {
  return {
    id: row.id,
    stock_entry_id: row.stockEntryId,
    company_id: row.companyId,
    invoice_id: row.invoiceId,
    item_number: row.itemNumber,
    supplier_code: row.supplierCode,
    supplier_description: row.supplierDescription,
    ncm: row.ncm,
    cfop: row.cfop,
    cest: row.cest,
    ean: row.ean,
    anvisa: row.anvisa,
    unit: row.unit,
    registry_id: row.registryId,
    codigo_interno: row.codigoInterno,
    product_name: row.productName,
    manufacturer: row.manufacturer,
    product_type: row.productType,
    product_subtype: row.productSubtype,
    quantity: Number(row.quantity ?? 0),
    unit_price: Number(row.unitPrice ?? 0),
    total_value_gross: Number(row.totalValueGross ?? 0),
    item_discount: Number(row.itemDiscount ?? 0),
    total_value_net: Number(row.totalValueNet ?? 0),
    origem: row.origem,
    cst_icms: row.cstIcms,
    base_icms: row.baseIcms,
    aliq_icms: row.aliqIcms,
    valor_icms: row.valorIcms,
    base_icms_st: row.baseIcmsSt,
    valor_icms_st: row.valorIcmsSt,
    cst_ipi: row.cstIpi,
    aliq_ipi: row.aliqIpi,
    base_ipi: row.baseIpi,
    valor_ipi: row.valorIpi,
    cst_pis: row.cstPis,
    aliq_pis: row.aliqPis,
    base_pis: row.basePis,
    valor_pis: row.valorPis,
    cst_cofins: row.cstCofins,
    aliq_cofins: row.aliqCofins,
    base_cofins: row.baseCofins,
    valor_cofins: row.valorCofins,
    valor_fcp: row.valorFcp,
    rateio_frete: Number(row.rateioFrete ?? 0),
    rateio_seguro: Number(row.rateioSeguro ?? 0),
    rateio_outras_desp: Number(row.rateioOutrasDesp ?? 0),
    rateio_desconto: Number(row.rateioDesconto ?? 0),
    lot: row.lot,
    lot_serial: row.lotSerial,
    lot_quantity: row.lotQuantity,
    lot_fabrication: row.lotFabrication,
    lot_expiry: row.lotExpiry,
    created_at: row.createdAt,
    updated_at: row.updatedAt,
  };
}

function toNfeCreateData(item: NfeEntryItemInput) {
  return {
    stockEntryId: item.stockEntryId,
    companyId: item.companyId,
    invoiceId: item.invoiceId,
    itemNumber: item.itemNumber,
    supplierCode: item.supplierCode ?? null,
    supplierDescription: item.supplierDescription ?? null,
    ncm: item.ncm ?? null,
    cfop: item.cfop ?? null,
    cest: item.cest ?? null,
    ean: item.ean ?? null,
    anvisa: item.anvisa ?? null,
    unit: item.unit ?? null,
    registryId: item.registryId ?? null,
    codigoInterno: item.codigoInterno ?? null,
    productName: item.productName ?? null,
    manufacturer: item.manufacturer ?? null,
    productType: item.productType ?? null,
    productSubtype: item.productSubtype ?? null,
    quantity: item.quantity ?? 0,
    unitPrice: item.unitPrice ?? 0,
    totalValueGross: item.totalValueGross ?? 0,
    itemDiscount: item.itemDiscount ?? 0,
    totalValueNet: item.totalValueNet ?? 0,
    origem: item.origem ?? null,
    cstIcms: item.cstIcms ?? null,
    baseIcms: item.baseIcms ?? null,
    aliqIcms: item.aliqIcms ?? null,
    valorIcms: item.valorIcms ?? null,
    baseIcmsSt: item.baseIcmsSt ?? null,
    valorIcmsSt: item.valorIcmsSt ?? null,
    cstIpi: item.cstIpi ?? null,
    aliqIpi: item.aliqIpi ?? null,
    baseIpi: item.baseIpi ?? null,
    valorIpi: item.valorIpi ?? null,
    cstPis: item.cstPis ?? null,
    aliqPis: item.aliqPis ?? null,
    basePis: item.basePis ?? null,
    valorPis: item.valorPis ?? null,
    cstCofins: item.cstCofins ?? null,
    aliqCofins: item.aliqCofins ?? null,
    baseCofins: item.baseCofins ?? null,
    valorCofins: item.valorCofins ?? null,
    valorFcp: item.valorFcp ?? null,
    rateioFrete: item.rateioFrete ?? 0,
    rateioSeguro: item.rateioSeguro ?? 0,
    rateioOutrasDesp: item.rateioOutrasDesp ?? 0,
    rateioDesconto: item.rateioDesconto ?? 0,
    lot: item.lot ?? null,
    lotSerial: item.lotSerial ?? null,
    lotQuantity: item.lotQuantity ?? null,
    lotFabrication: item.lotFabrication ?? null,
    lotExpiry: item.lotExpiry ?? null,
  };
}

export async function insertNfeEntryItems(
  stockEntryId: string,
  items: NfeEntryItemInput[],
  tx?: Prisma.TransactionClient,
): Promise<void> {
  if (items.length === 0) {
    const db: DbClient = tx ?? prisma;
    await db.nfeEntryItem.deleteMany({ where: { stockEntryId } });
    return;
  }

  const run = async (db: DbClient) => {
    await db.nfeEntryItem.deleteMany({ where: { stockEntryId } });
    // Batch createMany to avoid oversized single inserts
    const BATCH = 50;
    for (let i = 0; i < items.length; i += BATCH) {
      const batch = items.slice(i, i + BATCH);
      await db.nfeEntryItem.createMany({
        data: batch.map(toNfeCreateData),
      });
    }
  };

  if (tx) {
    await run(tx);
  } else {
    await prisma.$transaction(async (txn) => run(txn));
  }
}

export async function getNfeEntryItemsByInvoice(
  companyId: string,
  invoiceId: string,
): Promise<NfeEntryItemRow[]> {
  const rows = await prisma.nfeEntryItem.findMany({
    where: { companyId, invoiceId },
    orderBy: [{ itemNumber: 'asc' }, { id: 'asc' }],
  });
  return rows.map(mapNfeEntryItem);
}

export async function updateNfeEntryItemLot(
  companyId: string,
  invoiceId: string,
  itemId: number,
  data: { lot?: string | null; lotExpiry?: string | null; lotQuantity?: number | null },
): Promise<NfeEntryItemRow | null> {
  let effQty = data.lotQuantity ?? null;
  if (effQty == null) {
    const item = await prisma.nfeEntryItem.findFirst({
      where: { id: itemId, companyId },
      select: { quantity: true },
    });
    if (item && Number(item.quantity) === 1) effQty = 1;
  }

  const result = await prisma.nfeEntryItem.updateMany({
    where: { id: itemId, companyId, invoiceId },
    data: {
      lot: data.lot ?? null,
      lotExpiry: data.lotExpiry ?? null,
      lotQuantity: effQty,
      updatedAt: new Date(),
    },
  });
  if (result.count === 0) return null;

  const row = await prisma.nfeEntryItem.findFirst({
    where: { id: itemId, companyId, invoiceId },
  });
  return row ? mapNfeEntryItem(row) : null;
}

/** Clone an existing nfe_entry_item row with new lot data (for splitting an item into multiple lots) */
export async function cloneNfeEntryItemBatch(
  companyId: string,
  invoiceId: string,
  sourceItemId: number,
  data: { lot: string; lotExpiry?: string | null; lotQuantity?: number | null },
): Promise<NfeEntryItemRow | null> {
  const source = await prisma.nfeEntryItem.findFirst({
    where: { id: sourceItemId, companyId, invoiceId },
  });
  if (!source) return null;

  const created = await prisma.nfeEntryItem.create({
    data: {
      stockEntryId: source.stockEntryId,
      companyId: source.companyId,
      invoiceId: source.invoiceId,
      itemNumber: source.itemNumber,
      supplierCode: source.supplierCode,
      supplierDescription: source.supplierDescription,
      ncm: source.ncm,
      cfop: source.cfop,
      cest: source.cest,
      ean: source.ean,
      anvisa: source.anvisa,
      unit: source.unit,
      registryId: source.registryId,
      codigoInterno: source.codigoInterno,
      productName: source.productName,
      manufacturer: source.manufacturer,
      productType: source.productType,
      productSubtype: source.productSubtype,
      quantity: source.quantity,
      unitPrice: source.unitPrice,
      totalValueGross: source.totalValueGross,
      itemDiscount: source.itemDiscount,
      totalValueNet: source.totalValueNet,
      origem: source.origem,
      cstIcms: source.cstIcms,
      baseIcms: source.baseIcms,
      aliqIcms: source.aliqIcms,
      valorIcms: source.valorIcms,
      baseIcmsSt: source.baseIcmsSt,
      valorIcmsSt: source.valorIcmsSt,
      cstIpi: source.cstIpi,
      aliqIpi: source.aliqIpi,
      baseIpi: source.baseIpi,
      valorIpi: source.valorIpi,
      cstPis: source.cstPis,
      aliqPis: source.aliqPis,
      basePis: source.basePis,
      valorPis: source.valorPis,
      cstCofins: source.cstCofins,
      aliqCofins: source.aliqCofins,
      baseCofins: source.baseCofins,
      valorCofins: source.valorCofins,
      valorFcp: source.valorFcp,
      rateioFrete: source.rateioFrete,
      rateioSeguro: source.rateioSeguro,
      rateioOutrasDesp: source.rateioOutrasDesp,
      rateioDesconto: source.rateioDesconto,
      lot: data.lot,
      lotSerial: source.lotSerial,
      lotQuantity: data.lotQuantity ?? null,
      lotFabrication: source.lotFabrication,
      lotExpiry: data.lotExpiry ?? null,
    },
  });
  return mapNfeEntryItem(created);
}

/** Delete a batch row — only allowed if the item has more than one row */
export async function deleteNfeEntryItemBatch(
  companyId: string,
  invoiceId: string,
  batchRowId: number,
): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    const target = await tx.nfeEntryItem.findFirst({
      where: { id: batchRowId, companyId, invoiceId },
      select: { id: true, itemNumber: true },
    });
    if (!target) return false;

    const siblingCount = await tx.nfeEntryItem.count({
      where: {
        companyId,
        invoiceId,
        itemNumber: target.itemNumber,
      },
    });
    if (siblingCount <= 1) return false;

    const deleted = await tx.nfeEntryItem.deleteMany({
      where: { id: target.id },
    });
    return deleted.count > 0;
  });
}

export interface PendencyCounts {
  invoiceId: string;
  unmatchedCount: number;
  missingLotCount: number;
}

export async function getNfePendencyCounts(
  companyId: string,
  invoiceIds: string[],
): Promise<Map<string, PendencyCounts>> {
  if (invoiceIds.length === 0) return new Map();

  const rows = await prisma.nfeEntryItem.findMany({
    where: { companyId, invoiceId: { in: invoiceIds } },
    select: {
      invoiceId: true,
      itemNumber: true,
      registryId: true,
      lot: true,
    },
  });

  const byInvoice = new Map<string, { unmatched: Set<number>; missingLot: Set<number> }>();
  for (const row of rows) {
    let bucket = byInvoice.get(row.invoiceId);
    if (!bucket) {
      bucket = { unmatched: new Set(), missingLot: new Set() };
      byInvoice.set(row.invoiceId, bucket);
    }
    if (row.registryId == null) bucket.unmatched.add(row.itemNumber);
    if (row.lot == null) bucket.missingLot.add(row.itemNumber);
  }

  const map = new Map<string, PendencyCounts>();
  for (const [invoiceId, bucket] of byInvoice) {
    map.set(invoiceId, {
      invoiceId,
      unmatchedCount: bucket.unmatched.size,
      missingLotCount: bucket.missingLot.size,
    });
  }
  return map;
}
