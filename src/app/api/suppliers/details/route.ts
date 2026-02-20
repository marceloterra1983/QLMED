import { NextResponse } from 'next/server';
import xml2js from 'xml2js';
import { requireAuth, unauthorizedResponse } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { getOrCreateSingleCompany } from '@/lib/single-company';

const MAX_INVOICES = 500;
const MAX_PRICE_ROWS = 300;

const xmlParser = new xml2js.Parser({
  explicitArray: false,
  mergeAttrs: true,
  tagNameProcessors: [xml2js.processors.stripPrefix],
});

function cleanString(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  const normalized = String(value).trim();
  return normalized.length > 0 ? normalized : null;
}

function normalizeDocument(value: string | null | undefined): string {
  return (value || '').replace(/\D/g, '');
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

async function extractSupplierDataFromXml(xmlContent: string) {
  try {
    const parsed = await xmlParser.parseStringPromise(xmlContent);
    const nfeProc = parsed?.nfeProc || parsed?.NFe || parsed;
    const nfe = nfeProc?.NFe || parsed?.NFe || nfeProc;
    const infNFe = nfe?.infNFe || nfe;
    const emit = infNFe?.emit || {};
    const enderEmit = emit?.enderEmit || {};

    return {
      name: cleanString(emit?.xNome),
      fantasyName: cleanString(emit?.xFant),
      cnpj: normalizeDocument(cleanString(emit?.CNPJ) || cleanString(emit?.CPF)),
      stateRegistration: cleanString(emit?.IE),
      municipalRegistration: cleanString(emit?.IM),
      phone: cleanString(enderEmit?.fone) || cleanString(emit?.fone),
      email: cleanString(emit?.email),
      address: {
        street: cleanString(enderEmit?.xLgr),
        number: cleanString(enderEmit?.nro),
        complement: cleanString(enderEmit?.xCpl),
        district: cleanString(enderEmit?.xBairro),
        city: cleanString(enderEmit?.xMun),
        state: cleanString(enderEmit?.UF),
        zipCode: cleanString(enderEmit?.CEP),
        country: cleanString(enderEmit?.xPais),
      },
    };
  } catch {
    return null;
  }
}

async function extractInvoiceDataFromXml(xmlContent: string) {
  try {
    const parsed = await xmlParser.parseStringPromise(xmlContent);
    const nfeProc = parsed?.nfeProc || parsed?.NFe || parsed;
    const nfe = nfeProc?.NFe || parsed?.NFe || nfeProc;
    const infNFe = nfe?.infNFe || nfe;
    const dets = ensureArray<any>(infNFe?.det);
    const products = dets.map((det) => {
      const prod = det?.prod || {};
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

    return { products, duplicates };
  } catch {
    return { products: [], duplicates: [] };
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
    const cnpj = normalizeDocument(searchParams.get('cnpj'));
    const name = (searchParams.get('name') || '').trim();

    if (!cnpj && !name) {
      return NextResponse.json({ error: 'Fornecedor não informado' }, { status: 400 });
    }

    const baseWhere = {
      companyId: company.id,
      type: 'NFE',
      direction: 'received',
    };

    let supplierWhere: any = null;
    if (cnpj) {
      supplierWhere = { ...baseWhere, senderCnpj: { contains: cnpj } };
    } else if (name) {
      supplierWhere = { ...baseWhere, senderName: name };
    }

    let invoices = await prisma.invoice.findMany({
      where: supplierWhere,
      orderBy: [
        { issueDate: 'desc' },
        { createdAt: 'desc' },
      ],
      take: MAX_INVOICES,
      select: {
        id: true,
        accessKey: true,
        number: true,
        series: true,
        issueDate: true,
        senderCnpj: true,
        senderName: true,
        totalValue: true,
        status: true,
        xmlContent: true,
      },
    });

    if (invoices.length === 0 && cnpj && name) {
      supplierWhere = { ...baseWhere, senderName: name };
      invoices = await prisma.invoice.findMany({
        where: supplierWhere,
        orderBy: [
          { issueDate: 'desc' },
          { createdAt: 'desc' },
        ],
        take: MAX_INVOICES,
        select: {
          id: true,
          accessKey: true,
          number: true,
          series: true,
          issueDate: true,
          senderCnpj: true,
          senderName: true,
          totalValue: true,
          status: true,
          xmlContent: true,
        },
      });
    }

    const latestInvoice = invoices[0];

    if (!latestInvoice) {
      return NextResponse.json({ error: 'Fornecedor não encontrado' }, { status: 404 });
    }

    const extracted = await extractSupplierDataFromXml(latestInvoice.xmlContent);
    const normalizedLatestDocument = normalizeDocument(latestInvoice.senderCnpj);

    const filteredInvoices = normalizedLatestDocument
      ? invoices.filter((invoice) => normalizeDocument(invoice.senderCnpj) === normalizedLatestDocument)
      : invoices.filter((invoice) => invoice.senderName === latestInvoice.senderName);

    const totalInvoices = filteredInvoices.length;
    const totalValue = filteredInvoices.reduce((acc, invoice) => acc + (invoice.totalValue || 0), 0);
    const lastIssueDate = filteredInvoices[0]?.issueDate || null;
    const firstIssueDate = filteredInvoices[totalInvoices - 1]?.issueDate || null;
    const averageTicket = totalInvoices > 0 ? totalValue / totalInvoices : 0;
    const confirmedInvoices = filteredInvoices.filter((invoice) => invoice.status === 'confirmed').length;
    const rejectedInvoices = filteredInvoices.filter((invoice) => invoice.status === 'rejected').length;
    const pendingInvoices = filteredInvoices.filter((invoice) => invoice.status === 'received').length;

    const priceMap = new Map<string, {
      code: string;
      description: string;
      unit: string;
      totalQuantity: number;
      totalValue: number;
      minPrice: number;
      maxPrice: number;
      lastPrice: number;
      lastIssueDate: Date | null;
      lastInvoiceNumber: string | null;
      invoiceIds: Set<string>;
    }>();
    const duplicatesList: Array<{
      invoiceNumber: string;
      installmentNumber: string;
      dueDate: string | null;
      installmentValue: number;
    }> = [];

    for (const invoice of filteredInvoices) {
      const { products, duplicates } = await extractInvoiceDataFromXml(invoice.xmlContent);
      for (const product of products) {
        const key = `${product.code}::${product.description}::${product.unit}`;
        const existing = priceMap.get(key);

        if (!existing) {
          priceMap.set(key, {
            code: product.code,
            description: product.description,
            unit: product.unit,
            totalQuantity: product.quantity,
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

      for (const duplicate of duplicates) {
        duplicatesList.push({
          invoiceNumber: invoice.number,
          installmentNumber: duplicate.installmentNumber,
          dueDate: duplicate.dueDate,
          installmentValue: duplicate.installmentValue,
        });
      }
    }

    const priceTable = Array.from(priceMap.values())
      .map((item) => ({
        code: item.code,
        description: item.description,
        unit: item.unit,
        invoiceCount: item.invoiceIds.size,
        totalQuantity: item.totalQuantity,
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
    const totalPurchasedItems = priceTable.reduce((acc, item) => acc + item.totalQuantity, 0);
    const totalProductsPurchased = priceTable.length;

    const invoicesList = filteredInvoices.map((invoice) => ({
      id: invoice.id,
      number: invoice.number,
      series: invoice.series,
      issueDate: invoice.issueDate,
      totalValue: invoice.totalValue,
      status: invoice.status,
      accessKey: invoice.accessKey,
    }));
    const duplicates = [...duplicatesList].sort((a, b) => {
      const aTime = a.dueDate ? new Date(a.dueDate).getTime() : Number.POSITIVE_INFINITY;
      const bTime = b.dueDate ? new Date(b.dueDate).getTime() : Number.POSITIVE_INFINITY;

      if (aTime !== bTime) return aTime - bTime;

      const byInvoice = a.invoiceNumber.localeCompare(b.invoiceNumber, 'pt-BR', { sensitivity: 'base' });
      if (byInvoice !== 0) return byInvoice;

      return a.installmentNumber.localeCompare(b.installmentNumber, 'pt-BR', { sensitivity: 'base' });
    });

    return NextResponse.json({
      supplier: {
        name: extracted?.name || latestInvoice.senderName || 'Fornecedor não identificado',
        fantasyName: extracted?.fantasyName,
        cnpj: extracted?.cnpj || normalizeDocument(latestInvoice.senderCnpj),
        stateRegistration: extracted?.stateRegistration,
        municipalRegistration: extracted?.municipalRegistration,
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
    });
  } catch (error) {
    console.error('Error fetching supplier details:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
