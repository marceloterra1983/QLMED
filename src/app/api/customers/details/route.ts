import { NextResponse } from 'next/server';
import { requireAuth, unauthorizedResponse } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { getOrCreateSingleCompany } from '@/lib/single-company';
import { parseXmlSafe } from '@/lib/safe-xml-parser';

const MAX_INVOICES = 500;
const MAX_PRICE_ROWS = 300;

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

async function extractCustomerDataFromXml(xmlContent: string) {
  try {
    const parsed = await parseXmlSafe(xmlContent);
    const nfeProc = parsed?.nfeProc || parsed?.NFe || parsed;
    const nfe = nfeProc?.NFe || parsed?.NFe || nfeProc;
    const infNFe = nfe?.infNFe || nfe;
    const dest = infNFe?.dest || {};
    const enderDest = dest?.enderDest || {};

    return {
      name: cleanString(dest?.xNome),
      fantasyName: cleanString(dest?.xFant),
      cnpj: normalizeDocument(cleanString(dest?.CNPJ) || cleanString(dest?.CPF)),
      stateRegistration: cleanString(dest?.IE),
      municipalRegistration: cleanString(dest?.IM),
      phone: cleanString(enderDest?.fone) || cleanString(dest?.fone),
      email: cleanString(dest?.email),
      address: {
        street: cleanString(enderDest?.xLgr),
        number: cleanString(enderDest?.nro),
        complement: cleanString(enderDest?.xCpl),
        district: cleanString(enderDest?.xBairro),
        city: cleanString(enderDest?.xMun),
        state: cleanString(enderDest?.UF),
        zipCode: cleanString(enderDest?.CEP),
        country: cleanString(enderDest?.xPais),
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

const XML_BATCH_SIZE = 50;

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
    const metaOnly = searchParams.get('metaOnly') === '1';

    if (!cnpj && !name) {
      return NextResponse.json({ error: 'Cliente não informado' }, { status: 400 });
    }

    const baseWhere = {
      companyId: company.id,
      type: 'NFE' as const,
      direction: 'issued' as const,
    };

    const metadataSelect = {
      id: true,
      accessKey: true,
      number: true,
      series: true,
      issueDate: true,
      recipientCnpj: true,
      recipientName: true,
      totalValue: true,
      status: true,
    };

    let customerWhere: any = null;
    if (cnpj) {
      customerWhere = { ...baseWhere, recipientCnpj: { contains: cnpj } };
    } else if (name) {
      customerWhere = { ...baseWhere, recipientName: name };
    }

    // Step 1: Fetch metadata WITHOUT xmlContent (fast, lightweight)
    let invoices = await prisma.invoice.findMany({
      where: customerWhere,
      orderBy: [{ issueDate: 'desc' }, { createdAt: 'desc' }],
      take: MAX_INVOICES,
      select: metadataSelect,
    });

    if (invoices.length === 0 && cnpj && name) {
      customerWhere = { ...baseWhere, recipientName: name };
      invoices = await prisma.invoice.findMany({
        where: customerWhere,
        orderBy: [{ issueDate: 'desc' }, { createdAt: 'desc' }],
        take: MAX_INVOICES,
        select: metadataSelect,
      });
    }

    const latestInvoice = invoices[0];
    if (!latestInvoice) {
      return NextResponse.json({ error: 'Cliente não encontrado' }, { status: 404 });
    }

    const normalizedLatestDocument = normalizeDocument(latestInvoice.recipientCnpj);
    const filteredInvoices = normalizedLatestDocument
      ? invoices.filter((invoice) => normalizeDocument(invoice.recipientCnpj) === normalizedLatestDocument)
      : invoices.filter((invoice) => invoice.recipientName === latestInvoice.recipientName);

    // Step 2: Load xmlContent ONLY for the latest invoice (customer info)
    const latestWithXml = await prisma.invoice.findUnique({
      where: { id: latestInvoice.id },
      select: { xmlContent: true },
    });
    const extracted = latestWithXml
      ? await extractCustomerDataFromXml(latestWithXml.xmlContent)
      : null;
    const customerName = extracted?.name || latestInvoice.recipientName || 'Cliente não identificado';
    const customerCnpj = extracted?.cnpj || normalizeDocument(latestInvoice.recipientCnpj);

    // Step 3: Compute stats from metadata (no XML needed)
    const totalInvoices = filteredInvoices.length;
    const totalValue = filteredInvoices.reduce((acc, invoice) => acc + (invoice.totalValue || 0), 0);
    const lastIssueDate = filteredInvoices[0]?.issueDate || null;
    const firstIssueDate = filteredInvoices[totalInvoices - 1]?.issueDate || null;
    const averageTicket = totalInvoices > 0 ? totalValue / totalInvoices : 0;
    const confirmedInvoices = filteredInvoices.filter((invoice) => invoice.status === 'confirmed').length;
    const rejectedInvoices = filteredInvoices.filter((invoice) => invoice.status === 'rejected').length;
    const pendingInvoices = filteredInvoices.filter((invoice) => invoice.status === 'received').length;

    // Fast path: metaOnly skips all XML batch processing
    if (metaOnly) {
      return NextResponse.json({
        customer: {
          name: customerName,
          cnpj: customerCnpj,
        },
        meta: {
          totalInvoices,
          totalValue,
        },
      });
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
    const duplicatesList: Array<{
      invoiceId: string;
      invoiceNumber: string;
      installmentNumber: string;
      dueDate: string | null;
      installmentValue: number;
      installmentTotal: number;
    }> = [];

    // Process in batches of XML_BATCH_SIZE
    for (let i = 0; i < filteredInvoices.length; i += XML_BATCH_SIZE) {
      const batchMeta = filteredInvoices.slice(i, i + XML_BATCH_SIZE);
      const batchIds = batchMeta.map((inv) => inv.id);

      // Load xmlContent for this batch only
      const batchWithXml = await prisma.invoice.findMany({
        where: { id: { in: batchIds } },
        select: { id: true, xmlContent: true },
      });
      const xmlMap = new Map(batchWithXml.map((inv) => [inv.id, inv.xmlContent]));

      // Parse XML in parallel within the batch (tolerant to individual failures)
      const batchSettled = await Promise.allSettled(
        batchMeta.map(async (invoice) => {
          const xml = xmlMap.get(invoice.id);
          if (!xml) return null;
          const parsed = await extractInvoiceDataFromXml(xml);
          return { invoice, ...parsed };
        })
      );

      for (const settled of batchSettled) {
        const result = settled.status === 'fulfilled' ? settled.value : null;
        if (!result) continue;
        const { invoice, products, duplicates } = result;
        const issueDate = invoice.issueDate ? new Date(invoice.issueDate) : null;
        const issueTime = issueDate?.getTime() || 0;
        const isFrom2025 = issueDate ? issueDate.getUTCFullYear() === 2025 : false;
        const isFrom2026ToToday = issueDate ? issueTime >= startOf2026.getTime() && issueTime <= now.getTime() : false;

        for (const product of products) {
          const key = `${product.code}::${product.description}::${product.unit}`;

          if (metaOnly) {
            priceKeySet.add(key);
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

    const priceTable = metaOnly
      ? []
      : Array.from(priceMap.values())
        .map((item) => ({
          code: item.code,
          description: item.description,
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

    // (metaOnly is handled above via fast path)
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
      const aTime = a.dueDate ? new Date(a.dueDate).getTime() : 0;
      const bTime = b.dueDate ? new Date(b.dueDate).getTime() : 0;

      if (aTime !== bTime) return bTime - aTime;

      const byInvoice = b.invoiceNumber.localeCompare(a.invoiceNumber, 'pt-BR', { sensitivity: 'base' });
      if (byInvoice !== 0) return byInvoice;

      return b.installmentNumber.localeCompare(a.installmentNumber, 'pt-BR', { sensitivity: 'base' });
    });

    return NextResponse.json({
      customer: {
        name: customerName,
        fantasyName: extracted?.fantasyName,
        cnpj: customerCnpj,
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
    console.error('Error fetching customer details:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
