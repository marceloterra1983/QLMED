/**
 * Shared contact details logic for suppliers and customers.
 * Parametrized by ContactType to avoid code duplication.
 */
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { parseXmlSafe } from '@/lib/safe-xml-parser';
import { getContactFiscal } from '@/lib/contact-fiscal-store';
import { ensureProductRegistryTable } from '@/lib/product-registry-store';
import { getCfopTagByCode } from '@/lib/cfop';
import { cleanString, ensureArray, toNumber } from '@/lib/utils';
import type { ContactType } from '@/lib/contact-shared';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_INVOICES = 500;
const MAX_PRICE_ROWS = 300;
const XML_BATCH_SIZE = 50;

const UNIT_ALIASES: Record<string, string> = {
  UNID: 'UN', UND: 'UN', UNIDADE: 'UN', UNIDADES: 'UN',
  PC: 'UN', 'PÇ': 'UN', PECA: 'UN', 'PEÇA': 'UN', PCS: 'UN',
  CAIXA: 'CX', KT: 'KIT', PR: 'PAR',
};

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const DETAILS_CONFIG = {
  supplier: {
    direction: 'received' as const,
    cnpjField: 'senderCnpj' as const,
    nameField: 'senderName' as const,
    xmlPartyPath: 'emit' as const,
    xmlAddressPrefix: 'enderEmit' as const,
    unknownLabel: 'Fornecedor não identificado',
    notFoundError: 'Fornecedor não encontrado',
    missingError: 'Fornecedor não informado',
    responseKey: 'supplier' as const,
    hasProductTypes: true,
    hasSaleFilter: false,
  },
  customer: {
    direction: 'issued' as const,
    cnpjField: 'recipientCnpj' as const,
    nameField: 'recipientName' as const,
    xmlPartyPath: 'dest' as const,
    xmlAddressPrefix: 'enderDest' as const,
    unknownLabel: 'Cliente não identificado',
    notFoundError: 'Cliente não encontrado',
    missingError: 'Cliente não informado',
    responseKey: 'customer' as const,
    hasProductTypes: false,
    hasSaleFilter: true,
  },
} as const;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function normalizeUnit(raw: string | null | undefined): string {
  const upper = (raw || '').trim().toUpperCase().replace(/\./g, '');
  return UNIT_ALIASES[upper] || upper || '-';
}

function normalizeDocument(value: string | null | undefined): string {
  return (value || '').replace(/\D/g, '');
}

async function extractContactDataFromXml(xmlContent: string, partyPath: string, addressPrefix: string) {
  try {
    const parsed = await parseXmlSafe(xmlContent);
    const nfeProc = parsed?.nfeProc || parsed?.NFe || parsed;
    const nfe = nfeProc?.NFe || parsed?.NFe || nfeProc;
    const infNFe = nfe?.infNFe || nfe;
    const party = infNFe?.[partyPath] || {};
    const address = party?.[addressPrefix] || {};

    return {
      name: cleanString(party?.xNome),
      fantasyName: cleanString(party?.xFant),
      cnpj: normalizeDocument(cleanString(party?.CNPJ) || cleanString(party?.CPF)),
      stateRegistration: cleanString(party?.IE),
      municipalRegistration: cleanString(party?.IM),
      phone: cleanString(address?.fone) || cleanString(party?.fone),
      email: cleanString(party?.email),
      address: {
        street: cleanString(address?.xLgr),
        number: cleanString(address?.nro),
        complement: cleanString(address?.xCpl),
        district: cleanString(address?.xBairro),
        city: cleanString(address?.xMun),
        state: cleanString(address?.UF),
        zipCode: cleanString(address?.CEP),
        country: cleanString(address?.xPais),
      },
    };
  } catch {
    return null;
  }
}

