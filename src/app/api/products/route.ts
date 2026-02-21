import { NextResponse } from 'next/server';
import { requireAuth, unauthorizedResponse } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { getOrCreateSingleCompany } from '@/lib/single-company';
import { parseXmlSafe } from '@/lib/safe-xml-parser';
import { normalizeForSearch } from '@/lib/utils';

const MAX_INVOICES = 3000;
const XML_BATCH_SIZE = 50;
const MAX_LIMIT = 200;

interface ProductFromXml {
  code: string;
  description: string;
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
  unit: string;
  anvisa: string | null;
  totalQuantity: number;
  totalValue: number;
  lastPrice: number;
  lastIssueDate: Date | null;
  lastSupplierName: string | null;
  lastSupplierCnpj: string | null;
  invoiceIds: Set<string>;
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

function extractAnvisa(det: any, prod: any): string | null {
  const candidates: Array<string | null> = [
    cleanString(prod?.cProdANVISA),
    ...ensureArray<any>(det?.med).map((med) => cleanString(med?.cProdANVISA)),
    ...ensureArray<any>(prod?.med).map((med) => cleanString(med?.cProdANVISA)),
  ];

  for (const candidate of candidates) {
    if (candidate) return candidate;
  }

  return null;
}

function buildProductKey(product: ProductFromXml): string {
  const anvisaToken = normalizeToken(product.anvisa);
  if (anvisaToken) {
    return `ANVISA:${anvisaToken}`;
  }

  const eanToken = normalizeToken(product.ean).replace(/\D/g, '');
  if (eanToken && eanToken !== '0') {
    return `EAN:${eanToken}`;
  }

  const codeToken = normalizeToken(product.code);
  const unitToken = normalizeToken(product.unit) || '-';
  if (codeToken && codeToken !== '-') {
    return `CODE:${codeToken}::UNIT:${unitToken}`;
  }

  const descriptionToken = normalizeForSearch(product.description || 'item-sem-descricao');
  return `DESC:${descriptionToken}::UNIT:${unitToken}`;
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

    if (invoiceMetadata.length === 0) {
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

    const productMap = new Map<string, AggregatedProduct>();

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
              unit: product.unit,
              anvisa: product.anvisa,
              totalQuantity: product.quantity,
              totalValue: product.totalValue,
              lastPrice: product.unitPrice,
              lastIssueDate: issueDate,
              lastSupplierName: invoice.senderName || null,
              lastSupplierCnpj: invoice.senderCnpj || null,
              invoiceIds: new Set([invoice.id]),
            });
            continue;
          }

          existing.totalQuantity += product.quantity;
          existing.totalValue += product.totalValue;
          existing.invoiceIds.add(invoice.id);

          if (!existing.anvisa && product.anvisa) {
            existing.anvisa = product.anvisa;
          }

          if (
            (!existing.code || existing.code === '-') &&
            product.code &&
            product.code !== '-'
          ) {
            existing.code = product.code;
          }

          if (issueDate && (!existing.lastIssueDate || issueDate > existing.lastIssueDate)) {
            existing.lastIssueDate = issueDate;
            existing.lastPrice = product.unitPrice;
            existing.lastSupplierName = invoice.senderName || null;
            existing.lastSupplierCnpj = invoice.senderCnpj || null;
          }
        }
      }
    }

    let products = Array.from(productMap.values()).map((item) => ({
      key: item.key,
      code: item.code,
      description: item.description,
      unit: item.unit,
      anvisa: item.anvisa,
      totalQuantity: item.totalQuantity,
      invoiceCount: item.invoiceIds.size,
      lastIssueDate: item.lastIssueDate,
      lastPrice: item.lastPrice,
      averagePrice: item.totalQuantity > 0 ? item.totalValue / item.totalQuantity : 0,
      lastSupplierName: item.lastSupplierName,
      lastSupplierCnpj: item.lastSupplierCnpj,
    }));

    if (search) {
      const normalizedSearch = normalizeForSearch(search);
      const searchDigits = search.replace(/\D/g, '');

      products = products.filter((product) => {
        const normalizedDescription = normalizeForSearch(product.description);
        const normalizedCode = normalizeForSearch(product.code || '');
        const normalizedAnvisa = normalizeForSearch(product.anvisa || '');

        if (normalizedDescription.includes(normalizedSearch)) return true;
        if (normalizedCode.includes(normalizedSearch)) return true;
        if (normalizedAnvisa.includes(normalizedSearch)) return true;

        if (searchDigits) {
          const codeDigits = (product.code || '').replace(/\D/g, '');
          const anvisaDigits = (product.anvisa || '').replace(/\D/g, '');
          if (codeDigits.includes(searchDigits) || anvisaDigits.includes(searchDigits)) return true;
        }

        return false;
      });
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
    const paginatedProducts = products.slice(start, start + limit);

    const summary = {
      totalProducts: total,
      productsWithAnvisa: products.filter((product) => !!product.anvisa).length,
      totalQuantity: products.reduce((acc, product) => acc + product.totalQuantity, 0),
      invoicesProcessed: invoiceMetadata.length,
    };

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
      },
    });
  } catch (error) {
    console.error('Error fetching products:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
