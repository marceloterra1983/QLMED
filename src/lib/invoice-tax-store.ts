import { randomUUID } from 'crypto';
import prisma from '@/lib/prisma';

// ── Types ──

export interface InvoiceTaxTotals {
  invoiceId: string;
  companyId: string;
  vbc: number | null;
  vicms: number | null;
  vpis: number | null;
  vcofins: number | null;
  vipi: number | null;
  vfrete: number | null;
  vseg: number | null;
  vdesc: number | null;
  voutro: number | null;
  vtottrib: number | null;
  vfcp: number | null;
  vicmsSt: number | null;
  computedAt: Date;
}

export interface InvoiceItemTax {
  id: string;
  invoiceId: string;
  companyId: string;
  itemNumber: number | null;
  productCode: string | null;
  productDescription: string | null;
  ncm: string | null;
  cfop: string | null;
  cest: string | null;
  origem: string | null;
  quantity: number | null;
  unitPrice: number | null;
  totalValue: number | null;
  cstIcms: string | null;
  baseIcms: number | null;
  aliqIcms: number | null;
  valorIcms: number | null;
  cstPis: string | null;
  aliqPis: number | null;
  valorPis: number | null;
  cstCofins: string | null;
  aliqCofins: number | null;
  valorCofins: number | null;
  aliqIpi: number | null;
  valorIpi: number | null;
  valorFcp: number | null;
}

// ── DB row interfaces (snake_case, matching SQL columns) ──

interface InvoiceTaxTotalsDbRow {
  invoice_id: string;
  company_id: string;
  vbc: number | null;
  vicms: number | null;
  vpis: number | null;
  vcofins: number | null;
  vipi: number | null;
  vfrete: number | null;
  vseg: number | null;
  vdesc: number | null;
  voutro: number | null;
  vtottrib: number | null;
  vfcp: number | null;
  vicms_st: number | null;
  computed_at: string | Date;
}

interface InvoiceItemTaxDbRow {
  id: string;
  invoice_id: string;
  company_id: string;
  item_number: number | null;
  product_code: string | null;
  product_description: string | null;
  ncm: string | null;
  cfop: string | null;
  cest: string | null;
  origem: string | null;
  quantity: number | null;
  unit_price: number | null;
  total_value: number | null;
  cst_icms: string | null;
  base_icms: number | null;
  aliq_icms: number | null;
  valor_icms: number | null;
  cst_pis: string | null;
  aliq_pis: number | null;
  valor_pis: number | null;
  cst_cofins: string | null;
  aliq_cofins: number | null;
  valor_cofins: number | null;
  aliq_ipi: number | null;
  valor_ipi: number | null;
  valor_fcp: number | null;
}

interface HasTaxDataRow {
  '?column?': number;
}

// ── Table init ──

type InitState = { promise?: Promise<void> };
const globalForTax = globalThis as unknown as { invoiceTaxInitState?: InitState };
if (!globalForTax.invoiceTaxInitState) globalForTax.invoiceTaxInitState = {};
const initState = globalForTax.invoiceTaxInitState;

