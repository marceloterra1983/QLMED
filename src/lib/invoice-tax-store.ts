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

// invoice_tax_totals / invoice_item_tax are schema-owned (Phase 11 baseline).
// No CREATE/ALTER at runtime.

export async function ensureInvoiceTaxTables(): Promise<void> {
  return;
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
  const now = new Date();
  await prisma.invoiceTaxTotals.upsert({
    where: { invoiceId: data.invoiceId },
    create: {
      invoiceId: data.invoiceId,
      companyId: data.companyId,
      vbc: data.vbc,
      vicms: data.vicms,
      vpis: data.vpis,
      vcofins: data.vcofins,
      vipi: data.vipi,
      vfrete: data.vfrete,
      vseg: data.vseg,
      vdesc: data.vdesc,
      voutro: data.voutro,
      vtottrib: data.vtottrib,
      vfcp: data.vfcp,
      vicmsSt: data.vicmsSt,
      computedAt: now,
    },
    update: {
      companyId: data.companyId,
      vbc: data.vbc,
      vicms: data.vicms,
      vpis: data.vpis,
      vcofins: data.vcofins,
      vipi: data.vipi,
      vfrete: data.vfrete,
      vseg: data.vseg,
      vdesc: data.vdesc,
      voutro: data.voutro,
      vtottrib: data.vtottrib,
      vfcp: data.vfcp,
      vicmsSt: data.vicmsSt,
      computedAt: now,
    },
  });
}

// ── Upsert item taxes (delete+insert for the invoice) ──

export async function upsertItemTaxes(
  invoiceId: string,
  companyId: string,
  items: Array<Omit<InvoiceItemTax, 'id' | 'invoiceId' | 'companyId'>>,
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.invoiceItemTax.deleteMany({ where: { invoiceId } });

    if (items.length === 0) return;

    await tx.invoiceItemTax.createMany({
      data: items.map((item) => ({
        id: randomUUID(),
        invoiceId,
        companyId,
        itemNumber: item.itemNumber,
        productCode: item.productCode,
        productDescription: item.productDescription,
        ncm: item.ncm,
        cfop: item.cfop,
        cest: item.cest,
        origem: item.origem,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        totalValue: item.totalValue,
        cstIcms: item.cstIcms,
        baseIcms: item.baseIcms,
        aliqIcms: item.aliqIcms,
        valorIcms: item.valorIcms,
        cstPis: item.cstPis,
        aliqPis: item.aliqPis,
        valorPis: item.valorPis,
        cstCofins: item.cstCofins,
        aliqCofins: item.aliqCofins,
        valorCofins: item.valorCofins,
        aliqIpi: item.aliqIpi,
        valorIpi: item.valorIpi,
        valorFcp: item.valorFcp,
      })),
    });
  });
}

// ── Queries ──

export async function getTaxTotals(invoiceId: string): Promise<InvoiceTaxTotals | null> {
  const row = await prisma.invoiceTaxTotals.findUnique({
    where: { invoiceId },
  });
  if (!row) return null;
  return {
    invoiceId: row.invoiceId,
    companyId: row.companyId,
    vbc: row.vbc,
    vicms: row.vicms,
    vpis: row.vpis,
    vcofins: row.vcofins,
    vipi: row.vipi,
    vfrete: row.vfrete,
    vseg: row.vseg,
    vdesc: row.vdesc,
    voutro: row.voutro,
    vtottrib: row.vtottrib,
    vfcp: row.vfcp,
    vicmsSt: row.vicmsSt,
    computedAt: row.computedAt ?? new Date(0),
  };
}

export async function getItemTaxes(invoiceId: string): Promise<InvoiceItemTax[]> {
  const rows = await prisma.invoiceItemTax.findMany({
    where: { invoiceId },
    orderBy: { itemNumber: 'asc' },
  });
  return rows.map((r) => ({
    id: r.id,
    invoiceId: r.invoiceId,
    companyId: r.companyId,
    itemNumber: r.itemNumber,
    productCode: r.productCode,
    productDescription: r.productDescription,
    ncm: r.ncm,
    cfop: r.cfop,
    cest: r.cest,
    origem: r.origem,
    quantity: r.quantity,
    unitPrice: r.unitPrice,
    totalValue: r.totalValue,
    cstIcms: r.cstIcms,
    baseIcms: r.baseIcms,
    aliqIcms: r.aliqIcms,
    valorIcms: r.valorIcms,
    cstPis: r.cstPis,
    aliqPis: r.aliqPis,
    valorPis: r.valorPis,
    cstCofins: r.cstCofins,
    aliqCofins: r.aliqCofins,
    valorCofins: r.valorCofins,
    aliqIpi: r.aliqIpi,
    valorIpi: r.valorIpi,
    valorFcp: r.valorFcp,
  }));
}

export async function hasInvoiceTaxData(invoiceId: string): Promise<boolean> {
  const row = await prisma.invoiceTaxTotals.findUnique({
    where: { invoiceId },
    select: { invoiceId: true },
  });
  return row != null;
}