async function extractInvoiceDataFromXml(xmlContent: string) {
  try {
    const parsed = await parseXmlSafe(xmlContent);
    const nfeProc = parsed?.nfeProc || parsed?.NFe || parsed;
    const nfe = nfeProc?.NFe || parsed?.NFe || nfeProc;
    const infNFe = nfe?.infNFe || nfe;
    const dets = ensureArray<any>(infNFe?.det);
    const cfops = new Set<string>();
    const products = dets.map((det) => {
      const prod = det?.prod || {};
      const cfop = cleanString(prod?.CFOP);
      if (cfop) cfops.add(cfop);
      const quantity = toNumber(prod?.qCom);
      const unitPrice = toNumber(prod?.vUnCom);
      const totalValue = toNumber(prod?.vProd);
      const safeUnitPrice = unitPrice > 0 ? unitPrice : (quantity > 0 ? totalValue / quantity : 0);

      return {
        code: cleanString(prod?.cProd) || '-',
        description: cleanString(prod?.xProd) || 'Item sem descrição',
        unit: cleanString(prod?.uCom) || '-',
        quantity,
        unitPrice: safeUnitPrice,
        totalValue,
      };
    });
    const dups = ensureArray<any>(infNFe?.cobr?.dup);
    const duplicates = dups
      .map((dup) => ({
        installmentNumber: cleanString(dup?.nDup) || '-',
        dueDate: cleanString(dup?.dVenc),
        installmentValue: toNumber(dup?.vDup),
      }))
      .filter((dup) => dup.installmentNumber !== '-' || dup.dueDate || dup.installmentValue > 0);

    return { products, duplicates, cfops: Array.from(cfops) };
  } catch {
    return { products: [], duplicates: [], cfops: [] as string[] };
  }
}

function isSaleOrBonificationInvoice(cfops: string[]): boolean {
  return cfops.some((cfop) => {
    const tag = getCfopTagByCode(cfop);
    return tag === 'Venda' || tag === 'Bonificação';
  });
}

const CRT_LABELS: Record<string, string> = {
  '1': 'Simples Nacional',
  '2': 'Simples Nacional - Excesso',
  '3': 'Regime Normal',
};

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