export async function ensureInvoiceTaxTables(): Promise<void> {
  if (!initState.promise) {
    initState.promise = (async () => {
      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS invoice_tax_totals (
          invoice_id TEXT PRIMARY KEY,
          company_id TEXT NOT NULL,
          vbc DOUBLE PRECISION,
          vicms DOUBLE PRECISION,
          vpis DOUBLE PRECISION,
          vcofins DOUBLE PRECISION,
          vipi DOUBLE PRECISION,
          vfrete DOUBLE PRECISION,
          vseg DOUBLE PRECISION,
          vdesc DOUBLE PRECISION,
          voutro DOUBLE PRECISION,
          vtottrib DOUBLE PRECISION,
          vfcp DOUBLE PRECISION,
          vicms_st DOUBLE PRECISION,
          computed_at TIMESTAMPTZ DEFAULT NOW()
        )
      `);
      await prisma.$executeRawUnsafe(`
        CREATE INDEX IF NOT EXISTS idx_tax_totals_company
        ON invoice_tax_totals(company_id)
      `);

      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS invoice_item_tax (
          id TEXT PRIMARY KEY,
          invoice_id TEXT NOT NULL,
          company_id TEXT NOT NULL,
          item_number INTEGER,
          product_code TEXT,
          product_description TEXT,
          ncm TEXT,
          cfop TEXT,
          cest TEXT,
          origem TEXT,
          quantity DOUBLE PRECISION,
          unit_price DOUBLE PRECISION,
          total_value DOUBLE PRECISION,
          cst_icms TEXT,
          base_icms DOUBLE PRECISION,
          aliq_icms DOUBLE PRECISION,
          valor_icms DOUBLE PRECISION,
          cst_pis TEXT,
          aliq_pis DOUBLE PRECISION,
          valor_pis DOUBLE PRECISION,
          cst_cofins TEXT,
          aliq_cofins DOUBLE PRECISION,
          valor_cofins DOUBLE PRECISION,
          aliq_ipi DOUBLE PRECISION,
          valor_ipi DOUBLE PRECISION,
          valor_fcp DOUBLE PRECISION
        )
      `);
      await prisma.$executeRawUnsafe(`
        CREATE INDEX IF NOT EXISTS idx_item_tax_invoice
        ON invoice_item_tax(invoice_id)
      `);
      await prisma.$executeRawUnsafe(`
        CREATE INDEX IF NOT EXISTS idx_item_tax_company_cfop
        ON invoice_item_tax(company_id, cfop)
      `);
    })().catch((err) => {
      initState.promise = undefined;
      throw err;
    });
  }
  return initState.promise;
}

// ── Upsert totals ──

export async function upsertTaxTotals(data: {
  invoiceId: string;
  companyId: string;
  vbc: number | null;
  vicms: number | null;
  vpis: number | null;
  vcofins: number | null;
  vipi: number | null;
  vfrete: number | null;
  vseg: number | null;
  vdesc: number | null;
  voutro: number | null;
  vtottrib: number | null;
  vfcp: number | null;
  vicmsSt: number | null;
}): Promise<void> {
  await ensureInvoiceTaxTables();
  await prisma.$executeRawUnsafe(
    `INSERT INTO invoice_tax_totals (
      invoice_id, company_id, vbc, vicms, vpis, vcofins, vipi,
      vfrete, vseg, vdesc, voutro, vtottrib, vfcp, vicms_st, computed_at
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,NOW())
    ON CONFLICT (invoice_id) DO UPDATE SET
      company_id = EXCLUDED.company_id,
      vbc = EXCLUDED.vbc, vicms = EXCLUDED.vicms,
      vpis = EXCLUDED.vpis, vcofins = EXCLUDED.vcofins,
      vipi = EXCLUDED.vipi, vfrete = EXCLUDED.vfrete,
      vseg = EXCLUDED.vseg, vdesc = EXCLUDED.vdesc,
      voutro = EXCLUDED.voutro, vtottrib = EXCLUDED.vtottrib,
      vfcp = EXCLUDED.vfcp, vicms_st = EXCLUDED.vicms_st,
      computed_at = NOW()`,
    data.invoiceId, data.companyId,
    data.vbc, data.vicms, data.vpis, data.vcofins, data.vipi,
    data.vfrete, data.vseg, data.vdesc, data.voutro, data.vtottrib,
    data.vfcp, data.vicmsSt,
  );
}

// ── Upsert item taxes (delete+insert for the invoice) ──

