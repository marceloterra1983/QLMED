/**
 * Shared logic for registering an NF-e stock entry.
 * Used by POST /api/estoque/entrada-nfe and POST /api/estoque/import-e509.
 */
import prisma from '@/lib/prisma';
import { extractProductsFromXml } from '@/lib/product-aggregation';
import { upsertStockEntry, updateStockEntryFiscalTotals, insertNfeEntryItems, NfeEntryItemInput } from '@/lib/stock-entry-store';
import { extractTaxTotals, extractItemTaxes, extractEmitterLocation } from '@/lib/parse-invoice-tax';
import { normalizeCode, stripNonAlnum } from '@/lib/code-utils';

export interface LotOverride {
  lot: string;
  expiry: string | null;
  quantity: number | null;
}

interface RegisterResult {
  entryId: string;
  totalItems: number;
  matchedItems: number;
}

/**
 * Register a stock entry for an invoice: extract products from XML,
 * match against product registry, persist fiscal totals and items.
 * Idempotent (upserts).
 */
export async function registerInvoiceEntry(
  companyId: string,
  invoiceId: string,
  userId: string,
  lotOverrides?: Map<number, LotOverride[]>,
): Promise<RegisterResult | null> {

  const invoice = await prisma.invoice.findFirst({
    where: { id: invoiceId, companyId },
    select: {
      id: true, number: true, senderName: true, senderCnpj: true,
      issueDate: true, totalValue: true, accessKey: true, xmlContent: true,
    },
  });

  if (!invoice?.xmlContent) return null;

  const products = await extractProductsFromXml(invoice.xmlContent);
  const allRegistryRows = await prisma.productRegistry.findMany({
    where: {
      companyId,
      AND: [
        { code: { not: '' } },
        { codigo: { not: '' } },
      ],
    },
    select: {
      id: true,
      codigo: true,
      code: true,
      description: true,
      shortName: true,
      manufacturerShortName: true,
      productType: true,
      productSubtype: true,
    },
  });

  type RegRow = (typeof allRegistryRows)[number];
  const registryByCode = new Map<string, RegRow>();
  const registryByAlnum = new Map<string, RegRow>();
  for (const row of allRegistryRows) {
    if (!row.code || !row.codigo) continue;
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

  const findRegistry = (code: string | null | undefined) => {
    if (!code) return undefined;
    const norm = normalizeCode(code);
    let reg = registryByCode.get(norm);
    if (!reg) {
      const alnum = stripNonAlnum(norm);
      if (alnum) reg = registryByAlnum.get(alnum);
    }
    return reg;
  };

  const totalItems = products.length;
  const matchedItems = products.filter((p) => !!findRegistry(p.code)).length;
  const status = totalItems === matchedItems ? 'registered' : 'partial';

  const entry = await upsertStockEntry({
    companyId,
    invoiceId: invoice.id,
    invoiceNumber: invoice.number,
    supplierName: invoice.senderName,
    supplierCnpj: invoice.senderCnpj,
    issueDate: invoice.issueDate,
    totalValue: Number(invoice.totalValue),
    totalItems,
    matchedItems,
    status,
    registeredBy: userId,
  });

  const [taxTotals, itemTaxes, emitterLoc] = await Promise.all([
    extractTaxTotals(invoice.xmlContent!),
    extractItemTaxes(invoice.xmlContent!),
    extractEmitterLocation(invoice.xmlContent!),
  ]);

  const firstCfop = itemTaxes.length > 0 ? itemTaxes[0].cfop : null;
  await updateStockEntryFiscalTotals(companyId, invoice.id, {
    emitterCity: emitterLoc.city,
    emitterState: emitterLoc.state,
    accessKey: invoice.accessKey ?? null,
    cfop: firstCfop,
    totVprod: taxTotals?.vprod ?? null,
    totVdesc: taxTotals?.vdesc ?? null,
    totVbc: taxTotals?.vbc ?? null,
    totVicms: taxTotals?.vicms ?? null,
    totVbcSt: taxTotals?.vbcSt ?? null,
    totVicmsSt: taxTotals?.vicmsSt ?? null,
    totVfrete: taxTotals?.vfrete ?? null,
    totVseg: taxTotals?.vseg ?? null,
    totVoutro: taxTotals?.voutro ?? null,
    totVipi: taxTotals?.vipi ?? null,
    totVpis: taxTotals?.vpis ?? null,
    totVcofins: taxTotals?.vcofins ?? null,
    totVfcp: taxTotals?.vfcp ?? null,
    totVnf: taxTotals?.vnf ?? null,
  });

  const totalVProd = taxTotals?.vprod || 0;
  const nfeItems: NfeEntryItemInput[] = [];

  for (let i = 0; i < products.length; i++) {
    const prod = products[i];
    const tax = itemTaxes.find((t) => t.itemNumber === i + 1) || itemTaxes[i];
    const registry = findRegistry(prod.code);

    const itemVProd = tax?.totalValue ?? prod.totalValue ?? 0;
    const weight = totalVProd > 0 ? itemVProd / totalVProd : 0;
    const itemDiscount = tax?.itemDiscount ?? 0;

    const baseItem: Omit<NfeEntryItemInput, 'lot' | 'lotSerial' | 'lotQuantity' | 'lotFabrication' | 'lotExpiry'> = {
      stockEntryId: entry.id,
      companyId,
      invoiceId: invoice.id,
      itemNumber: i + 1,
      supplierCode: prod.code || null,
      supplierDescription: prod.description || null,
      ncm: prod.ncm || null,
      cfop: tax?.cfop || null,
      cest: tax?.cest || null,
      ean: prod.ean || null,
      anvisa: prod.anvisa || null,
      unit: prod.unit || null,
      registryId: registry?.id ?? null,
      codigoInterno: registry?.codigo ?? null,
      productName: registry?.shortName ?? registry?.description ?? null,
      manufacturer: registry?.manufacturerShortName ?? null,
      productType: registry?.productType ?? null,
      productSubtype: registry?.productSubtype ?? null,
      quantity: tax?.quantity ?? prod.quantity ?? 0,
      unitPrice: tax?.unitPrice ?? prod.unitPrice ?? 0,
      totalValueGross: itemVProd,
      itemDiscount,
      totalValueNet: itemVProd - itemDiscount,
      origem: tax?.origem ?? null,
      cstIcms: tax?.cstIcms ?? null,
      baseIcms: tax?.baseIcms ?? null,
      aliqIcms: tax?.aliqIcms ?? null,
      valorIcms: tax?.valorIcms ?? null,
      baseIcmsSt: tax?.baseIcmsSt ?? null,
      valorIcmsSt: tax?.valorIcmsSt ?? null,
      cstIpi: tax?.cstIpi ?? null,
      aliqIpi: tax?.aliqIpi ?? null,
      baseIpi: tax?.baseIpi ?? null,
      valorIpi: tax?.valorIpi ?? null,
      cstPis: tax?.cstPis ?? null,
      aliqPis: tax?.aliqPis ?? null,
      basePis: tax?.basePis ?? null,
      valorPis: tax?.valorPis ?? null,
      cstCofins: tax?.cstCofins ?? null,
      aliqCofins: tax?.aliqCofins ?? null,
      baseCofins: tax?.baseCofins ?? null,
      valorCofins: tax?.valorCofins ?? null,
      valorFcp: tax?.valorFcp ?? null,
      rateioFrete: (taxTotals?.vfrete ?? 0) * weight,
      rateioSeguro: (taxTotals?.vseg ?? 0) * weight,
      rateioOutrasDesp: (taxTotals?.voutro ?? 0) * weight,
      rateioDesconto: (taxTotals?.vdesc ?? 0) * weight,
    };

    const itemNumber = i + 1;
    const overrideLots = lotOverrides?.get(itemNumber);

    if (overrideLots && overrideLots.length > 0) {
      // Use lot data provided by the user (edited before registration)
      for (const ov of overrideLots) {
        nfeItems.push({
          ...baseItem,
          lot: ov.lot || null,
          lotSerial: null,
          lotQuantity: ov.quantity ?? (baseItem.quantity === 1 ? 1 : null),
          lotFabrication: null,
          lotExpiry: ov.expiry || null,
        });
      }
    } else if (prod.batches && prod.batches.length > 0) {
      for (const batch of prod.batches) {
        nfeItems.push({
          ...baseItem,
          lot: batch.lot || null,
          lotSerial: batch.serial || null,
          lotQuantity: batch.quantity ?? (baseItem.quantity === 1 ? 1 : null),
          lotFabrication: batch.fabrication || null,
          lotExpiry: batch.expiry || null,
        });
      }
    } else {
      nfeItems.push({
        ...baseItem,
        lot: null,
        lotSerial: null,
        lotQuantity: baseItem.quantity === 1 ? 1 : null,
        lotFabrication: null,
        lotExpiry: null,
      });
    }
  }

  await insertNfeEntryItems(entry.id, nfeItems);

  return { entryId: entry.id, totalItems, matchedItems };
}