export async function handleContactDetails(
  company: { id: string },
  cnpjParam: string | null,
  nameParam: string | null,
  metaOnly: boolean,
  contactType: ContactType,
) {
  const cfg = DETAILS_CONFIG[contactType];
  const cnpj = normalizeDocument(cnpjParam);
  const name = (nameParam || '').trim();

  if (!cnpj && !name) {
    return NextResponse.json({ error: cfg.missingError }, { status: 400 });
  }

  const baseWhere = {
    companyId: company.id,
    type: 'NFE' as const,
    direction: cfg.direction,
  };

  const metadataSelect = {
    id: true,
    accessKey: true,
    number: true,
    series: true,
    issueDate: true,
    [cfg.cnpjField]: true,
    [cfg.nameField]: true,
    totalValue: true,
    status: true,
  };

  let contactWhere: any = null;
  if (cnpj) {
    contactWhere = { ...baseWhere, [cfg.cnpjField]: { contains: cnpj } };
  } else if (name) {
    contactWhere = { ...baseWhere, [cfg.nameField]: name };
  }

  // Step 1: Fetch metadata WITHOUT xmlContent (fast, lightweight)
  let invoices = await prisma.invoice.findMany({
    where: contactWhere,
    orderBy: [{ issueDate: 'desc' }, { createdAt: 'desc' }],
    take: MAX_INVOICES,
    select: metadataSelect,
  });

  if (invoices.length === 0 && cnpj && name) {
    contactWhere = { ...baseWhere, [cfg.nameField]: name };
    invoices = await prisma.invoice.findMany({
      where: contactWhere,
      orderBy: [{ issueDate: 'desc' }, { createdAt: 'desc' }],
      take: MAX_INVOICES,
      select: metadataSelect,
    });
  }

  const latestInvoice = invoices[0] as any;
  if (!latestInvoice) {
    return NextResponse.json({ error: cfg.notFoundError }, { status: 404 });
  }

  const normalizedLatestDocument = normalizeDocument(latestInvoice[cfg.cnpjField]);
  const filteredInvoices = normalizedLatestDocument
    ? invoices.filter((invoice: any) => normalizeDocument(invoice[cfg.cnpjField]) === normalizedLatestDocument)
    : invoices.filter((invoice: any) => invoice[cfg.nameField] === latestInvoice[cfg.nameField]);

  // Step 2: Load xmlContent ONLY for the latest invoice (contact info)
  const latestWithXml = await prisma.invoice.findUnique({
    where: { id: latestInvoice.id },
    select: { xmlContent: true },
  });
  const extracted = latestWithXml
    ? await extractContactDataFromXml(latestWithXml.xmlContent, cfg.xmlPartyPath, cfg.xmlAddressPrefix)
    : null;
  const contactName = extracted?.name || latestInvoice[cfg.nameField] || cfg.unknownLabel;
  const contactCnpj = extracted?.cnpj || normalizeDocument(latestInvoice[cfg.cnpjField]);

  // Fetch persisted fiscal data (IE, IM, CRT)
  const contactFiscal = contactCnpj
    ? await getContactFiscal(company.id, contactCnpj)
    : null;

  // Step 3: Compute stats from metadata (no XML needed)
  const totalInvoices = filteredInvoices.length;
  const lastIssueDate = (filteredInvoices[0] as any)?.issueDate || null;
  const firstIssueDate = (filteredInvoices[totalInvoices - 1] as any)?.issueDate || null;
  const confirmedInvoices = filteredInvoices.filter((invoice: any) => invoice.status === 'confirmed').length;
  const rejectedInvoices = filteredInvoices.filter((invoice: any) => invoice.status === 'rejected').length;
  const pendingInvoices = filteredInvoices.filter((invoice: any) => invoice.status === 'received').length;

  // For suppliers, totalValue is computed from metadata directly
  // For customers, totalValue is computed from XML (only sale/bonification invoices)
  let totalValue = 0;
  let totalSaleOrBonificationInvoices = 0;
  if (!cfg.hasSaleFilter) {
    totalValue = filteredInvoices.reduce((acc, invoice: any) => acc + (Number(invoice.totalValue) || 0), 0);
  }

  const now = new Date();
  const startOf2026 = new Date(Date.UTC(2026, 0, 1, 0, 0, 0));

  // Step 4: Process XML in parallel batches for price table and duplicates
  const priceMap = new Map<string, {
    code: string;
    description: string;
    unit: string;
    totalQuantity: number;
    quantity2025: number;
    quantity2026: number;
    totalValue: number;
    minPrice: number;
    maxPrice: number;
    lastPrice: number;
    lastIssueDate: Date | null;
    lastInvoiceNumber: string | null;
    invoiceIds: Set<string>;
  }>();
  const priceKeySet = new Set<string>();
  let totalQuantityMeta = 0;
  const duplicatesList: Array<{
    invoiceId: string;
    invoiceNumber: string;
    installmentNumber: string;
    dueDate: string | null;
    installmentValue: number;
    installmentTotal: number;
  }> = [];
  const invoiceCfopTagMap = new Map<string, string>();

  for (let i = 0; i < filteredInvoices.length; i += XML_BATCH_SIZE) {
    const batchMeta = filteredInvoices.slice(i, i + XML_BATCH_SIZE);
    const batchIds = batchMeta.map((inv: any) => inv.id);

    const batchWithXml = await prisma.invoice.findMany({
      where: { id: { in: batchIds } },
      select: { id: true, xmlContent: true },
    });
    const xmlMap = new Map(batchWithXml.map((inv) => [inv.id, inv.xmlContent]));

    const batchSettled = await Promise.allSettled(
      batchMeta.map(async (invoice: any) => {
        const xml = xmlMap.get(invoice.id);
        if (!xml) return null;
        const parsed = await extractInvoiceDataFromXml(xml);
        return { invoice, ...parsed };
      })
    );

    for (const settled of batchSettled) {
      const result = settled.status === 'fulfilled' ? settled.value : null;
      if (!result) continue;
      const { invoice, products, duplicates, cfops } = result;
      const primaryCfopTag = cfops.length > 0
        ? (getCfopTagByCode(cfops[0]) || 'Outros')
        : 'Outros';
      invoiceCfopTagMap.set(invoice.id, primaryCfopTag);

      const issueDate = invoice.issueDate ? new Date(invoice.issueDate) : null;
      const issueTime = issueDate?.getTime() || 0;
      const isFrom2025 = issueDate ? issueDate.getUTCFullYear() === 2025 : false;
      const isFrom2026ToToday = issueDate ? issueTime >= startOf2026.getTime() && issueTime <= now.getTime() : false;

      // Customer-specific: only count sale/bonification invoices for totalValue
      if (cfg.hasSaleFilter && isSaleOrBonificationInvoice(cfops)) {
        totalValue += Number(invoice.totalValue) || 0;
        totalSaleOrBonificationInvoices += 1;
      }

      for (const product of products) {
        const key = `${(product.code || '').toUpperCase()}::${normalizeUnit(product.unit)}`;

        if (metaOnly) {
          priceKeySet.add(key);
          totalQuantityMeta += product.quantity;
          continue;
        }

        const existing = priceMap.get(key);

        if (!existing) {
          priceMap.set(key, {
            code: product.code,
            description: product.description,
            unit: product.unit,
            totalQuantity: product.quantity,
            quantity2025: isFrom2025 ? product.quantity : 0,
            quantity2026: isFrom2026ToToday ? product.quantity : 0,
            totalValue: product.totalValue,
            minPrice: product.unitPrice,
            maxPrice: product.unitPrice,
            lastPrice: product.unitPrice,
            lastIssueDate: invoice.issueDate,
            lastInvoiceNumber: invoice.number,
            invoiceIds: new Set([invoice.id]),
          });
          continue;
        }

        existing.totalQuantity += product.quantity;
        if (isFrom2025) existing.quantity2025 += product.quantity;
        if (isFrom2026ToToday) existing.quantity2026 += product.quantity;
        existing.totalValue += product.totalValue;
        existing.minPrice = Math.min(existing.minPrice, product.unitPrice);
        existing.maxPrice = Math.max(existing.maxPrice, product.unitPrice);
        existing.invoiceIds.add(invoice.id);

        if (!existing.lastIssueDate || invoice.issueDate > existing.lastIssueDate) {
          existing.lastIssueDate = invoice.issueDate;
          existing.lastPrice = product.unitPrice;
          existing.lastInvoiceNumber = invoice.number;
        }
      }

      const installmentTotal = duplicates.length;
      if (metaOnly) continue;

      for (const duplicate of duplicates) {
        duplicatesList.push({
          invoiceId: invoice.id,
          invoiceNumber: invoice.number,
          installmentNumber: duplicate.installmentNumber,
          dueDate: duplicate.dueDate,
          installmentValue: duplicate.installmentValue,
          installmentTotal,
        });
      }
    }
  }

  // Lookup short names from product_registry
  let shortNameMap = new Map<string, string>();
  if (!metaOnly && priceMap.size > 0) {
    const productKeys = Array.from(priceMap.keys());
    const shortNameRows = await prisma.$queryRawUnsafe<{ product_key: string; short_name: string }[]>(
      `SELECT product_key, short_name FROM product_registry WHERE company_id = $1 AND product_key = ANY($2) AND short_name IS NOT NULL AND short_name != ''`,
      company.id,
      productKeys,
    );
    for (const row of shortNameRows) shortNameMap.set(row.product_key, row.short_name);
  }

  const priceTable = metaOnly
    ? []
    : Array.from(priceMap.entries())
      .map(([key, item]) => ({
        code: item.code,
        description: item.description,
        shortName: shortNameMap.get(key) || null,
        unit: item.unit,
        invoiceCount: item.invoiceIds.size,
        totalQuantity: item.totalQuantity,
        quantity2025: item.quantity2025,
        quantity2026: item.quantity2026,
        averagePrice: item.totalQuantity > 0 ? item.totalValue / item.totalQuantity : 0,
        minPrice: item.minPrice,
        maxPrice: item.maxPrice,
        lastPrice: item.lastPrice,
        lastIssueDate: item.lastIssueDate,
        lastInvoiceNumber: item.lastInvoiceNumber,
      }))
      .sort((a, b) => {
        const aTime = a.lastIssueDate ? new Date(a.lastIssueDate).getTime() : 0;
        const bTime = b.lastIssueDate ? new Date(b.lastIssueDate).getTime() : 0;
        if (aTime !== bTime) return bTime - aTime;
        return a.description.localeCompare(b.description, 'pt-BR', { sensitivity: 'base' });
      });

  if (metaOnly) {
    const metaResponse: any = {
      [cfg.responseKey]: {
        name: contactName,
        cnpj: contactCnpj,
      },
      meta: {
        totalPriceRows: priceKeySet.size,
        priceRowsLimited: priceKeySet.size > MAX_PRICE_ROWS,
      },
    };
    // Customer metaOnly includes extra fields
    if (cfg.hasSaleFilter) {
      metaResponse.meta.totalQuantity = totalQuantityMeta;
      metaResponse.meta.totalInvoices = totalInvoices;
      metaResponse.meta.totalValue = totalValue;
    }
    return NextResponse.json(metaResponse);
  }

  const totalPurchasedItems = priceTable.reduce((acc, item) => acc + item.totalQuantity, 0);
  const totalProductsPurchased = priceTable.length;
  const averageTicket = cfg.hasSaleFilter
    ? (totalSaleOrBonificationInvoices > 0 ? totalValue / totalSaleOrBonificationInvoices : 0)
    : (totalInvoices > 0 ? totalValue / totalInvoices : 0);

  const invoicesList = filteredInvoices.map((invoice: any) => ({
    id: invoice.id,
    number: invoice.number,
    series: invoice.series,
    issueDate: invoice.issueDate,
    totalValue: Number(invoice.totalValue),
    status: invoice.status,
    accessKey: invoice.accessKey,
    cfopTag: invoiceCfopTagMap.get(invoice.id) || 'Outros',
  }));

  const duplicates = [...duplicatesList].sort((a, b) => {
    const aTime = a.dueDate ? new Date(a.dueDate).getTime() : 0;
    const bTime = b.dueDate ? new Date(b.dueDate).getTime() : 0;
    if (aTime !== bTime) return bTime - aTime;
    const byInvoice = b.invoiceNumber.localeCompare(a.invoiceNumber, 'pt-BR', { sensitivity: 'base' });
    if (byInvoice !== 0) return byInvoice;
    return b.installmentNumber.localeCompare(a.installmentNumber, 'pt-BR', { sensitivity: 'base' });
  });

  // Supplier-specific: Fetch distinct product types
  let productTypes: string[] = [];
  if (cfg.hasProductTypes && contactCnpj) {
    try {
      await ensureProductRegistryTable();
      const typeRows = await prisma.$queryRawUnsafe<{ product_type: string }[]>(
        `SELECT DISTINCT product_type FROM product_registry
         WHERE company_id = $1 AND agg_last_supplier_cnpj = $2 AND product_type IS NOT NULL AND product_type != ''
         LIMIT 20`,
        company.id,
        contactCnpj,
      );
      productTypes = typeRows.map((r) => r.product_type);
    } catch { /* non-critical */ }
  }

  const response: any = {
    [cfg.responseKey]: {
      name: contactName,
      fantasyName: extracted?.fantasyName,
      cnpj: contactCnpj,
      stateRegistration: contactFiscal?.ie ?? extracted?.stateRegistration,
      municipalRegistration: contactFiscal?.im ?? extracted?.municipalRegistration,
      phone: extracted?.phone,
      email: extracted?.email,
      address: extracted?.address || {
        street: null,
        number: null,
        complement: null,
        district: null,
        city: null,
        state: null,
        zipCode: null,
        country: null,
      },
    },
    contactFiscal: contactFiscal ? {
      ie: contactFiscal.ie,
      im: contactFiscal.im,
      crt: contactFiscal.crt,
      crtLabel: contactFiscal.crt ? CRT_LABELS[contactFiscal.crt] || contactFiscal.crt : null,
      uf: contactFiscal.uf,
    } : null,
    purchases: {
      totalInvoices,
      totalValue,
      totalPurchasedItems,
      totalProductsPurchased,
      averageTicket,
      firstIssueDate,
      lastIssueDate,
      confirmedInvoices,
      pendingInvoices,
      rejectedInvoices,
    },
    priceTable: priceTable.slice(0, MAX_PRICE_ROWS),
    invoices: invoicesList,
    duplicates,
    meta: {
      totalPriceRows: priceTable.length,
      priceRowsLimited: priceTable.length > MAX_PRICE_ROWS,
    },
  };

  // Supplier-specific fields
  if (cfg.hasProductTypes) {
    response.productTypes = productTypes;
  }

  return NextResponse.json(response);
}