export async function upsertItemTaxes(
  invoiceId: string,
  companyId: string,
  items: Array<Omit<InvoiceItemTax, 'id' | 'invoiceId' | 'companyId'>>,
): Promise<void> {
  await ensureInvoiceTaxTables();

  // Delete existing items and re-insert atomically in a single transaction
  await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(
      `DELETE FROM invoice_item_tax WHERE invoice_id = $1`,
      invoiceId,
    );

    for (const item of items) {
      const id = randomUUID();
      await tx.$executeRawUnsafe(
        `INSERT INTO invoice_item_tax (
          id, invoice_id, company_id, item_number, product_code, product_description,
          ncm, cfop, cest, origem, quantity, unit_price, total_value,
          cst_icms, base_icms, aliq_icms, valor_icms,
          cst_pis, aliq_pis, valor_pis,
          cst_cofins, aliq_cofins, valor_cofins,
          aliq_ipi, valor_ipi, valor_fcp
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26)`,
        id, invoiceId, companyId,
        item.itemNumber, item.productCode, item.productDescription,
        item.ncm, item.cfop, item.cest, item.origem,
        item.quantity, item.unitPrice, item.totalValue,
        item.cstIcms, item.baseIcms, item.aliqIcms, item.valorIcms,
        item.cstPis, item.aliqPis, item.valorPis,
        item.cstCofins, item.aliqCofins, item.valorCofins,
        item.aliqIpi, item.valorIpi, item.valorFcp,
      );
    }
  });
}

// ── Queries ──

export async function getTaxTotals(invoiceId: string): Promise<InvoiceTaxTotals | null> {
  await ensureInvoiceTaxTables();
  const rows = await prisma.$queryRawUnsafe<InvoiceTaxTotalsDbRow[]>(
    `SELECT * FROM invoice_tax_totals WHERE invoice_id = $1`,
    invoiceId,
  );
  if (rows.length === 0) return null;
  const r = rows[0];
  return {
    invoiceId: r.invoice_id,
    companyId: r.company_id,
    vbc: r.vbc, vicms: r.vicms, vpis: r.vpis, vcofins: r.vcofins,
    vipi: r.vipi, vfrete: r.vfrete, vseg: r.vseg, vdesc: r.vdesc,
    voutro: r.voutro, vtottrib: r.vtottrib, vfcp: r.vfcp, vicmsSt: r.vicms_st,
    computedAt: new Date(r.computed_at),
  };
}

export async function getItemTaxes(invoiceId: string): Promise<InvoiceItemTax[]> {
  await ensureInvoiceTaxTables();
  const rows = await prisma.$queryRawUnsafe<InvoiceItemTaxDbRow[]>(
    `SELECT * FROM invoice_item_tax WHERE invoice_id = $1 ORDER BY item_number`,
    invoiceId,
  );
  return rows.map((r: InvoiceItemTaxDbRow) => ({
    id: r.id,
    invoiceId: r.invoice_id,
    companyId: r.company_id,
    itemNumber: r.item_number,
    productCode: r.product_code,
    productDescription: r.product_description,
    ncm: r.ncm, cfop: r.cfop, cest: r.cest, origem: r.origem,
    quantity: r.quantity, unitPrice: r.unit_price, totalValue: r.total_value,
    cstIcms: r.cst_icms, baseIcms: r.base_icms, aliqIcms: r.aliq_icms, valorIcms: r.valor_icms,
    cstPis: r.cst_pis, aliqPis: r.aliq_pis, valorPis: r.valor_pis,
    cstCofins: r.cst_cofins, aliqCofins: r.aliq_cofins, valorCofins: r.valor_cofins,
    aliqIpi: r.aliq_ipi, valorIpi: r.valor_ipi, valorFcp: r.valor_fcp,
  }));
}

export async function hasInvoiceTaxData(invoiceId: string): Promise<boolean> {
  await ensureInvoiceTaxTables();
  const rows = await prisma.$queryRawUnsafe<HasTaxDataRow[]>(
    `SELECT 1 FROM invoice_tax_totals WHERE invoice_id = $1 LIMIT 1`,
    invoiceId,
  );
  return rows.length > 0;
}
