import { NextResponse } from 'next/server';
import { requireAuth, unauthorizedResponse } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { getOrCreateSingleCompany } from '@/lib/single-company';
import { parseXmlSafe } from '@/lib/safe-xml-parser';
import { resolveAnvisaByCodeAndName } from '@/lib/anvisa-open-data';
import { getProductRegistryByKeys } from '@/lib/product-registry-store';
import { normalizeForSearch } from '@/lib/utils';
import { isImportEntryCfop, extractFirstCfop } from '@/lib/cfop';
import { isResaleCustomer } from '@/lib/resale-customers';

const MAX_INVOICES = 3000;
const MAX_ISSUED_INVOICES = 3000;
const MAX_IMPORT_INVOICES = 500;
const XML_BATCH_SIZE = 50;
const MAX_LIMIT = 200;

interface ProductFromXml {
  code: string;
  description: string;
  ncm: string | null;
  unit: string;
  anvisa: string | null;
  ean: string | null;
  quantity: number;
  unitPrice: number;
  totalValue: number;
}

interface AggregatedProduct {
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
}

function toPositiveInt(value: string | null, fallback: number, max: number) {
  const parsed = parseInt(value || '', 10);
  if (Number.isNaN(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, max);
}

function cleanString(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  const normalized = String(value).trim();
  return normalized.length > 0 ? normalized : null;
}

function ensureArray<T>(value: T | T[] | null | undefined): T[] {
  if (value === null || value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

function toNumber(value: unknown): number {
  if (value === undefined || value === null) return 0;
  const normalized = String(value).replace(',', '.');
  const number = parseFloat(normalized);
  return Number.isFinite(number) ? number : 0;
}

function compareStrings(left: string, right: string) {
  return left.localeCompare(right, 'pt-BR', { sensitivity: 'base' });
}

function normalizeToken(value: string | null | undefined) {
  return (value || '').trim().toUpperCase();
}

function normalizeAnvisaRegistration(value: string | null | undefined): string | null {
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

/* ── Unit normalization ──
 * NF-e XMLs use inconsistent unit abbreviations for the same thing.
 * Normalize so products with the same code don't become duplicates.
 */
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

function normalizeUnit(raw: string | null | undefined): string {
  const upper = (raw || '').trim().toUpperCase().replace(/\./g, '');
  return UNIT_ALIASES[upper] || upper || '-';
}

function buildProductKey(product: ProductFromXml): string {
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

const PRODUCT_LOOKUP_STOPWORDS = new Set([
  'de',
  'da',
  'do',
  'das',
  'dos',
  'para',
  'com',
  'sem',
  'uso',
  'adulto',
  'infantil',
  'produto',
  'produtos',
  'unidade',
]);

function tokenizeForProductLookup(value: string | null | undefined) {
  const normalized = normalizeDescriptionToken(value)
    .replace(/[^a-z0-9\s]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!normalized) return [];

  const tokens = normalized
    .split(' ')
    .filter((token) => token.length >= 4)
    .filter((token) => !PRODUCT_LOOKUP_STOPWORDS.has(token));

  return Array.from(new Set(tokens));
}

function buildLookupKeys(product: {
  code: string | null | undefined;
  description: string | null | undefined;
  ncm: string | null | undefined;
  unit: string | null | undefined;
  ean?: string | null | undefined;
  anvisa?: string | null | undefined;
}) {
  const keys = new Set<string>();
  const unitToken = normalizeUnit(product.unit);
  const codeToken = normalizeToken(product.code);
  const ncmToken = normalizeToken(product.ncm);
  const descToken = normalizeDescriptionToken(product.description);
  const eanToken = normalizeToken(product.ean).replace(/\D/g, '');
  const anvisaToken = normalizeAnvisaRegistration(product.anvisa || null);

  if (eanToken && eanToken !== '0') {
    keys.add(`EAN:${eanToken}`);
  }

  if (codeToken && codeToken !== '-') {
    keys.add(`CODE_UNIT:${codeToken}::${unitToken}`);
    keys.add(`CODE:${codeToken}`);
  }

  if (descToken && unitToken) {
    keys.add(`DESC_UNIT:${descToken}::${unitToken}`);
  }

  if (ncmToken && descToken) {
    keys.add(`NCM_DESC:${ncmToken}::${descToken}`);
  }

  if (anvisaToken) {
    keys.add(`ANVISA:${anvisaToken}`);
  }

  return Array.from(keys);
}

function buildStrictSaleLookupKeys(product: {
  code: string | null | undefined;
  unit: string | null | undefined;
  ean?: string | null | undefined;
}) {
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

async function extractProductsFromXml(xmlContent: string): Promise<ProductFromXml[]> {
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
      };
    });
  } catch {
    return [];
  }
}

async function enrichLastSaleDateForProducts(
  companyId: string,
  targetProducts: Array<{
    code: string;
    description: string;
    ncm: string | null;
    unit: string;
    ean?: string | null;
    anvisa: string | null;
    lastSaleDate: Date | null;
    lastSalePrice: number | null;
  }>,
) {
  if (targetProducts.length === 0) return;

  const unresolvedIndexes = new Set<number>();
  const indexesByLookupKey = new Map<string, number[]>();

  targetProducts.forEach((product, index) => {
    if (product.lastSaleDate) return;

    const lookupKeys = buildStrictSaleLookupKeys({
      code: product.code,
      unit: product.unit,
      ean: product.ean,
    });

    if (lookupKeys.length === 0) return;

    unresolvedIndexes.add(index);
    for (const lookupKey of lookupKeys) {
      const list = indexesByLookupKey.get(lookupKey) || [];
      list.push(index);
      indexesByLookupKey.set(lookupKey, list);
    }
  });

  if (unresolvedIndexes.size === 0) return;

  const issuedInvoiceMetadata = await prisma.invoice.findMany({
    where: {
      companyId,
      type: 'NFE',
      direction: 'issued',
    },
    orderBy: [{ issueDate: 'desc' }, { createdAt: 'desc' }],
    take: MAX_ISSUED_INVOICES,
    select: {
      id: true,
      issueDate: true,
      recipientName: true,
    },
  });

  batchLoop: for (let i = 0; i < issuedInvoiceMetadata.length; i += XML_BATCH_SIZE) {
    const batchMeta = issuedInvoiceMetadata.slice(i, i + XML_BATCH_SIZE);
    const batchIds = batchMeta.map((invoice) => invoice.id);

    const batchWithXml = await prisma.invoice.findMany({
      where: { id: { in: batchIds } },
      select: { id: true, xmlContent: true },
    });
    const xmlMap = new Map(batchWithXml.map((invoice) => [invoice.id, invoice.xmlContent]));

    const parsedBatch = await Promise.allSettled(
      batchMeta.map(async (invoice) => {
        // Skip resale customers (Navix/Prime) — not real sales
        if (isResaleCustomer(invoice.recipientName)) return null;
        const xmlContent = xmlMap.get(invoice.id);
        if (!xmlContent) return null;
        // Skip import invoices — they are entries, not sales
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

        const matchedIndexes = new Set<number>();
        for (const lookupKey of lookupKeys) {
          const indexes = indexesByLookupKey.get(lookupKey) || [];
          for (const index of indexes) {
            if (!unresolvedIndexes.has(index)) continue;
            matchedIndexes.add(index);
          }
        }

        if (matchedIndexes.size === 0) continue;

        matchedIndexes.forEach((index) => {
          if (!targetProducts[index].lastSaleDate) {
            targetProducts[index].lastSaleDate = issueDate;
            targetProducts[index].lastSalePrice = Number.isFinite(product.unitPrice)
              ? product.unitPrice
              : null;
            unresolvedIndexes.delete(index);
          }
        });

        if (unresolvedIndexes.size === 0) break batchLoop;
      }
    }
  }
}

export async function GET(req: Request) {
  try {
    let userId: string;
    try {
      userId = await requireAuth();
    } catch {
      return unauthorizedResponse();
    }

    const company = await getOrCreateSingleCompany(userId);
    const { searchParams } = new URL(req.url);

    const page = toPositiveInt(searchParams.get('page'), 1, 100000);
    const limit = toPositiveInt(searchParams.get('limit'), 50, MAX_LIMIT);
    const search = (searchParams.get('search') || '').trim();
    const sort = searchParams.get('sort') || 'lastIssue';
    const order = searchParams.get('order') === 'asc' ? 'asc' : 'desc';
    const useAnvisaLookup = searchParams.get('anvisaLookup') === '1';
    const useIssuedNfeLookup = searchParams.get('issuedNfeLookup') === '1';
    const onlyMissingAnvisa = searchParams.get('onlyMissingAnvisa') === '1';
    const exportAll = searchParams.get('exportAll') === '1';
    const dateFrom = searchParams.get('dateFrom');
    const dateTo = searchParams.get('dateTo');

    const dateFilter: { gte?: Date; lte?: Date } = {};
    if (dateFrom) {
      const parsed = new Date(`${dateFrom}T00:00:00.000Z`);
      if (!Number.isNaN(parsed.getTime())) {
        dateFilter.gte = parsed;
      }
    }
    if (dateTo) {
      const parsed = new Date(`${dateTo}T23:59:59.999Z`);
      if (!Number.isNaN(parsed.getTime())) {
        dateFilter.lte = parsed;
      }
    }

    const where: any = {
      companyId: company.id,
      type: 'NFE',
      direction: 'received',
    };

    if (dateFilter.gte || dateFilter.lte) {
      where.issueDate = dateFilter;
    }

    const invoiceMetadata = await prisma.invoice.findMany({
      where,
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

    const productMap = new Map<string, AggregatedProduct>();
    // Track which product keys came from import invoices (for default classification)
    const importProductKeys = new Set<string>();

    // ── Pass 1: received invoices (normal purchases) ──
    for (let i = 0; i < invoiceMetadata.length; i += XML_BATCH_SIZE) {
      const batchMeta = invoiceMetadata.slice(i, i + XML_BATCH_SIZE);
      const batchIds = batchMeta.map((invoice) => invoice.id);

      const batchWithXml = await prisma.invoice.findMany({
        where: { id: { in: batchIds } },
        select: { id: true, xmlContent: true },
      });
      const xmlMap = new Map(batchWithXml.map((invoice) => [invoice.id, invoice.xmlContent]));

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
            });
            continue;
          }

          existing.totalQuantity += product.quantity;
          existing.totalValue += product.totalValue;
          existing.invoiceIds.add(invoice.id);

          if (!existing.anvisa && product.anvisa) {
            existing.anvisa = product.anvisa;
          }

          if (!existing.ean && product.ean) {
            existing.ean = product.ean;
          }

          if (
            (!existing.code || existing.code === '-') &&
            product.code &&
            product.code !== '-'
          ) {
            existing.code = product.code;
          }

          if (!existing.ncm && product.ncm) {
            existing.ncm = product.ncm;
          }

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

    // ── Pass 2: issued invoices with import CFOPs (3xxx) — these are product entries ──
    {
      const importWhere: any = {
        companyId: company.id,
        type: 'NFE',
        direction: 'issued',
      };
      if (dateFilter.gte || dateFilter.lte) {
        importWhere.issueDate = dateFilter;
      }

      const importInvoiceMeta = await prisma.invoice.findMany({
        where: importWhere,
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
          // For import invoices, the "supplier" is the recipient (e.g. Corcym)
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
              });
              continue;
            }

            existing.totalQuantity += product.quantity;
            existing.totalValue += product.totalValue;
            existing.invoiceIds.add(invoice.id);

            if (!existing.anvisa && product.anvisa) {
              existing.anvisa = product.anvisa;
            }

            if (!existing.ean && product.ean) {
              existing.ean = product.ean;
            }

            if (
              (!existing.code || existing.code === '-') &&
              product.code &&
              product.code !== '-'
            ) {
              existing.code = product.code;
            }

            if (!existing.ncm && product.ncm) {
              existing.ncm = product.ncm;
            }

            // Set import classification if not already set from registry
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
    // Sales to resale customers are direct pass-throughs — subtract their
    // quantities and values from the product entry totals.
    if (productMap.size > 0) {
      // Build a reverse index from productMap for matching issued-invoice items
      const resaleIndex = new Map<string, string>(); // lookup key → productMap key
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

        // 1. Direct code+unit match
        if (codeToken && codeToken !== '-') {
          const hit = resaleIndex.get(`R_CODE_UNIT:${codeToken}::${unitToken}`);
          if (hit) return hit;
        }

        // 2. Try first token of xProd as supplier code (issued invoices often
        //    prefix xProd with the supplier code: "NXG40013 VALVULA ...")
        const firstToken = normalizeToken(product.description.split(/[\s\-]+/)[0]);
        if (firstToken && firstToken !== codeToken) {
          const hit = resaleIndex.get(`R_CODE_UNIT:${firstToken}::${unitToken}`);
          if (hit) return hit;
        }

        // 3. EAN match
        const eanToken = normalizeToken(product.ean).replace(/\D/g, '');
        if (eanToken && eanToken !== '0') {
          const hit = resaleIndex.get(`R_EAN:${eanToken}`);
          if (hit) return hit;
        }

        // 4. Description + unit match
        const descToken = normalizeDescriptionToken(product.description);
        if (descToken && unitToken) {
          const hit = resaleIndex.get(`R_DESC_UNIT:${descToken}::${unitToken}`);
          if (hit) return hit;
        }

        return null;
      };

      const resaleWhere: any = {
        companyId: company.id,
        type: 'NFE',
        direction: 'issued',
      };
      if (dateFilter.gte || dateFilter.lte) {
        resaleWhere.issueDate = dateFilter;
      }

      const resaleInvoiceMeta = await prisma.invoice.findMany({
        where: resaleWhere,
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
            // Skip import CFOPs — those are entries, already counted in Pass 2
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
          }
        }
      }
    }

    if (productMap.size === 0) {
      return NextResponse.json({
        products: [],
        summary: {
          totalProducts: 0,
          productsWithAnvisa: 0,
          totalQuantity: 0,
          invoicesProcessed: 0,
        },
        pagination: {
          page: 1,
          limit,
          total: 0,
          pages: 1,
        },
        meta: {
          invoicesLimited: false,
          maxInvoices: MAX_INVOICES,
        },
      });
    }

    let products = Array.from(productMap.values()).map((item) => ({
      key: item.key,
      codigo: null as string | null,
      code: item.code,
      description: item.description,
      ncm: item.ncm,
      unit: item.unit,
      anvisa: item.anvisa,
      ean: item.ean,
      anvisaMatchMethod: (item.anvisa ? 'xml' : null) as
        | 'xml'
        | 'manual'
        | 'issued_nfe'
        | 'catalog_code_exact'
        | 'catalog_name'
        | null,
      anvisaConfidence: item.anvisa ? 1 : null,
      anvisaMatchedProductName: null as string | null,
      anvisaHolder: null as string | null,
      anvisaProcess: null as string | null,
      anvisaStatus: null as string | null,
      anvisaExpiration: null as string | null,
      anvisaRiskClass: null as string | null,
      anvisaManufacturer: null as string | null,
      anvisaManufacturerCountry: null as string | null,
      manufacturerShortName: null as string | null,
      anvisaDataset: null as 'medicamentos' | 'produtos_saude' | null,
      totalQuantity: item.totalQuantity,
      invoiceCount: item.invoiceIds.size,
      lastIssueDate: item.lastIssueDate,
      lastSaleDate: null as Date | null,
      lastSalePrice: null as number | null,
      lastPrice: item.lastPrice,
      averagePrice: item.totalQuantity > 0 ? item.totalValue / item.totalQuantity : 0,
      lastSupplierName: item.lastSupplierName,
      lastSupplierCnpj: item.lastSupplierCnpj,
      lastInvoiceId: item.lastInvoiceId,
      lastInvoiceNumber: item.lastInvoiceNumber,
      shortName: null as string | null,
      productType: item.productType as string | null,
      productSubtype: item.productSubtype as string | null,
      productSubgroup: item.productSubgroup as string | null,
      outOfLine: false,
      instrumental: false,
      fiscalSitTributaria: null as string | null,
      fiscalNomeTributacao: null as string | null,
      fiscalIcms: null as number | null,
      fiscalPis: null as number | null,
      fiscalCofins: null as number | null,
      fiscalObs: null as string | null,
      fiscalCest: null as string | null,
      fiscalOrigem: null as string | null,
      fiscalCfopEntrada: null as string | null,
      fiscalCfopSaida: null as string | null,
      fiscalIpi: null as number | null,
      fiscalFcp: null as number | null,
      fiscalCstIpi: null as string | null,
      fiscalCstPis: null as string | null,
      fiscalCstCofins: null as string | null,
      fiscalObsIcms: null as string | null,
      fiscalObsPisCofins: null as string | null,
      productRefs: [] as string[],
    }));

    if (useIssuedNfeLookup) {
      const productsWithoutAnvisa = products.filter((product) => !product.anvisa);

      if (productsWithoutAnvisa.length > 0) {
        interface IssuedAnvisaCandidate {
          registration: string;
          productName: string;
          matchCount: number;
          lastIssueTime: number;
          keyUsed: string;
        }

        interface IssuedAnvisaEntry {
          registration: string;
          productName: string;
          normalizedName: string;
          tokens: string[];
          ncm: string | null;
          unit: string | null;
          ean: string | null;
          occurrences: number;
          lastIssueTime: number;
        }

        const candidateBuckets = new Map<string, Map<string, IssuedAnvisaCandidate>>();
        const issuedEntryMap = new Map<string, IssuedAnvisaEntry>();

        const pushCandidate = (
          key: string,
          registration: string,
          productName: string,
          issueDate: Date | null
        ) => {
          const issueTime = issueDate ? new Date(issueDate).getTime() : 0;
          const byRegistration = candidateBuckets.get(key) || new Map<string, IssuedAnvisaCandidate>();
          const existing = byRegistration.get(registration);

          if (!existing) {
            byRegistration.set(registration, {
              registration,
              productName,
              matchCount: 1,
              lastIssueTime: issueTime,
              keyUsed: key,
            });
          } else {
            existing.matchCount += 1;
            if (issueTime > existing.lastIssueTime) {
              existing.lastIssueTime = issueTime;
              if (productName) existing.productName = productName;
            }
          }

          candidateBuckets.set(key, byRegistration);
        };

        const pushIssuedEntry = (
          registration: string,
          productName: string,
          ncm: string | null,
          unit: string | null,
          ean: string | null,
          issueDate: Date | null
        ) => {
          const normalizedName = normalizeDescriptionToken(productName);
          if (!normalizedName) return;

          const key = `${registration}::${normalizedName}::${normalizeToken(unit)}::${normalizeToken(ncm)}`;
          const issueTime = issueDate ? new Date(issueDate).getTime() : 0;
          const existing = issuedEntryMap.get(key);
          if (!existing) {
            issuedEntryMap.set(key, {
              registration,
              productName,
              normalizedName,
              tokens: tokenizeForProductLookup(productName),
              ncm: ncm || null,
              unit: unit || null,
              ean: ean || null,
              occurrences: 1,
              lastIssueTime: issueTime,
            });
            return;
          }

          existing.occurrences += 1;
          if (issueTime > existing.lastIssueTime) {
            existing.lastIssueTime = issueTime;
            existing.productName = productName;
            existing.ncm = ncm || existing.ncm;
            existing.unit = unit || existing.unit;
            existing.ean = ean || existing.ean;
          }
        };

        const issuedInvoiceMetadata = await prisma.invoice.findMany({
          where: {
            companyId: company.id,
            type: 'NFE',
            direction: 'issued',
          },
          orderBy: [{ issueDate: 'desc' }, { createdAt: 'desc' }],
          take: MAX_ISSUED_INVOICES,
          select: {
            id: true,
            issueDate: true,
            recipientName: true,
          },
        });

        for (let i = 0; i < issuedInvoiceMetadata.length; i += XML_BATCH_SIZE) {
          const batchMeta = issuedInvoiceMetadata.slice(i, i + XML_BATCH_SIZE);
          const batchIds = batchMeta.map((invoice) => invoice.id);

          const batchWithXml = await prisma.invoice.findMany({
            where: { id: { in: batchIds } },
            select: { id: true, xmlContent: true },
          });
          const xmlMap = new Map(batchWithXml.map((invoice) => [invoice.id, invoice.xmlContent]));

          const parsedBatch = await Promise.allSettled(
            batchMeta.map(async (invoice) => {
              // Skip resale customers (Navix/Prime)
              if (isResaleCustomer(invoice.recipientName)) return null;
              const xmlContent = xmlMap.get(invoice.id);
              if (!xmlContent) return null;
              // Skip import invoices — they are entries, not sales
              const cfop = extractFirstCfop(xmlContent);
              if (isImportEntryCfop(cfop)) return null;
              const items = await extractProductsFromXml(xmlContent);
              return { invoice, items };
            }),
          );

          for (const settled of parsedBatch) {
            const result = settled.status === 'fulfilled' ? settled.value : null;
            if (!result) continue;

            const issueDate = result.invoice.issueDate ? new Date(result.invoice.issueDate) : null;
            for (const item of result.items) {
              if (!item.anvisa) continue;

              const keys = buildLookupKeys({
                code: item.code,
                description: item.description,
                ncm: item.ncm,
                unit: item.unit,
                ean: item.ean,
              });

              for (const key of keys) {
                pushCandidate(key, item.anvisa, item.description, issueDate);
              }

              pushIssuedEntry(
                item.anvisa,
                item.description,
                item.ncm,
                item.unit,
                item.ean,
                issueDate
              );
            }
          }
        }

        const bestCandidateByKey = new Map<string, IssuedAnvisaCandidate>();
        candidateBuckets.forEach((bucket, key) => {
          const candidates: IssuedAnvisaCandidate[] = [];
          bucket.forEach((candidate) => {
            candidates.push(candidate);
          });

          candidates.sort((left, right) => {
            if (left.matchCount !== right.matchCount) return right.matchCount - left.matchCount;
            return right.lastIssueTime - left.lastIssueTime;
          });

          const best = candidates[0];
          if (best) bestCandidateByKey.set(key, best);
        });

        const issuedEntries = Array.from(issuedEntryMap.values());
        const issuedTokenIndex = new Map<string, number[]>();
        issuedEntries.forEach((entry, entryIndex) => {
          for (const token of entry.tokens) {
            const bucket = issuedTokenIndex.get(token);
            if (!bucket) {
              issuedTokenIndex.set(token, [entryIndex]);
              continue;
            }
            if (bucket.length < 10000) {
              bucket.push(entryIndex);
            }
          }
        });

        const getKeyConfidence = (key: string, matchCount: number) => {
          let base = 0.82;
          if (key.startsWith('EAN:')) base = 0.97;
          else if (key.startsWith('CODE_UNIT:')) base = 0.93;
          else if (key.startsWith('NCM_DESC:')) base = 0.90;
          else if (key.startsWith('DESC_UNIT:')) base = 0.86;
          else if (key.startsWith('CODE:')) base = 0.84;
          const boosted = base + Math.min(0.04, Math.max(0, matchCount - 1) * 0.01);
          return Math.min(0.99, Number(boosted.toFixed(3)));
        };

        const findByFuzzyDescription = (product: typeof products[number]) => {
          const queryTokens = tokenizeForProductLookup(product.description);
          if (queryTokens.length === 0) return null;

          const queryTokenSet = new Set(queryTokens);
          const candidateIndexes = new Set<number>();
          queryTokens.forEach((token) => {
            const bucket = issuedTokenIndex.get(token);
            if (!bucket) return;
            for (const index of bucket) candidateIndexes.add(index);
          });

          if (candidateIndexes.size === 0) return null;

          const normalizedDesc = normalizeDescriptionToken(product.description);
          const normalizedNcm = normalizeToken(product.ncm);
          const normalizedUnit = normalizeUnit(product.unit);
          const normalizedEan = normalizeToken(product.ean).replace(/\D/g, '');

          let best: { entry: IssuedAnvisaEntry; score: number } | null = null;

          const candidateIndexList = Array.from(candidateIndexes);
          for (let index = 0; index < candidateIndexList.length; index += 1) {
            const candidateIndex = candidateIndexList[index];
            const entry = issuedEntries[candidateIndex];
            if (!entry) continue;

            const entryTokenSet = new Set(entry.tokens);
            let commonTokens = 0;
            queryTokenSet.forEach((token) => {
              if (entryTokenSet.has(token)) commonTokens += 1;
            });

            const overlapScore = commonTokens / queryTokens.length;
            const containsScore =
              entry.normalizedName.includes(normalizedDesc) || normalizedDesc.includes(entry.normalizedName)
                ? 1
                : 0;
            const ncmScore = normalizedNcm && normalizeToken(entry.ncm) === normalizedNcm ? 1 : 0;
            const unitScore = normalizedUnit && normalizeToken(entry.unit) === normalizedUnit ? 1 : 0;
            const eanEntry = normalizeToken(entry.ean).replace(/\D/g, '');
            const eanScore = normalizedEan && eanEntry && normalizedEan === eanEntry ? 1 : 0;
            const freqBoost = Math.min(0.06, Math.max(0, entry.occurrences - 1) * 0.01);

            const score =
              overlapScore * 0.58 +
              containsScore * 0.22 +
              ncmScore * 0.08 +
              unitScore * 0.05 +
              eanScore * 0.07 +
              freqBoost;

            if (!best || score > best.score) {
              best = { entry, score };
            }
          }

          if (!best || best.score < 0.60) return null;
          return best;
        };

        for (const product of productsWithoutAnvisa) {
          const keys = buildLookupKeys({
            code: product.code,
            description: product.description,
            ncm: product.ncm,
            unit: product.unit,
            ean: product.ean,
          });

          let selected: IssuedAnvisaCandidate | null = null;
          for (const key of keys) {
            const candidate = bestCandidateByKey.get(key);
            if (!candidate) continue;
            selected = candidate;
            break;
          }

          if (!selected) continue;

          product.anvisa = selected.registration;
          product.anvisaMatchMethod = 'issued_nfe';
          product.anvisaConfidence = getKeyConfidence(selected.keyUsed, selected.matchCount);
          product.anvisaMatchedProductName = selected.productName;
          product.anvisaHolder = null;
          product.anvisaProcess = null;
          product.anvisaStatus = `Encontrado em NF-e emitida (${selected.matchCount} ocorrência${selected.matchCount > 1 ? 's' : ''})`;
          product.anvisaDataset = null;
        }

        const stillWithoutAnvisa = productsWithoutAnvisa.filter((product) => !product.anvisa);
        for (const product of stillWithoutAnvisa) {
          const fuzzy = findByFuzzyDescription(product);
          if (!fuzzy) continue;

          const confidence = Math.min(0.97, Number((0.74 + fuzzy.score * 0.22).toFixed(3)));
          product.anvisa = fuzzy.entry.registration;
          product.anvisaMatchMethod = 'issued_nfe';
          product.anvisaConfidence = confidence;
          product.anvisaMatchedProductName = fuzzy.entry.productName;
          product.anvisaHolder = null;
          product.anvisaProcess = null;
          product.anvisaStatus = `Inferido por similaridade em NF-e emitida (${Math.round(fuzzy.score * 100)}%)`;
          product.anvisaDataset = null;
        }
      }
    }

    if (useAnvisaLookup) {
      const productsWithoutAnvisa = products.filter((product) => !product.anvisa);

      if (productsWithoutAnvisa.length > 0) {
        const enriched = await Promise.allSettled(
          productsWithoutAnvisa.map(async (product) => {
            const match = await resolveAnvisaByCodeAndName({
              code: product.code,
              description: product.description,
            });

            if (!match) return;

            product.anvisa = match.registration;
            product.anvisaMatchMethod = match.method;
            product.anvisaConfidence = match.confidence;
            product.anvisaMatchedProductName = match.matchedProductName;
            product.anvisaHolder = match.holder;
            product.anvisaProcess = match.process;
            product.anvisaStatus = match.status;
            product.anvisaDataset = match.source;
          }),
        );

        const failedLookups = enriched.filter((item) => item.status === 'rejected').length;
        if (failedLookups > 0) {
          console.warn(`ANVISA lookup failed for ${failedLookups} product(s)`);
        }
      }
    }

    if (products.length > 0) {
      const registryRows = await getProductRegistryByKeys(
        company.id,
        products.map((product) => product.key),
      );

      const registryByKey = new Map(registryRows.map((row) => [row.productKey, row]));

      for (const product of products) {
        const registry = registryByKey.get(product.key);
        if (!registry) continue;

        if ((!product.code || product.code === '-') && registry.code) {
          product.code = registry.code;
        }
        if ((!product.description || product.description === 'Item sem descrição') && registry.description) {
          product.description = registry.description;
        }
        if (!product.ncm && registry.ncm) {
          product.ncm = registry.ncm;
        }
        if ((!product.unit || product.unit === '-') && registry.unit) {
          product.unit = registry.unit;
        }
        if (!product.ean && registry.ean) {
          product.ean = registry.ean;
        }

        if (registry.codigo) product.codigo = registry.codigo;
        if (registry.shortName) product.shortName = registry.shortName;
        if (registry.productType) product.productType = registry.productType;
        if (registry.productSubtype) product.productSubtype = registry.productSubtype;
        if (registry.productSubgroup) product.productSubgroup = registry.productSubgroup;
        if (registry.outOfLine) product.outOfLine = true;
        if (registry.instrumental) product.instrumental = true;

        // Fiscal data
        if (registry.fiscalSitTributaria != null) product.fiscalSitTributaria = registry.fiscalSitTributaria;
        if (registry.fiscalNomeTributacao != null) product.fiscalNomeTributacao = registry.fiscalNomeTributacao;
        if (registry.fiscalIcms != null) product.fiscalIcms = registry.fiscalIcms;
        if (registry.fiscalPis != null) product.fiscalPis = registry.fiscalPis;
        if (registry.fiscalCofins != null) product.fiscalCofins = registry.fiscalCofins;
        if (registry.fiscalObs != null) product.fiscalObs = registry.fiscalObs;
        if (registry.fiscalCest != null) product.fiscalCest = registry.fiscalCest;
        if (registry.fiscalOrigem != null) product.fiscalOrigem = registry.fiscalOrigem;
        if (registry.fiscalCfopEntrada != null) product.fiscalCfopEntrada = registry.fiscalCfopEntrada;
        if (registry.fiscalCfopSaida != null) product.fiscalCfopSaida = registry.fiscalCfopSaida;
        if (registry.fiscalIpi != null) product.fiscalIpi = registry.fiscalIpi;
        if (registry.fiscalFcp != null) product.fiscalFcp = registry.fiscalFcp;
        if (registry.fiscalCstIpi != null) product.fiscalCstIpi = registry.fiscalCstIpi;
        if (registry.fiscalCstPis != null) product.fiscalCstPis = registry.fiscalCstPis;
        if (registry.fiscalCstCofins != null) product.fiscalCstCofins = registry.fiscalCstCofins;
        if (registry.fiscalObsIcms != null) product.fiscalObsIcms = registry.fiscalObsIcms;
        if (registry.fiscalObsPisCofins != null) product.fiscalObsPisCofins = registry.fiscalObsPisCofins;
        if (registry.productRefs.length > 0) product.productRefs = registry.productRefs;

        // Always apply open-data enrichment (expiration, risk class, holder, product name)
        // regardless of ANVISA source — these come from the ANVISA open data import
        if (registry.anvisaExpiration) product.anvisaExpiration = registry.anvisaExpiration;
        if (registry.anvisaRiskClass) product.anvisaRiskClass = registry.anvisaRiskClass;
        if (registry.anvisaMatchedProductName) product.anvisaMatchedProductName = registry.anvisaMatchedProductName;
        if (registry.anvisaHolder) product.anvisaHolder = registry.anvisaHolder;
        if (registry.anvisaProcess) product.anvisaProcess = registry.anvisaProcess;
        if (registry.anvisaStatus && !product.anvisaStatus) product.anvisaStatus = registry.anvisaStatus;
        if (registry.anvisaManufacturer) product.anvisaManufacturer = registry.anvisaManufacturer;
        if (registry.anvisaManufacturerCountry) product.anvisaManufacturerCountry = registry.anvisaManufacturerCountry;
        if (registry.manufacturerShortName) product.manufacturerShortName = registry.manufacturerShortName;

        const registryAnvisa = normalizeAnvisaRegistration(registry.anvisaCode);
        const registrySource = cleanString(registry.anvisaSource) as
          | 'manual'
          | 'xml'
          | 'issued_nfe'
          | 'catalog_code_exact'
          | 'catalog_name'
          | null;

        if (registrySource === 'manual') {
          product.anvisa = registryAnvisa;
          product.anvisaMatchMethod = 'manual';
          product.anvisaConfidence = registryAnvisa ? 1 : null;
          product.anvisaDataset = null;
          continue;
        }

        if (!product.anvisa && registryAnvisa) {
          product.anvisa = registryAnvisa;
          product.anvisaMatchMethod = registrySource || 'catalog_name';
          product.anvisaConfidence = registry.anvisaConfidence;
          product.anvisaDataset = null;
        }
      }
    }

    if (search) {
      const normalizedSearch = normalizeForSearch(search);
      const searchDigits = search.replace(/\D/g, '');

      products = products.filter((product) => {
        const normalizedDescription = normalizeForSearch(product.description);
        const normalizedCode = normalizeForSearch(product.code || '');
        const normalizedNcm = normalizeForSearch(product.ncm || '');
        const normalizedAnvisa = normalizeForSearch(product.anvisa || '');

        if (normalizedDescription.includes(normalizedSearch)) return true;
        if (normalizedCode.includes(normalizedSearch)) return true;
        if (normalizedNcm.includes(normalizedSearch)) return true;
        if (normalizedAnvisa.includes(normalizedSearch)) return true;

        if (searchDigits) {
          const codeDigits = (product.code || '').replace(/\D/g, '');
          const ncmDigits = (product.ncm || '').replace(/\D/g, '');
          const anvisaDigits = (product.anvisa || '').replace(/\D/g, '');
          if (
            codeDigits.includes(searchDigits) ||
            ncmDigits.includes(searchDigits) ||
            anvisaDigits.includes(searchDigits)
          ) {
            return true;
          }
        }

        return false;
      });
    }

    if (onlyMissingAnvisa) {
      products = products.filter((product) => !product.anvisa);
    }

    if (sort === 'lastSale') {
      await enrichLastSaleDateForProducts(company.id, products);
    }

    products.sort((a, b) => {
      let comparison = 0;

      switch (sort) {
        case 'code':
          comparison = compareStrings(a.code || '', b.code || '');
          break;
        case 'description':
          comparison = compareStrings(a.description, b.description);
          break;
        case 'ncm':
          comparison = compareStrings(a.ncm || '', b.ncm || '');
          break;
        case 'anvisa':
          comparison = compareStrings(a.anvisa || '', b.anvisa || '');
          break;
        case 'unit':
          comparison = compareStrings(a.unit || '', b.unit || '');
          break;
        case 'quantity':
          comparison = a.totalQuantity - b.totalQuantity;
          break;
        case 'invoices':
          comparison = a.invoiceCount - b.invoiceCount;
          break;
        case 'lastPrice':
          comparison = a.lastPrice - b.lastPrice;
          break;
        case 'lastSale':
          comparison = (a.lastSaleDate ? new Date(a.lastSaleDate).getTime() : 0)
            - (b.lastSaleDate ? new Date(b.lastSaleDate).getTime() : 0);
          break;
        case 'supplier':
          comparison = compareStrings(a.lastSupplierName || '', b.lastSupplierName || '');
          break;
        case 'lastIssue':
        default:
          comparison = (a.lastIssueDate ? new Date(a.lastIssueDate).getTime() : 0)
            - (b.lastIssueDate ? new Date(b.lastIssueDate).getTime() : 0);
          break;
      }

      if (comparison === 0) {
        comparison = compareStrings(a.description, b.description);
      }

      return order === 'asc' ? comparison : -comparison;
    });

    const total = products.length;
    const pages = Math.max(1, Math.ceil(total / limit));
    const normalizedPage = Math.min(page, pages);
    const start = (normalizedPage - 1) * limit;
    const paginatedProducts = exportAll ? products : products.slice(start, start + limit);

    if (sort !== 'lastSale') {
      await enrichLastSaleDateForProducts(company.id, paginatedProducts);
    }

    const summary = {
      totalProducts: total,
      productsWithAnvisa: products.filter((product) => !!product.anvisa).length,
      totalQuantity: products.reduce((acc, product) => acc + product.totalQuantity, 0),
      invoicesProcessed: invoiceMetadata.length,
    };

    const anvisaStats = products.reduce(
      (acc, product) => {
        if (!product.anvisa || !product.anvisaMatchMethod) {
          acc.missing += 1;
          return acc;
        }

        if (product.anvisaMatchMethod === 'manual') {
          acc.manual += 1;
          return acc;
        }

        if (product.anvisaMatchMethod === 'xml') {
          acc.xml += 1;
          return acc;
        }

        if (product.anvisaMatchMethod === 'issued_nfe') {
          acc.issuedNfe += 1;
          return acc;
        }

        acc.catalog += 1;
        return acc;
      },
      { manual: 0, xml: 0, issuedNfe: 0, catalog: 0, missing: 0 },
    );

    return NextResponse.json({
      products: paginatedProducts,
      summary,
      pagination: {
        page: normalizedPage,
        limit,
        total,
        pages,
      },
      meta: {
        invoicesLimited: invoiceMetadata.length >= MAX_INVOICES,
        maxInvoices: MAX_INVOICES,
        anvisaStats,
      },
    });
  } catch (error) {
    console.error('Error fetching products:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
