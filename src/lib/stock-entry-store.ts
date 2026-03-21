import { randomUUID } from 'crypto';
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

// ── DB row interfaces (snake_case, matching SQL columns) ──

interface StockEntryDbRow {
  id: string;
  company_id: string;
  invoice_id: string;
  invoice_number: string | null;
  supplier_name: string | null;
  supplier_cnpj: string | null;
  issue_date: string | Date | null;
  total_value: number | null;
  total_items: number;
  matched_items: number;
  status: string;
  registered_at: string | Date | null;
  registered_by: string | null;
  created_at: string | Date;
  updated_at: string | Date;
  emitter_city: string | null;
  emitter_state: string | null;
  access_key: string | null;
  cfop: string | null;
  tot_vprod: number | null;
  tot_vdesc: number | null;
  tot_vbc: number | null;
  tot_vicms: number | null;
  tot_vbc_st: number | null;
  tot_vicms_st: number | null;
  tot_vfrete: number | null;
  tot_vseg: number | null;
  tot_voutro: number | null;
  tot_vipi: number | null;
  tot_vpis: number | null;
  tot_vcofins: number | null;
  tot_vfcp: number | null;
  tot_vnf: number | null;
}

interface PendencyCountsDbRow {
  invoice_id: string;
  unmatched_count: number | string;
  missing_lot_count: number | string;
}

type StockEntryInitState = {
  promise?: Promise<void>;
};

const globalStockEntryState = globalThis as unknown as {
  stockEntryInitState?: StockEntryInitState;
};

const stockEntryInitState: StockEntryInitState =
  globalStockEntryState.stockEntryInitState || {};
globalStockEntryState.stockEntryInitState = stockEntryInitState;

