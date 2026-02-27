import { NextResponse } from 'next/server';
import { requireAuth, unauthorizedResponse } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { getOrCreateSingleCompany } from '@/lib/single-company';
import { parseXmlSafe } from '@/lib/safe-xml-parser';
import { isImportEntryCfop, getCfopTagByCode } from '@/lib/cfop';
import { ensureProductRegistryTable } from '@/lib/product-registry-store';

/* ── Inline helpers (same pattern as products/route.ts) ── */

const RESALE_CUSTOMER_PATTERNS = ['NAVIX', 'PRIME'];

/* CNPJs that should be merged as the same customer. Key = secondary CNPJ, Value = primary CNPJ */
const CNPJ_MERGE_MAP: Record<string, string> = {
  '60967551002790': '03604782000166', // Instituto Presbiteriano Mackenzie → Associação Beneficiente Douradense
};

function isResaleCustomer(recipientName: string | null | undefined): boolean {
  if (!recipientName) return false;
  const upper = recipientName.toUpperCase();
  return RESALE_CUSTOMER_PATTERNS.some((p) => upper.includes(p));
}

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
};

function normalizeUnit(raw: string | null | undefined): string {
  const upper = (raw || '').trim().toUpperCase().replace(/\./g, '');
  return UNIT_ALIASES[upper] || upper || '-';
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
    ...ensureArray<any>(det?.med).map((med: any) => cleanString(med?.cProdANVISA)),
    ...ensureArray<any>(prod?.med).map((med: any) => cleanString(med?.cProdANVISA)),
    extractAnvisaFromFreeText(cleanString(det?.infAdProd)),
    extractAnvisaFromFreeText(cleanString(prod?.xProd)),
  ];
  for (const candidate of candidates) {
    const normalized = normalizeAnvisaRegistration(candidate);
    if (normalized) return normalized;
  }
  return null;
}

interface ProductFromXml {
  code: string;
  description: string;
  unit: string;
  anvisa: string | null;
  quantity: number;
  totalValue: number;
  cfop: string | null;
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
      return {
        code: cleanString(prod?.cProd) || '-',
        description: cleanString(prod?.xProd) || 'Item sem descrição',
        unit: cleanString(prod?.uCom) || '-',
        anvisa: extractAnvisa(det, prod),
        quantity: toNumber(prod?.qCom),
        totalValue: toNumber(prod?.vProd),
        cfop: cleanString(prod?.CFOP),
      };
    });
  } catch {
    return [];
  }
}

