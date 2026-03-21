/**
 * Shared product aggregation logic extracted from /api/products/route.ts.
 * Used by both the original endpoint (for export/ANVISA lookup) and
 * the rebuild-aggregates job that materializes data into product_registry.
 */

import prisma from '@/lib/prisma';
import { parseXmlSafe } from '@/lib/safe-xml-parser';
import { normalizeForSearch, cleanString, ensureArray, toNumber } from '@/lib/utils';
import { isImportEntryCfop, extractFirstCfop } from '@/lib/cfop';
import { isResaleCustomer } from '@/lib/resale-customers';

export { isResaleCustomer };

const MAX_INVOICES = 3000;
const MAX_ISSUED_INVOICES = 3000;
const MAX_IMPORT_INVOICES = 500;
const XML_BATCH_SIZE = 50;

export interface ProductBatch {
  lot: string;
  serial: string | null;
  quantity: number | null;
  fabrication: string | null;
  expiry: string | null;
}

export interface ProductFromXml {
  code: string;
  description: string;
  ncm: string | null;
  unit: string;
  anvisa: string | null;
  ean: string | null;
  quantity: number;
  unitPrice: number;
  totalValue: number;
  batches: ProductBatch[];
}

export interface AggregatedProduct {
  key: string;
  code: string;
  description: string;
  ncm: string | null;
  unit: string;
  anvisa: string | null;
  ean: string | null;
  totalQuantity: number;
  totalValue: number;
  lastPrice: number;
  lastIssueDate: Date | null;
  lastSupplierName: string | null;
  lastSupplierCnpj: string | null;
  lastInvoiceId: string | null;
  lastInvoiceNumber: string | null;
  invoiceIds: Set<string>;
  productType: string | null;
  productSubtype: string | null;
  productSubgroup: string | null;
  resaleQuantity: number;
  lastSaleDate: Date | null;
  lastSalePrice: number | null;
}

// ── Helpers ──

function normalizeToken(value: string | null | undefined) {
  return (value || '').trim().toUpperCase();
}

export function normalizeAnvisaRegistration(value: string | null | undefined): string | null {
  const digits = (value || '').replace(/\D/g, '');
  if (digits.length === 11) return digits;
  return null;
}

function extractAnvisaFromFreeText(text: string | null | undefined): string | null {
  const value = text || '';
  if (!value) return null;

  const explicitPattern = /anvisa[^0-9]{0,24}([0-9][0-9.\-/]{6,24})/gi;
  let explicitMatch: RegExpExecArray | null = explicitPattern.exec(value);
  while (explicitMatch) {
    const normalized = normalizeAnvisaRegistration(explicitMatch[1]);
    if (normalized) return normalized;
    explicitMatch = explicitPattern.exec(value);
  }

  const genericPattern = /\b([0-9][0-9.\-/]{6,24})\b/g;
  let genericMatch: RegExpExecArray | null = genericPattern.exec(value);
  while (genericMatch) {
    const normalized = normalizeAnvisaRegistration(genericMatch[1]);
    if (normalized) return normalized;
    genericMatch = genericPattern.exec(value);
  }

  return null;
}