function mapStockEntryRow(row: StockEntryDbRow): StockEntryRow {
  return {
    id: row.id,
    companyId: row.company_id,
    invoiceId: row.invoice_id,
    invoiceNumber: row.invoice_number ?? null,
    supplierName: row.supplier_name ?? null,
    supplierCnpj: row.supplier_cnpj ?? null,
    issueDate: row.issue_date ? new Date(row.issue_date) : null,
    totalValue: row.total_value === null || row.total_value === undefined ? null : Number(row.total_value),
    totalItems: Number(row.total_items || 0),
    matchedItems: Number(row.matched_items || 0),
    status: (row.status || 'pending') as StockEntryRow['status'],
    registeredAt: row.registered_at ? new Date(row.registered_at) : null,
    registeredBy: row.registered_by ?? null,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

export async function ensureStockEntryTable() {
  if (!stockEntryInitState.promise) {
    stockEntryInitState.promise = (async () => {
      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS stock_entry (
          id TEXT PRIMARY KEY,
          company_id TEXT NOT NULL,
          invoice_id TEXT NOT NULL,
          invoice_number TEXT,
          supplier_name TEXT,
          supplier_cnpj TEXT,
          issue_date TIMESTAMPTZ,
          total_value DOUBLE PRECISION,
          total_items INTEGER DEFAULT 0,
          matched_items INTEGER DEFAULT 0,
          status TEXT NOT NULL DEFAULT 'pending',
          registered_at TIMESTAMPTZ,
          registered_by TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          UNIQUE (company_id, invoice_id)
        )
      `);

      await prisma.$executeRawUnsafe(`
        CREATE INDEX IF NOT EXISTS stock_entry_company_idx
        ON stock_entry (company_id)
      `);

      await prisma.$executeRawUnsafe(`
        CREATE INDEX IF NOT EXISTS stock_entry_company_status_idx
        ON stock_entry (company_id, status)
      `);

      // Fiscal totals columns (E509 pattern)
      const fiscalCols = [
        'emitter_city TEXT',
        'emitter_state TEXT',
        'access_key TEXT',
        'cfop TEXT',
        'tot_vprod DOUBLE PRECISION',
        'tot_vdesc DOUBLE PRECISION',
        'tot_vbc DOUBLE PRECISION',
        'tot_vicms DOUBLE PRECISION',
        'tot_vbc_st DOUBLE PRECISION',
        'tot_vicms_st DOUBLE PRECISION',
        'tot_vfrete DOUBLE PRECISION',
        'tot_vseg DOUBLE PRECISION',
        'tot_voutro DOUBLE PRECISION',
        'tot_vipi DOUBLE PRECISION',
        'tot_vpis DOUBLE PRECISION',
        'tot_vcofins DOUBLE PRECISION',
        'tot_vfcp DOUBLE PRECISION',
        'tot_vnf DOUBLE PRECISION',
      ];
      for (const col of fiscalCols) {
        await prisma.$executeRawUnsafe(
          `ALTER TABLE stock_entry ADD COLUMN IF NOT EXISTS ${col}`
        );
      }

      // nfe_entry_item table (1 row per lot, E509 pattern)
      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS nfe_entry_item (
          id SERIAL PRIMARY KEY,
          stock_entry_id TEXT NOT NULL,
          company_id TEXT NOT NULL,
          invoice_id TEXT NOT NULL,

          item_number INTEGER NOT NULL,
          supplier_code TEXT,
          supplier_description TEXT,
          ncm TEXT,
          cfop TEXT,
          cest TEXT,
          ean TEXT,
          anvisa TEXT,
          unit TEXT,

          registry_id TEXT,
          codigo_interno TEXT,
          product_name TEXT,
          manufacturer TEXT,
          product_type TEXT,
          product_subtype TEXT,

          quantity DOUBLE PRECISION DEFAULT 0,
          unit_price DOUBLE PRECISION DEFAULT 0,
          total_value_gross DOUBLE PRECISION DEFAULT 0,
          item_discount DOUBLE PRECISION DEFAULT 0,
          total_value_net DOUBLE PRECISION DEFAULT 0,

          origem TEXT,
          cst_icms TEXT,
          base_icms DOUBLE PRECISION,
          aliq_icms DOUBLE PRECISION,
          valor_icms DOUBLE PRECISION,
          base_icms_st DOUBLE PRECISION,
          valor_icms_st DOUBLE PRECISION,
          cst_ipi TEXT,
          aliq_ipi DOUBLE PRECISION,
          base_ipi DOUBLE PRECISION,
          valor_ipi DOUBLE PRECISION,
          cst_pis TEXT,
          aliq_pis DOUBLE PRECISION,
          base_pis DOUBLE PRECISION,
          valor_pis DOUBLE PRECISION,
          cst_cofins TEXT,
          aliq_cofins DOUBLE PRECISION,
          base_cofins DOUBLE PRECISION,
          valor_cofins DOUBLE PRECISION,
          valor_fcp DOUBLE PRECISION,

          rateio_frete DOUBLE PRECISION DEFAULT 0,
          rateio_seguro DOUBLE PRECISION DEFAULT 0,
          rateio_outras_desp DOUBLE PRECISION DEFAULT 0,
          rateio_desconto DOUBLE PRECISION DEFAULT 0,

          lot TEXT,
          lot_serial TEXT,
          lot_quantity DOUBLE PRECISION,
          lot_fabrication TEXT,
          lot_expiry TEXT,

          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);

      await prisma.$executeRawUnsafe(`
        CREATE INDEX IF NOT EXISTS nfe_entry_item_stock_entry_idx
        ON nfe_entry_item (stock_entry_id)
      `);
      await prisma.$executeRawUnsafe(`
        CREATE INDEX IF NOT EXISTS nfe_entry_item_company_invoice_idx
        ON nfe_entry_item (company_id, invoice_id)
      `);
      await prisma.$executeRawUnsafe(`
        CREATE INDEX IF NOT EXISTS nfe_entry_item_company_codigo_idx
        ON nfe_entry_item (company_id, codigo_interno)
      `);

      await prisma.$executeRawUnsafe(
        `ALTER TABLE nfe_entry_item ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ`
      );
    })().catch((error) => {
      stockEntryInitState.promise = undefined;
      throw error;
    });
  }
  await stockEntryInitState.promise;
}

export async function getStockEntryByInvoiceId(companyId: string, invoiceId: string): Promise<StockEntryRow | null> {
  await ensureStockEntryTable();
  const rows = await prisma.$queryRawUnsafe<StockEntryDbRow[]>(
    `SELECT * FROM stock_entry WHERE company_id = $1 AND invoice_id = $2 LIMIT 1`,
    companyId, invoiceId
  );
  return rows.length > 0 ? mapStockEntryRow(rows[0]) : null;
}

export async function getStockEntriesByInvoiceIds(companyId: string, invoiceIds: string[]): Promise<Map<string, StockEntryRow>> {
  await ensureStockEntryTable();
  if (invoiceIds.length === 0) return new Map();
  const placeholders = invoiceIds.map((_, i) => `$${i + 2}`).join(', ');
  const rows = await prisma.$queryRawUnsafe<StockEntryDbRow[]>(
    `SELECT * FROM stock_entry WHERE company_id = $1 AND invoice_id IN (${placeholders})`,
    companyId, ...invoiceIds
  );
  const map = new Map<string, StockEntryRow>();
  for (const row of rows) {
    const entry = mapStockEntryRow(row);
    map.set(entry.invoiceId, entry);
  }
  return map;
}

export async function upsertStockEntry(input: UpsertStockEntryInput): Promise<StockEntryRow> {
  await ensureStockEntryTable();
  const id = randomUUID();
  const now = new Date();
  const registeredAt = input.status === 'registered' ? now : null;

  await prisma.$executeRawUnsafe(
    `INSERT INTO stock_entry (id, company_id, invoice_id, invoice_number, supplier_name, supplier_cnpj, issue_date, total_value, total_items, matched_items, status, registered_at, registered_by, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
     ON CONFLICT (company_id, invoice_id) DO UPDATE SET
       invoice_number = COALESCE(EXCLUDED.invoice_number, stock_entry.invoice_number),
       supplier_name = COALESCE(EXCLUDED.supplier_name, stock_entry.supplier_name),
       supplier_cnpj = COALESCE(EXCLUDED.supplier_cnpj, stock_entry.supplier_cnpj),
       issue_date = COALESCE(EXCLUDED.issue_date, stock_entry.issue_date),
       total_value = COALESCE(EXCLUDED.total_value, stock_entry.total_value),
       total_items = EXCLUDED.total_items,
       matched_items = EXCLUDED.matched_items,
       status = EXCLUDED.status,
       registered_at = EXCLUDED.registered_at,
       registered_by = EXCLUDED.registered_by,
       updated_at = NOW()`,
    id, input.companyId, input.invoiceId,
    input.invoiceNumber ?? null, input.supplierName ?? null, input.supplierCnpj ?? null,
    input.issueDate ?? null, input.totalValue ?? null,
    input.totalItems ?? 0, input.matchedItems ?? 0,
    input.status ?? 'pending', registeredAt, input.registeredBy ?? null,
    now, now
  );

  const entry = await getStockEntryByInvoiceId(input.companyId, input.invoiceId);
  return entry!;
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
  data: FiscalTotalsInput
) {
  await ensureStockEntryTable();
  await prisma.$executeRawUnsafe(
    `UPDATE stock_entry SET
      emitter_city = $3, emitter_state = $4, access_key = $5, cfop = $6,
      tot_vprod = $7, tot_vdesc = $8, tot_vbc = $9, tot_vicms = $10,
      tot_vbc_st = $11, tot_vicms_st = $12, tot_vfrete = $13, tot_vseg = $14,
      tot_voutro = $15, tot_vipi = $16, tot_vpis = $17, tot_vcofins = $18,
      tot_vfcp = $19, tot_vnf = $20, updated_at = NOW()
    WHERE company_id = $1 AND invoice_id = $2`,
    companyId, invoiceId,
    data.emitterCity ?? null, data.emitterState ?? null,
    data.accessKey ?? null, data.cfop ?? null,
    data.totVprod ?? null, data.totVdesc ?? null,
    data.totVbc ?? null, data.totVicms ?? null,
    data.totVbcSt ?? null, data.totVicmsSt ?? null,
    data.totVfrete ?? null, data.totVseg ?? null,
    data.totVoutro ?? null, data.totVipi ?? null,
    data.totVpis ?? null, data.totVcofins ?? null,
    data.totVfcp ?? null, data.totVnf ?? null
  );
}

// ── nfe_entry_item CRUD ──

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

type PrismaLike = Pick<typeof prisma, '$executeRawUnsafe' | '$queryRawUnsafe'>;

export async function insertNfeEntryItems(stockEntryId: string, items: NfeEntryItemInput[], tx?: PrismaLike) {
  await ensureStockEntryTable();
  if (items.length === 0) return;

  const run = async (db: PrismaLike) => {
    await db.$executeRawUnsafe(
      `DELETE FROM nfe_entry_item WHERE stock_entry_id = $1`,
      stockEntryId
    );

    const ITEM_COLUMNS = [
    'stock_entry_id', 'company_id', 'invoice_id', 'item_number',
    'supplier_code', 'supplier_description',
    'ncm', 'cfop', 'cest', 'ean', 'anvisa', 'unit',
    'registry_id', 'codigo_interno', 'product_name', 'manufacturer', 'product_type', 'product_subtype',
    'quantity', 'unit_price', 'total_value_gross', 'item_discount', 'total_value_net',
    'origem', 'cst_icms', 'base_icms', 'aliq_icms', 'valor_icms',
    'base_icms_st', 'valor_icms_st',
    'cst_ipi', 'aliq_ipi', 'base_ipi', 'valor_ipi',
    'cst_pis', 'aliq_pis', 'base_pis', 'valor_pis',
    'cst_cofins', 'aliq_cofins', 'base_cofins', 'valor_cofins',
    'valor_fcp',
    'rateio_frete', 'rateio_seguro', 'rateio_outras_desp', 'rateio_desconto',
    'lot', 'lot_serial', 'lot_quantity', 'lot_fabrication', 'lot_expiry',
  ] as const;
  const COLS_PER_ROW = ITEM_COLUMNS.length;
  const BATCH = 50;
  for (let i = 0; i < items.length; i += BATCH) {
    const batch = items.slice(i, i + BATCH);
    const values: any[] = [];
    const placeholders: string[] = [];

    for (let j = 0; j < batch.length; j++) {
      const item = batch[j];
      const offset = j * COLS_PER_ROW;
      const p = (n: number) => `$${offset + n}`;
      placeholders.push(`(${[...Array(COLS_PER_ROW)].map((_, k) => p(k + 1)).join(',')})`);
      values.push(
        item.stockEntryId, item.companyId, item.invoiceId, item.itemNumber,
        item.supplierCode ?? null, item.supplierDescription ?? null,
        item.ncm ?? null, item.cfop ?? null, item.cest ?? null,
        item.ean ?? null, item.anvisa ?? null, item.unit ?? null,
        item.registryId ?? null, item.codigoInterno ?? null,
        item.productName ?? null, item.manufacturer ?? null,
        item.productType ?? null, item.productSubtype ?? null,
        item.quantity ?? 0, item.unitPrice ?? 0,
        item.totalValueGross ?? 0, item.itemDiscount ?? 0, item.totalValueNet ?? 0,
        item.origem ?? null, item.cstIcms ?? null,
        item.baseIcms ?? null, item.aliqIcms ?? null, item.valorIcms ?? null,
        item.baseIcmsSt ?? null, item.valorIcmsSt ?? null,
        item.cstIpi ?? null, item.aliqIpi ?? null, item.baseIpi ?? null, item.valorIpi ?? null,
        item.cstPis ?? null, item.aliqPis ?? null, item.basePis ?? null, item.valorPis ?? null,
        item.cstCofins ?? null, item.aliqCofins ?? null, item.baseCofins ?? null, item.valorCofins ?? null,
        item.valorFcp ?? null,
        item.rateioFrete ?? 0, item.rateioSeguro ?? 0,
        item.rateioOutrasDesp ?? 0, item.rateioDesconto ?? 0,
        item.lot ?? null, item.lotSerial ?? null, item.lotQuantity ?? null,
        item.lotFabrication ?? null, item.lotExpiry ?? null,
      );
    }

    await db.$executeRawUnsafe(
      `INSERT INTO nfe_entry_item (${ITEM_COLUMNS.join(', ')}) VALUES ${placeholders.join(',')}`,
      ...values
    );
  }
  };

  if (tx) {
    await run(tx);
  } else {
    await prisma.$transaction(async (txn) => run(txn));
  }
}

export async function getNfeEntryItemsByInvoice(companyId: string, invoiceId: string): Promise<NfeEntryItemRow[]> {
  await ensureStockEntryTable();
  return prisma.$queryRawUnsafe<NfeEntryItemRow[]>(
    `SELECT * FROM nfe_entry_item
     WHERE company_id = $1 AND invoice_id = $2
     ORDER BY item_number, id`,
    companyId, invoiceId
  );
}

export async function updateNfeEntryItemLot(
  companyId: string,
  invoiceId: string,
  itemId: number,
  data: { lot?: string | null; lotExpiry?: string | null; lotQuantity?: number | null }
): Promise<NfeEntryItemRow | null> {
  await ensureStockEntryTable();
  // If item quantity is 1, always force lot_quantity = 1
  let effQty = data.lotQuantity ?? null;
  if (effQty == null) {
    const item = await prisma.$queryRawUnsafe<NfeEntryItemRow[]>(
      `SELECT quantity FROM nfe_entry_item WHERE id = $1 AND company_id = $2 LIMIT 1`,
      itemId, companyId
    );
    if (item.length > 0 && Number(item[0].quantity) === 1) effQty = 1;
  }
  const rows = await prisma.$queryRawUnsafe<NfeEntryItemRow[]>(
    `UPDATE nfe_entry_item
     SET lot = $4,
         lot_expiry = $5,
         lot_quantity = $6,
         updated_at = NOW()
     WHERE id = $1 AND company_id = $2 AND invoice_id = $3
     RETURNING *`,
    itemId, companyId, invoiceId,
    data.lot ?? null, data.lotExpiry ?? null, effQty
  );
  return rows.length > 0 ? rows[0] : null;
}

/** Clone an existing nfe_entry_item row with new lot data (for splitting an item into multiple lots) */
export async function cloneNfeEntryItemBatch(
  companyId: string,
  invoiceId: string,
  sourceItemId: number,
  data: { lot: string; lotExpiry?: string | null; lotQuantity?: number | null }
): Promise<NfeEntryItemRow | null> {
  await ensureStockEntryTable();
  const rows = await prisma.$queryRawUnsafe<NfeEntryItemRow[]>(
    `INSERT INTO nfe_entry_item (
      stock_entry_id, company_id, invoice_id, item_number,
      supplier_code, supplier_description,
      ncm, cfop, cest, ean, anvisa, unit,
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
      supplier_code, supplier_description,
      ncm, cfop, cest, ean, anvisa, unit,
      registry_id, codigo_interno, product_name, manufacturer, product_type, product_subtype,
      quantity, unit_price, total_value_gross, item_discount, total_value_net,
      origem, cst_icms, base_icms, aliq_icms, valor_icms,
      base_icms_st, valor_icms_st,
      cst_ipi, aliq_ipi, base_ipi, valor_ipi,
      cst_pis, aliq_pis, base_pis, valor_pis,
      cst_cofins, aliq_cofins, base_cofins, valor_cofins,
      valor_fcp,
      rateio_frete, rateio_seguro, rateio_outras_desp, rateio_desconto,
      $4, lot_serial, $6, lot_fabrication, $5
    FROM nfe_entry_item
    WHERE id = $1 AND company_id = $2 AND invoice_id = $3
    RETURNING *`,
    sourceItemId, companyId, invoiceId,
    data.lot,
    data.lotExpiry ?? null,
    data.lotQuantity ?? null,
  );
  return rows.length > 0 ? rows[0] : null;
}

/** Delete a batch row — only allowed if the item has more than one row (atomic CTE) */
export async function deleteNfeEntryItemBatch(
  companyId: string,
  invoiceId: string,
  batchRowId: number,
): Promise<boolean> {
  await ensureStockEntryTable();
  const deleted = await prisma.$executeRawUnsafe(
    `WITH target AS (
       SELECT id, item_number FROM nfe_entry_item
       WHERE id = $1 AND company_id = $2 AND invoice_id = $3
     ),
     sibling_count AS (
       SELECT COUNT(*)::int AS cnt
       FROM nfe_entry_item
       WHERE company_id = $2 AND invoice_id = $3
         AND item_number = (SELECT item_number FROM target)
     )
     DELETE FROM nfe_entry_item
     WHERE id = (SELECT id FROM target)
       AND (SELECT cnt FROM sibling_count) > 1`,
    batchRowId, companyId, invoiceId
  );
  return deleted > 0;
}

export interface PendencyCounts {
  invoiceId: string;
  unmatchedCount: number;
  missingLotCount: number;
}

export async function getNfePendencyCounts(
  companyId: string,
  invoiceIds: string[]
): Promise<Map<string, PendencyCounts>> {
  await ensureStockEntryTable();
  if (invoiceIds.length === 0) return new Map();
  const placeholders = invoiceIds.map((_, i) => `$${i + 2}`).join(', ');
  const rows = await prisma.$queryRawUnsafe<PendencyCountsDbRow[]>(
    `SELECT invoice_id,
       COUNT(DISTINCT CASE WHEN registry_id IS NULL THEN item_number END) as unmatched_count,
       COUNT(DISTINCT CASE WHEN lot IS NULL THEN item_number END) as missing_lot_count
     FROM nfe_entry_item
     WHERE company_id = $1 AND invoice_id IN (${placeholders})
     GROUP BY invoice_id`,
    companyId, ...invoiceIds
  );
  const map = new Map<string, PendencyCounts>();
  for (const row of rows) {
    map.set(row.invoice_id, {
      invoiceId: row.invoice_id,
      unmatchedCount: Number(row.unmatched_count || 0),
      missingLotCount: Number(row.missing_lot_count || 0),
    });
  }
  return map;
}