function normalizeDescriptionToken(value: string | null | undefined) {
  return (value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/* ── Types ── */

interface ImportProduct {
  key: string;        // internal cProd code (from issued import invoice)
  code: string;
  description: string;
  shortName: string | null;
  unit: string;
  anvisa: string | null;
  purchasedQty: number;
  purchasedValue: number;
  soldQty: number;
  soldValue: number;
  resaleQty: number;
  resaleValue: number;
}

interface CustomerSale {
  customerName: string;
  totalQty: number;
  totalValue: number;
}

function abbreviateCompanyName(name: string): string {
  const suffixes = /\b(LTDA|ME|EPP|EIRELI|S[\s./]*A|S[\s./]*S|INDUSTRIA|COMERCIO|SERVICOS|DISTRIBUIDORA|IMPORTADORA|EXPORTADORA|MATERIAL|HOSPITALAR|MEDICO|CIRURGICO|PRODUTOS)\b/gi;
  let clean = name.replace(suffixes, '').replace(/[-.,/]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (clean.length > 30) clean = clean.substring(0, 30).trim();
  return clean || name.substring(0, 30);
}

interface CustomerYearEntry {
  customerName: string;
  shortName: string;
  totalQty: number;
  totalValue: number;
  lastSaleDate: string | null;
  lastUnitPrice: number | null;
  byYear: Record<string, { qty: number; value: number }>;
}

interface MonthlySeries {
  month: string;
  label: string;
  purchasedQty: number;
  purchasedValue: number;
  soldQty: number;
  soldValue: number;
}

const MAX_INVOICES = 20000;
const XML_BATCH_SIZE = 50;

/* ── Fixed list of product codes that belong to the "Válvulas Mecânicas Corcym" report ── */
const VALVULAS_CODES = new Set([
  '005030', '005031', '005051', '005032', '005033', '005034', '005035',
  '005160', '005029',
]);

const VALVULAS_LABELS: Record<string, string> = {
  '005160': 'MITRAL 25',
  '005029': 'MITRAL 27',
  '005030': 'MITRAL 29',
  '005031': 'MITRAL 31',
  '005051': 'MITRAL 33',
  '005032': 'AORTICA 21',
  '005033': 'AORTICA 23',
  '005034': 'AORTICA 25',
  '005035': 'AORTICA 27',
};

/* Estoque físico real informado pelo cliente (fev/2026) */
const REAL_STOCK: Record<string, number> = {
  '005032': 17, // A-21
  '005033': 20, // A-23
  '005034': 9,  // A-25
  '005035': 7,  // A-27
  '005160': 10, // M7-25
  '005029': 21, // M7-27
  '005030': 16, // M7-29
  '005031': 17, // M7-31
  '005051': 7,  // M7-33
};

/* Supplier codes → internal codes (for received invoices from Livanova / Prime) */
const SUPPLIER_CODE_MAP: Record<string, string> = {
  // Livanova
  'M7-029': '005030', // MITRAL 29
  'M7-031': '005031', // MITRAL 31
  'M7-033': '005051', // MITRAL 33
  'A5-021': '005032', // AORTICA 21
  'A5-023': '005033', // AORTICA 23
  'A5-025': '005034', // AORTICA 25
  'A5-027': '005035', // AORTICA 27
  'M7-025': '005160', // MITRAL 25
  'M7-027': '005029', // MITRAL 27
  // Prime (only mechanical valves, NOT enxertos/biológicas)
  '001479': '005031', // M7-031 - VALVULA MECANICA MITRAL 31
  '001492': '005033', // A5-023 - VALVULA MECANICA AORTICA 23
};

export async function GET(req: Request) {
  try {
    const userId = await requireAuth().catch(() => null);
    if (!userId) return unauthorizedResponse();

    const company = await getOrCreateSingleCompany(userId);
    await ensureProductRegistryTable();

    const importProductMap = new Map<string, ImportProduct>();

    // Load contact nicknames (short names) by CNPJ
    const allNicknames = await prisma.contactNickname.findMany({
      where: { companyId: company.id },
      select: { cnpj: true, shortName: true },
    });
    const nicknameMap = new Map(allNicknames.map((n) => [n.cnpj, n.shortName]));

    const issuedInvoices = await prisma.$queryRawUnsafe<Array<{
      id: string;
      issueDate: Date | null;
      recipientCnpj: string | null;
      recipientName: string | null;
      xmlContent: string;
    }>>(
      `SELECT id, "issueDate", "recipientCnpj", "recipientName", "xmlContent"
       FROM "Invoice"
       WHERE "companyId" = $1
         AND type = 'NFE'
         AND direction = 'issued'
       ORDER BY "issueDate" DESC
       LIMIT $2`,
      company.id,
      MAX_INVOICES,
    );

    // Load registry for shortName lookup
    const allRegistryRows = await prisma.$queryRawUnsafe<Array<{
      code: string | null;
      description: string;
      short_name: string | null;
      anvisa_code: string | null;
    }>>(
      `SELECT code, description, short_name, anvisa_code
       FROM product_registry
       WHERE company_id = $1`,
      company.id,
    );
    const registryByCode = new Map<string, { description: string; short_name: string | null; anvisa_code: string | null }>();
    for (const row of allRegistryRows) {
      if (row.code) registryByCode.set(row.code, row);
    }

    // Monthly series (last 12 months)
    const now = new Date();
    const monthlyMap = new Map<string, MonthlySeries>();
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const label = d.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' });
      monthlyMap.set(key, { month: key, label, purchasedQty: 0, purchasedValue: 0, soldQty: 0, soldValue: 0 });
    }

    const getMonthKey = (date: Date | null): string | null => {
      if (!date) return null;
      return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    };

    const customerSalesMap = new Map<string, CustomerSale>();
    const customerYearMap = new Map<string, CustomerYearEntry>();
    const yearsSet = new Set<number>();
    let issuedInvoicesScanned = 0;

    const getOrCreateImportProduct = (code: string, desc: string, unit: string, anvisa: string | null): ImportProduct => {
      let p = importProductMap.get(code);
      if (!p) {
        const reg = registryByCode.get(code);
        p = {
          key: code,
          code,
          description: VALVULAS_LABELS[code] || reg?.description || desc,
          shortName: reg?.short_name || null,
          unit: normalizeUnit(unit),
          anvisa: reg?.anvisa_code || anvisa,
          purchasedQty: 0,
          purchasedValue: 0,
          soldQty: 0,
          soldValue: 0,
          resaleQty: 0,
          resaleValue: 0,
        };
        importProductMap.set(code, p);
      }
      return p;
    };

    // Helper: resolve supplier code to internal code
    const resolveCode = (code: string): string => SUPPLIER_CODE_MAP[code] || code;

    // Helper: check if product code belongs to the fixed list (direct or via supplier mapping)
    const isTargetProduct = (code: string): boolean => VALVULAS_CODES.has(code) || VALVULAS_CODES.has(resolveCode(code));

    // Helper: match product to a target product by code (direct or via supplier mapping)
    const matchToTarget = (code: string): ImportProduct | null => {
      return importProductMap.get(code) || importProductMap.get(resolveCode(code)) || null;
    };

    // Pre-create all 9 target products so received invoices can always match
    for (const code of Array.from(VALVULAS_CODES)) {
      getOrCreateImportProduct(code, code, 'UN', null);
    }

    // ═══════════════════════════════════════════════════════════
    // PASS 1: Scan issued invoices — imports (CFOP 3xxx) as purchases,
    //         sales (other CFOPs) as sales. Only for target product codes.
    // ═══════════════════════════════════════════════════════════

    for (let i = 0; i < issuedInvoices.length; i += XML_BATCH_SIZE) {
      const batch = issuedInvoices.slice(i, i + XML_BATCH_SIZE);
      await Promise.allSettled(
        batch.map(async (inv) => {
          issuedInvoicesScanned++;
          const products = await extractProductsFromXml(inv.xmlContent);

          for (const prod of products) {
            if (!isTargetProduct(prod.code)) continue;

            const internalCode = resolveCode(prod.code);
            const cfop = prod.cfop;

            if (isImportEntryCfop(cfop)) {
              // Import entry (CFOP 3xxx) → accumulate as purchase
              const p = getOrCreateImportProduct(internalCode, prod.description, prod.unit, prod.anvisa);
              p.purchasedQty += prod.quantity;
              p.purchasedValue += prod.totalValue;
              const mk = getMonthKey(inv.issueDate);
              if (mk && monthlyMap.has(mk)) {
                const ms = monthlyMap.get(mk)!;
                ms.purchasedQty += prod.quantity;
                ms.purchasedValue += prod.totalValue;
              }
            } else {
              const tag = getCfopTagByCode(cfop);

              // Return/devolution CFOPs → count as stock entry (product comes back)
              const returnTags = ['Dev. Consig.', 'Dev. Venda'];
              if (tag && returnTags.includes(tag)) {
                const matched = importProductMap.get(internalCode);
                if (matched) {
                  matched.purchasedQty += prod.quantity;
                  matched.purchasedValue += prod.totalValue;
                }
                continue;
              }

              // Skip non-sale CFOPs (consignment out, comodato, etc.)
              const excludeTags = ['Consignação', 'Dev. Compra', 'Comodato', 'Ret. Comodato', 'Conserto', 'Ret. Demonstração', 'Ret. Ativo', 'Dev. Ativo Terceiro', 'Outras Entradas', 'Outras Saídas'];
              if (tag && excludeTags.includes(tag)) continue;
              if (cfop && (cfop.startsWith('1') || cfop.startsWith('2'))) continue;

              const matched = importProductMap.get(internalCode);
              if (!matched) continue;

              const isResale = isResaleCustomer(inv.recipientName);
              if (isResale) {
                matched.resaleQty += prod.quantity;
                matched.resaleValue += prod.totalValue;
              } else {
                matched.soldQty += prod.quantity;
                matched.soldValue += prod.totalValue;
                // Resolve merged CNPJs to primary
                const rawCnpj = inv.recipientCnpj || '';
                const primaryCnpj = CNPJ_MERGE_MAP[rawCnpj] || rawCnpj;
                const custKey = primaryCnpj || (inv.recipientName || 'Desconhecido').trim();
                const custDisplayName = primaryCnpj
                  ? (primaryCnpj === rawCnpj ? (inv.recipientName || 'Desconhecido').trim() : undefined)
                  : (inv.recipientName || 'Desconhecido').trim();

                const existing = customerSalesMap.get(custKey);
                if (existing) {
                  existing.totalQty += prod.quantity;
                  existing.totalValue += prod.totalValue;
                } else {
                  const name = custDisplayName || (inv.recipientName || 'Desconhecido').trim();
                  customerSalesMap.set(custKey, { customerName: name, totalQty: prod.quantity, totalValue: prod.totalValue });
                }

                // Yearly breakdown
                const year = inv.issueDate ? inv.issueDate.getFullYear() : 0;
                if (year >= 2022) {
                  yearsSet.add(year);
                  let cyEntry = customerYearMap.get(custKey);
                  if (!cyEntry) {
                    const nickname = primaryCnpj ? nicknameMap.get(primaryCnpj) : null;
                    const fallbackName = customerSalesMap.get(custKey)?.customerName || (inv.recipientName || 'Desconhecido').trim();
                    cyEntry = { customerName: fallbackName, shortName: nickname || abbreviateCompanyName(fallbackName), totalQty: 0, totalValue: 0, lastSaleDate: null, lastUnitPrice: null, byYear: {} };
                    customerYearMap.set(custKey, cyEntry);
                  }
                  cyEntry.totalQty += prod.quantity;
                  cyEntry.totalValue += prod.totalValue;
                  // Track last unit price
                  const saleDate = inv.issueDate?.toISOString() || null;
                  if (saleDate && (!cyEntry.lastSaleDate || saleDate > cyEntry.lastSaleDate)) {
                    cyEntry.lastSaleDate = saleDate;
                    cyEntry.lastUnitPrice = prod.quantity > 0 ? prod.totalValue / prod.quantity : null;
                  }
                  const yk = String(year);
                  if (!cyEntry.byYear[yk]) cyEntry.byYear[yk] = { qty: 0, value: 0 };
                  cyEntry.byYear[yk].qty += prod.quantity;
                  cyEntry.byYear[yk].value += prod.totalValue;
                }
              }

              const mk = getMonthKey(inv.issueDate);
              if (mk && monthlyMap.has(mk)) {
                const ms = monthlyMap.get(mk)!;
                if (!isResale) {
                  ms.soldQty += prod.quantity;
                  ms.soldValue += prod.totalValue;
                }
              }
            }
          }
        }),
      );
    }

    // ═══════════════════════════════════════════════════════════
    // PASS 2: Scan received invoices for domestic purchases of target products
    // ═══════════════════════════════════════════════════════════
    let invoicesScanned = 0;
    const receivedInvoices = await prisma.$queryRawUnsafe<Array<{
      id: string;
      issueDate: Date | null;
      xmlContent: string;
    }>>(
      `SELECT id, "issueDate", "xmlContent"
       FROM "Invoice"
       WHERE "companyId" = $1
         AND type = 'NFE'
         AND direction = 'received'
       ORDER BY "issueDate" DESC
       LIMIT $2`,
      company.id,
      MAX_INVOICES,
    );

    for (let i = 0; i < receivedInvoices.length; i += XML_BATCH_SIZE) {
      const batch = receivedInvoices.slice(i, i + XML_BATCH_SIZE);
      await Promise.allSettled(
        batch.map(async (inv) => {
          invoicesScanned++;
          const products = await extractProductsFromXml(inv.xmlContent);
          for (const prod of products) {
            // Only match received products whose code is one of the target codes (resolve supplier codes)
            const resolved = resolveCode(prod.code);
            const matched = importProductMap.get(resolved);
            if (!matched) continue;

            matched.purchasedQty += prod.quantity;
            matched.purchasedValue += prod.totalValue;
            const mk = getMonthKey(inv.issueDate);
            if (mk && monthlyMap.has(mk)) {
              const ms = monthlyMap.get(mk)!;
              ms.purchasedQty += prod.quantity;
              ms.purchasedValue += prod.totalValue;
            }
          }
        }),
      );
    }

    // Deduct resale volume from purchases
    for (const prod of Array.from(importProductMap.values())) {
      prod.purchasedQty -= prod.resaleQty;
      prod.purchasedValue -= prod.resaleValue;
      if (prod.purchasedQty < 0) prod.purchasedQty = 0;
      if (prod.purchasedValue < 0) prod.purchasedValue = 0;
    }

    // Build response
    const products = Array.from(importProductMap.values())
      .filter(p => p.purchasedQty > 0 || p.soldQty > 0)
      .map(p => ({
        key: p.key,
        code: p.code,
        description: p.description,
        shortName: p.shortName,
        unit: p.unit,
        anvisa: p.anvisa,
        purchasedQty: Math.round(p.purchasedQty * 100) / 100,
        purchasedValue: Math.round(p.purchasedValue * 100) / 100,
        soldQty: Math.round(p.soldQty * 100) / 100,
        soldValue: Math.round(p.soldValue * 100) / 100,
        resaleQty: Math.round(p.resaleQty * 100) / 100,
        resaleValue: Math.round(p.resaleValue * 100) / 100,
        netQty: REAL_STOCK[p.code] ?? Math.round((p.purchasedQty - p.soldQty) * 100) / 100,
        avgPurchasePrice: p.purchasedQty > 0 ? Math.round((p.purchasedValue / p.purchasedQty) * 100) / 100 : null,
        avgSalePrice: p.soldQty > 0 ? Math.round((p.soldValue / p.soldQty) * 100) / 100 : null,
      }))
      .sort((a, b) => b.purchasedValue - a.purchasedValue);

    const totalPurchasedQty = products.reduce((s, p) => s + p.purchasedQty, 0);
    const totalPurchasedValue = products.reduce((s, p) => s + p.purchasedValue, 0);
    const totalSoldQty = products.reduce((s, p) => s + p.soldQty, 0);
    const totalSoldValue = products.reduce((s, p) => s + p.soldValue, 0);
    const totalResaleQty = products.reduce((s, p) => s + p.resaleQty, 0);
    const totalResaleValue = products.reduce((s, p) => s + p.resaleValue, 0);

    const years = Array.from(yearsSet).sort((a, b) => a - b);
    const customerYearlySales = {
      years,
      customers: Array.from(customerYearMap.values())
        .sort((a, b) => b.totalValue - a.totalValue)
        .slice(0, 9)
        .map(c => {
          const byYear: Record<string, { qty: number; value: number }> = {};
          for (const y of years) {
            const yk = String(y);
            const entry = c.byYear[yk];
            byYear[yk] = entry
              ? { qty: Math.round(entry.qty * 100) / 100, value: Math.round(entry.value * 100) / 100 }
              : { qty: 0, value: 0 };
          }
          return {
            customerName: c.customerName,
            shortName: c.shortName,
            totalQty: Math.round(c.totalQty * 100) / 100,
            totalValue: Math.round(c.totalValue * 100) / 100,
            lastUnitPrice: c.lastUnitPrice != null ? Math.round(c.lastUnitPrice * 100) / 100 : null,
            byYear,
          };
        }),
    };

    const totalCustomerValue = Array.from(customerSalesMap.values()).reduce((s, c) => s + c.totalValue, 0);
    const customerSales = Array.from(customerSalesMap.values())
      .sort((a, b) => b.totalValue - a.totalValue)
      .map(c => ({
        customerName: c.customerName,
        totalQty: Math.round(c.totalQty * 100) / 100,
        totalValue: Math.round(c.totalValue * 100) / 100,
        percentage: totalCustomerValue > 0 ? Math.round((c.totalValue / totalCustomerValue) * 10000) / 100 : 0,
      }));

    const monthlySeries = Array.from(monthlyMap.values());

    return NextResponse.json({
      summary: {
        totalProducts: products.length,
        totalPurchasedQty: Math.round(totalPurchasedQty * 100) / 100,
        totalPurchasedValue: Math.round(totalPurchasedValue * 100) / 100,
        totalSoldQty: Math.round(totalSoldQty * 100) / 100,
        totalSoldValue: Math.round(totalSoldValue * 100) / 100,
        totalResaleQty: Math.round(totalResaleQty * 100) / 100,
        totalResaleValue: Math.round(totalResaleValue * 100) / 100,
      },
      products,
      customerYearlySales,
      customerSales,
      monthlySeries,
      meta: { invoicesScanned, issuedInvoicesScanned },
    });
  } catch (e) {
    console.error('reports/valvulas-importadas error', e);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