function extractBatches(det: any, prod: any): ProductBatch[] {
  const batches: ProductBatch[] = [];
  const seenLots = new Set<string>();

  // 1. <rastro> blocks (preferred, NF-e 4.0+)
  for (const r of ensureArray<any>(prod?.rastro)) {
    const lot = cleanString(r?.nLote);
    if (!lot) continue;
    seenLots.add(lot);
    batches.push({
      lot,
      serial: null,
      quantity: r?.qLote != null ? toNumber(r.qLote) : null,
      fabrication: cleanString(r?.dFab),
      expiry: cleanString(r?.dVal),
    });
  }

  // 2. Fallback: <med> block (older format)
  if (batches.length === 0) {
    for (const m of ensureArray<any>(det?.med).concat(ensureArray<any>(prod?.med))) {
      const lot = cleanString(m?.nLote) || cleanString(m?.nLot);
      if (!lot || seenLots.has(lot)) continue;
      seenLots.add(lot);
      batches.push({
        lot,
        serial: null,
        quantity: null,
        fabrication: null,
        expiry: cleanString(m?.dVal),
      });
    }
  }

  // 3. Fallback: regex on xProd / infAdProd
  if (batches.length === 0) {
    const texts = [cleanString(prod?.xProd), cleanString(det?.infAdProd)].filter(Boolean) as string[];
    let lot: string | null = null;
    let serial: string | null = null;
    let expiry: string | null = null;
    let fabrication: string | null = null;

    for (const text of texts) {
      if (!lot) {
        const lotPatterns = [
          /(?:Lotes?|LT)\s*[.:]\s*\(?([A-Za-z0-9]+)/i,
          /(?:^|\s)(?:CS|ES)\s+LOTE\s*:\s*([A-Za-z0-9]+)/i,
        ];
        for (const pat of lotPatterns) {
          const m = text.match(pat);
          if (m) { lot = m[1].trim(); break; }
        }
      }
      if (!serial) {
        const serMatch = text.match(/Numero\s+Serie\s*:\s*([A-Za-z0-9]+)/i)
          || text.match(/(?:N[°º.]?\s*)?S[eé]rie\s*[.:]\s*([A-Za-z0-9]+)/i)
          || text.match(/(?:SN|S\/N)\s*[.:]\s*([A-Za-z0-9]+)/i);
        if (serMatch) serial = serMatch[1].trim();
      }
      if (!expiry) {
        const valMatch = text.match(/Val[.:]?\s*(\d{2}\/\d{2}\/\d{4})/i)
          || text.match(/Val[.:]?\s*(\d{4}-\d{2}-\d{2})/i);
        if (valMatch) expiry = valMatch[1];
      }
      if (!fabrication) {
        const fabMatch = text.match(/Fab[.:]?\s*(\d{2}\/\d{2}\/\d{4})/i)
          || text.match(/Fab[.:]?\s*(\d{4}-\d{2}-\d{2})/i);
        if (fabMatch) fabrication = fabMatch[1];
      }
    }

    if (lot || serial) {
      batches.push({ lot: lot || serial!, serial: lot ? serial : null, quantity: null, fabrication, expiry });
    }
  }

  return batches;
}

function extractAnvisa(det: any, prod: any): string | null {
  const candidates: Array<string | null> = [
    cleanString(prod?.cProdANVISA),
    ...ensureArray<any>(det?.med).map((med) => cleanString(med?.cProdANVISA)),
    ...ensureArray<any>(prod?.med).map((med) => cleanString(med?.cProdANVISA)),
    extractAnvisaFromFreeText(cleanString(det?.infAdProd)),
    extractAnvisaFromFreeText(cleanString(prod?.xProd)),
  ];

  for (const candidate of candidates) {
    const normalized = normalizeAnvisaRegistration(candidate);
    if (normalized) return normalized;
  }

  return null;
}

/* ── Unit normalization ── */
const UNIT_ALIASES: Record<string, string> = {
  UNID: 'UN', UND: 'UN', UNIDADE: 'UN', UNIDADES: 'UN',
  PC: 'UN', 'PÇ': 'UN', PECA: 'UN', 'PEÇA': 'UN', PCS: 'UN', PECAS: 'UN', 'PEÇAS': 'UN',
  CAIXA: 'CX', CAIXAS: 'CX',
  KT: 'KIT', KITS: 'KIT',
  PR: 'PAR', PARES: 'PAR',
  LT: 'L', LITRO: 'L', LITROS: 'L',
  ML: 'ML', MILILITRO: 'ML', MILILITROS: 'ML',
  KG: 'KG', QUILO: 'KG', QUILOS: 'KG', QUILOGRAMA: 'KG',
  GR: 'G', GRAMA: 'G', GRAMAS: 'G',
  MT: 'M', METRO: 'M', METROS: 'M',
  RL: 'ROLO', ROLOS: 'ROLO',
  CT: 'CJ', CONJUNTO: 'CJ', CONJUNTOS: 'CJ',
  TB: 'TUBO', TUBOS: 'TUBO',
  FL: 'FR', FRASCO: 'FR', FRASCOS: 'FR',
  AMP: 'AMPOLA', AMPOLAS: 'AMPOLA',
};

export function normalizeUnit(raw: string | null | undefined): string {
  const upper = (raw || '').trim().toUpperCase().replace(/\./g, '');
  return UNIT_ALIASES[upper] || upper || '-';
}

export function buildProductKey(product: ProductFromXml): string {
  const codeToken = normalizeToken(product.code);
  const unitToken = normalizeUnit(product.unit);
  if (codeToken && codeToken !== '-') {
    return `CODE:${codeToken}::UNIT:${unitToken}`;
  }

  const eanToken = normalizeToken(product.ean).replace(/\D/g, '');
  if (eanToken && eanToken !== '0') {
    return `EAN:${eanToken}`;
  }

  const anvisaToken = normalizeToken(product.anvisa);
  if (anvisaToken) {
    return `ANVISA:${anvisaToken}`;
  }

  const descriptionToken = normalizeForSearch(product.description || 'item-sem-descricao');
  return `DESC:${descriptionToken}::UNIT:${unitToken}`;
}

function normalizeDescriptionToken(value: string | null | undefined) {
  return normalizeForSearch(value || '')
    .replace(/\s+/g, ' ')
    .trim();
}

export async function extractProductsFromXml(xmlContent: string): Promise<ProductFromXml[]> {
  try {
    const parsed = await parseXmlSafe(xmlContent);
    const nfeProc = parsed?.nfeProc || parsed?.NFe || parsed;
    const nfe = nfeProc?.NFe || parsed?.NFe || nfeProc;
    const infNFe = nfe?.infNFe || nfe;
    const dets = ensureArray<any>(infNFe?.det);

    return dets.map((det) => {
      const prod = det?.prod || {};
      const quantity = toNumber(prod?.qCom);
      const unitPrice = toNumber(prod?.vUnCom);
      const totalValue = toNumber(prod?.vProd);
      const safeUnitPrice = unitPrice > 0 ? unitPrice : (quantity > 0 ? totalValue / quantity : 0);

      return {
        code: cleanString(prod?.cProd) || '-',
        description: cleanString(prod?.xProd) || 'Item sem descrição',
        ncm: cleanString(prod?.NCM),
        unit: cleanString(prod?.uCom) || '-',
        anvisa: extractAnvisa(det, prod),
        ean: cleanString(prod?.cEAN),
        quantity,
        unitPrice: safeUnitPrice,
        totalValue,
        batches: extractBatches(det, prod),
      };
    });
  } catch {
    return [];
  }
}

/**
 * Build search text for trigram index: code + description + NCM + ANVISA + supplier.
 */
export function computeSearchText(product: {
  code: string | null;
  description: string;
  ncm: string | null;
  anvisa: string | null;
  lastSupplierName: string | null;
}): string {
  return normalizeForSearch(
    [product.code, product.description, product.ncm, product.anvisa, product.lastSupplierName]
      .filter(Boolean)
      .join(' '),
  );
}

/**
 * Full aggregation of products from invoices — 3 passes:
 * 1. Received invoices (normal purchases)
 * 2. Issued invoices with import CFOPs (3xxx) — product entries
 * 3. Resale deductions (Navix/Prime)
 * + Sale date enrichment
 */
export async function aggregateProductsFromInvoices(
  companyId: string,
): Promise<Map<string, AggregatedProduct>> {
  const productMap = new Map<string, AggregatedProduct>();
  const importProductKeys = new Set<string>();

  // ── Pass 1: received invoices (normal purchases) ──
  const invoiceMetadata = await prisma.invoice.findMany({
    where: { companyId, type: 'NFE', direction: 'received' },
    orderBy: [{ issueDate: 'desc' }, { createdAt: 'desc' }],
    take: MAX_INVOICES,
    select: {
      id: true,
      number: true,
      issueDate: true,
      senderName: true,
      senderCnpj: true,
    },
  });

  for (let i = 0; i < invoiceMetadata.length; i += XML_BATCH_SIZE) {
    const batchMeta = invoiceMetadata.slice(i, i + XML_BATCH_SIZE);
    const batchIds = batchMeta.map((inv) => inv.id);

    const batchWithXml = await prisma.invoice.findMany({
      where: { id: { in: batchIds } },
      select: { id: true, xmlContent: true },
    });
    const xmlMap = new Map(batchWithXml.map((inv) => [inv.id, inv.xmlContent]));

    const parsedBatch = await Promise.allSettled(
      batchMeta.map(async (invoice) => {
        const xmlContent = xmlMap.get(invoice.id);
        if (!xmlContent) return null;
        const products = await extractProductsFromXml(xmlContent);
        return { invoice, products };
      }),
    );

    for (const settled of parsedBatch) {
      const result = settled.status === 'fulfilled' ? settled.value : null;
      if (!result) continue;

      const { invoice, products } = result;
      const issueDate = invoice.issueDate ? new Date(invoice.issueDate) : null;

      for (const product of products) {
        const key = buildProductKey(product);
        const existing = productMap.get(key);

        if (!existing) {
          productMap.set(key, {
            key,
            code: product.code,
            description: product.description,
            ncm: product.ncm,
            unit: product.unit,
            anvisa: product.anvisa,
            ean: product.ean,
            totalQuantity: product.quantity,
            totalValue: product.totalValue,
            lastPrice: product.unitPrice,
            lastIssueDate: issueDate,
            lastSupplierName: invoice.senderName || null,
            lastSupplierCnpj: invoice.senderCnpj || null,
            lastInvoiceId: invoice.id,
            lastInvoiceNumber: invoice.number || null,
            invoiceIds: new Set([invoice.id]),
            productType: null,
            productSubtype: null,
            productSubgroup: null,
            resaleQuantity: 0,
            lastSaleDate: null,
            lastSalePrice: null,
          });
          continue;
        }

        existing.totalQuantity += product.quantity;
        existing.totalValue += product.totalValue;
        existing.invoiceIds.add(invoice.id);

        if (!existing.anvisa && product.anvisa) existing.anvisa = product.anvisa;
        if (!existing.ean && product.ean) existing.ean = product.ean;
        if ((!existing.code || existing.code === '-') && product.code && product.code !== '-') {
          existing.code = product.code;
        }
        if (!existing.ncm && product.ncm) existing.ncm = product.ncm;

        if (issueDate && (!existing.lastIssueDate || issueDate > existing.lastIssueDate)) {
          existing.lastIssueDate = issueDate;
          existing.lastPrice = product.unitPrice;
          existing.lastSupplierName = invoice.senderName || null;
          existing.lastSupplierCnpj = invoice.senderCnpj || null;
          existing.lastInvoiceId = invoice.id;
          existing.lastInvoiceNumber = invoice.number || null;
        }
      }
    }
  }

  // ── Pass 2: issued invoices with import CFOPs (3xxx) ──
  {
    const importInvoiceMeta = await prisma.invoice.findMany({
      where: { companyId, type: 'NFE', direction: 'issued' },
      orderBy: [{ issueDate: 'desc' }, { createdAt: 'desc' }],
      take: MAX_IMPORT_INVOICES,
      select: {
        id: true,
        number: true,
        issueDate: true,
        senderName: true,
        senderCnpj: true,
        recipientName: true,
        recipientCnpj: true,
        xmlContent: true,
      },
    });

    for (let i = 0; i < importInvoiceMeta.length; i += XML_BATCH_SIZE) {
      const batchMeta = importInvoiceMeta.slice(i, i + XML_BATCH_SIZE);

      const parsedBatch = await Promise.allSettled(
        batchMeta.map(async (invoice) => {
          if (!invoice.xmlContent) return null;
          const cfop = extractFirstCfop(invoice.xmlContent);
          if (!isImportEntryCfop(cfop)) return null;
          const products = await extractProductsFromXml(invoice.xmlContent);
          return { invoice, products };
        }),
      );

      for (const settled of parsedBatch) {
        const result = settled.status === 'fulfilled' ? settled.value : null;
        if (!result) continue;

        const { invoice, products } = result;
        const issueDate = invoice.issueDate ? new Date(invoice.issueDate) : null;
        const supplierName = invoice.recipientName || null;
        const supplierCnpj = invoice.recipientCnpj || null;

        for (const product of products) {
          const key = buildProductKey(product);
          importProductKeys.add(key);
          const existing = productMap.get(key);

          if (!existing) {
            productMap.set(key, {
              key,
              code: product.code,
              description: product.description,
              ncm: product.ncm,
              unit: product.unit,
              anvisa: product.anvisa,
              ean: product.ean,
              totalQuantity: product.quantity,
              totalValue: product.totalValue,
              lastPrice: product.unitPrice,
              lastIssueDate: issueDate,
              lastSupplierName: supplierName,
              lastSupplierCnpj: supplierCnpj,
              lastInvoiceId: invoice.id,
              lastInvoiceNumber: invoice.number || null,
              invoiceIds: new Set([invoice.id]),
              productType: 'LINHA CARDIACA',
              productSubtype: 'VALVULAS IMPORTADAS',
              productSubgroup: null,
              resaleQuantity: 0,
              lastSaleDate: null,
              lastSalePrice: null,
            });
            continue;
          }

          existing.totalQuantity += product.quantity;
          existing.totalValue += product.totalValue;
          existing.invoiceIds.add(invoice.id);

          if (!existing.anvisa && product.anvisa) existing.anvisa = product.anvisa;
          if (!existing.ean && product.ean) existing.ean = product.ean;
          if ((!existing.code || existing.code === '-') && product.code && product.code !== '-') {
            existing.code = product.code;
          }
          if (!existing.ncm && product.ncm) existing.ncm = product.ncm;

          if (!existing.productType) {
            existing.productType = 'LINHA CARDIACA';
            existing.productSubtype = 'VALVULAS IMPORTADAS';
          }

          if (issueDate && (!existing.lastIssueDate || issueDate > existing.lastIssueDate)) {
            existing.lastIssueDate = issueDate;
            existing.lastPrice = product.unitPrice;
            existing.lastSupplierName = supplierName;
            existing.lastSupplierCnpj = supplierCnpj;
            existing.lastInvoiceId = invoice.id;
            existing.lastInvoiceNumber = invoice.number || null;
          }
        }
      }
    }
  }

  // ── Pass 3: deduct resale quantities (Navix / Prime) ──
  if (productMap.size > 0) {
    const resaleIndex = new Map<string, string>();
    productMap.forEach((agg, mapKey) => {
      const codeToken = normalizeToken(agg.code);
      const unitToken = normalizeUnit(agg.unit);
      const eanToken = normalizeToken(agg.ean).replace(/\D/g, '');
      const descToken = normalizeDescriptionToken(agg.description);

      if (codeToken && codeToken !== '-') {
        resaleIndex.set(`R_CODE_UNIT:${codeToken}::${unitToken}`, mapKey);
      }
      if (eanToken && eanToken !== '0') {
        resaleIndex.set(`R_EAN:${eanToken}`, mapKey);
      }
      if (descToken && unitToken) {
        resaleIndex.set(`R_DESC_UNIT:${descToken}::${unitToken}`, mapKey);
      }
    });

    const matchResaleProduct = (product: ProductFromXml): string | null => {
      const unitToken = normalizeUnit(product.unit);
      const codeToken = normalizeToken(product.code);

      if (codeToken && codeToken !== '-') {
        const hit = resaleIndex.get(`R_CODE_UNIT:${codeToken}::${unitToken}`);
        if (hit) return hit;
      }

      const firstToken = normalizeToken(product.description.split(/[\s\-]+/)[0]);
      if (firstToken && firstToken !== codeToken) {
        const hit = resaleIndex.get(`R_CODE_UNIT:${firstToken}::${unitToken}`);
        if (hit) return hit;
      }

      const eanToken = normalizeToken(product.ean).replace(/\D/g, '');
      if (eanToken && eanToken !== '0') {
        const hit = resaleIndex.get(`R_EAN:${eanToken}`);
        if (hit) return hit;
      }

      const descToken = normalizeDescriptionToken(product.description);
      if (descToken && unitToken) {
        const hit = resaleIndex.get(`R_DESC_UNIT:${descToken}::${unitToken}`);
        if (hit) return hit;
      }

      return null;
    };

    const resaleInvoiceMeta = await prisma.invoice.findMany({
      where: { companyId, type: 'NFE', direction: 'issued' },
      orderBy: [{ issueDate: 'desc' }, { createdAt: 'desc' }],
      take: MAX_ISSUED_INVOICES,
      select: {
        id: true,
        recipientName: true,
        xmlContent: true,
      },
    });

    for (let i = 0; i < resaleInvoiceMeta.length; i += XML_BATCH_SIZE) {
      const batch = resaleInvoiceMeta.slice(i, i + XML_BATCH_SIZE);

      const parsedBatch = await Promise.allSettled(
        batch.map(async (invoice) => {
          if (!invoice.xmlContent) return null;
          if (!isResaleCustomer(invoice.recipientName)) return null;
          const cfop = extractFirstCfop(invoice.xmlContent);
          if (isImportEntryCfop(cfop)) return null;
          const products = await extractProductsFromXml(invoice.xmlContent);
          return { products };
        }),
      );

      for (const settled of parsedBatch) {
        const result = settled.status === 'fulfilled' ? settled.value : null;
        if (!result) continue;

        for (const product of result.products) {
          const mapKey = matchResaleProduct(product);
          if (!mapKey) continue;

          const agg = productMap.get(mapKey);
          if (!agg) continue;

          agg.totalQuantity -= product.quantity;
          agg.totalValue -= product.totalValue;
          agg.resaleQuantity += product.quantity;
        }
      }
    }
  }

  // ── Enrich last sale dates ──
  await enrichLastSaleDates(companyId, productMap);

  return productMap;
}

/**
 * Enrich products with last sale date from issued NF-e (non-resale, non-import).
 */
async function enrichLastSaleDates(
  companyId: string,
  productMap: Map<string, AggregatedProduct>,
) {
  if (productMap.size === 0) return;

  function buildStrictSaleLookupKeys(product: {
    code: string;
    unit: string;
    ean?: string | null;
  }): string[] {
    const keys: string[] = [];
    const codeToken = normalizeToken(product.code);
    const unitToken = normalizeUnit(product.unit);
    const eanToken = normalizeToken(product.ean).replace(/\D/g, '');

    if (codeToken && codeToken !== '-') {
      keys.push(`SALE_CODE_UNIT:${codeToken}::${unitToken}`);
      keys.push(`SALE_CODE:${codeToken}`);
      return keys;
    }

    if (eanToken && eanToken !== '0') {
      keys.push(`SALE_EAN:${eanToken}`);
    }

    return keys;
  }

  const unresolvedKeys = new Set<string>();
  const keysByLookup = new Map<string, string[]>();

  productMap.forEach((agg, mapKey) => {
    if (agg.lastSaleDate) return;

    const lookupKeys = buildStrictSaleLookupKeys({
      code: agg.code,
      unit: agg.unit,
      ean: agg.ean,
    });

    if (lookupKeys.length === 0) return;

    unresolvedKeys.add(mapKey);
    for (const lk of lookupKeys) {
      const list = keysByLookup.get(lk) || [];
      list.push(mapKey);
      keysByLookup.set(lk, list);
    }
  });

  if (unresolvedKeys.size === 0) return;

  const issuedInvoiceMetadata = await prisma.invoice.findMany({
    where: { companyId, type: 'NFE', direction: 'issued' },
    orderBy: [{ issueDate: 'desc' }, { createdAt: 'desc' }],
    take: MAX_ISSUED_INVOICES,
    select: { id: true, issueDate: true, recipientName: true },
  });

  batchLoop: for (let i = 0; i < issuedInvoiceMetadata.length; i += XML_BATCH_SIZE) {
    const batchMeta = issuedInvoiceMetadata.slice(i, i + XML_BATCH_SIZE);
    const batchIds = batchMeta.map((inv) => inv.id);

    const batchWithXml = await prisma.invoice.findMany({
      where: { id: { in: batchIds } },
      select: { id: true, xmlContent: true },
    });
    const xmlMap = new Map(batchWithXml.map((inv) => [inv.id, inv.xmlContent]));

    const parsedBatch = await Promise.allSettled(
      batchMeta.map(async (invoice) => {
        if (isResaleCustomer(invoice.recipientName)) return null;
        const xmlContent = xmlMap.get(invoice.id);
        if (!xmlContent) return null;
        const cfop = extractFirstCfop(xmlContent);
        if (isImportEntryCfop(cfop)) return null;
        const products = await extractProductsFromXml(xmlContent);
        return { invoice, products };
      }),
    );

    for (const settled of parsedBatch) {
      const result = settled.status === 'fulfilled' ? settled.value : null;
      if (!result) continue;

      const issueDate = result.invoice.issueDate ? new Date(result.invoice.issueDate) : null;
      if (!issueDate) continue;

      for (const product of result.products) {
        const lookupKeys = buildStrictSaleLookupKeys({
          code: product.code,
          unit: product.unit,
          ean: product.ean,
        });
        if (lookupKeys.length === 0) continue;

        const matchedMapKeys = new Set<string>();
        for (const lk of lookupKeys) {
          const mapKeys = keysByLookup.get(lk) || [];
          for (const mk of mapKeys) {
            if (unresolvedKeys.has(mk)) matchedMapKeys.add(mk);
          }
        }

        if (matchedMapKeys.size === 0) continue;

        matchedMapKeys.forEach((mk) => {
          const agg = productMap.get(mk);
          if (!agg || agg.lastSaleDate) return;

          agg.lastSaleDate = issueDate;
          agg.lastSalePrice = Number.isFinite(product.unitPrice) ? product.unitPrice : null;
          unresolvedKeys.delete(mk);
        });

        if (unresolvedKeys.size === 0) break batchLoop;
      }
    }
  }
}
