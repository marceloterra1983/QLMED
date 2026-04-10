import { NextResponse } from 'next/server';
import { requireEditor, unauthorizedResponse, forbiddenResponse } from '@/lib/auth';
import { getOrCreateSingleCompany } from '@/lib/single-company';
import { upsertProductRegistry, getProductRegistryByKeys } from '@/lib/product-registry-store';
import prisma from '@/lib/prisma';
import { parseXmlSafe } from '@/lib/safe-xml-parser';
import { apiError, apiValidationError } from '@/lib/api-error';
import { createLogger } from '@/lib/logger';
import { anvisaBulkImportSchema } from '@/lib/schemas/product';

const log = createLogger('products/anvisa/bulk-import');

const MAX_INVOICES = 3000;
const XML_BATCH_SIZE = 50;
const MAX_ITEMS = 10000;

function normalizeToken(s: string | null | undefined): string {
  return (s ?? '').replace(/[\s\-_./]/g, '').toUpperCase();
}

const UNIT_ALIASES: Record<string, string> = {
  UNID: 'UN', UND: 'UN', UNIDADE: 'UN', UNIDADES: 'UN',
  PC: 'UN', 'PÇ': 'UN', PECA: 'UN', 'PEÇA': 'UN', PCS: 'UN',
  CAIXA: 'CX', KT: 'KIT', PR: 'PAR',
};
function normalizeUnit(raw: string | null | undefined): string {
  const upper = (raw || '').trim().toUpperCase().replace(/\./g, '');
  return UNIT_ALIASES[upper] || upper || '-';
}

function buildProductKey(code: string | null, unit: string | null, ean: string | null): string {
  const codeToken = normalizeToken(code);
  const unitToken = normalizeUnit(unit);
  if (codeToken && codeToken !== '-') return `CODE:${codeToken}::UNIT:${unitToken}`;
  const eanToken = normalizeToken(ean).replace(/\D/g, '');
  if (eanToken && eanToken !== '0') return `EAN:${eanToken}`;
  return `DESC:${normalizeToken(code)}`;
}

export async function POST(req: Request) {
  try {
    let userId: string;
    try {
      const auth = await requireEditor();
      userId = auth.userId;
    } catch (e: unknown) {
      if (e instanceof Error && e.message === 'FORBIDDEN') return forbiddenResponse();
      return unauthorizedResponse();
    }

    const company = await getOrCreateSingleCompany(userId);
    const body = await req.json().catch(() => null);

    const parsed = anvisaBulkImportSchema.safeParse(body);
    if (!parsed.success) return apiValidationError(parsed.error);

    const items = parsed.data.items;

    // Validate items
    const validItems = items.filter((item) => {
      const anvisa = String(item.anvisa ?? '').replace(/\D/g, '');
      return item.codigo && anvisa.length === 11;
    });

    if (validItems.length === 0) {
      return NextResponse.json({ error: 'Nenhum item válido. Certifique-se de enviar codigo e anvisa (11 dígitos).' }, { status: 400 });
    }

    // Build lookup: normalizedCode -> { anvisa, fabricante }
    const lookupByNorm = new Map<string, { anvisa: string; fabricante: string }>();
    const lookupByExact = new Map<string, { anvisa: string; fabricante: string }>();
    for (const item of validItems) {
      const anvisa = item.anvisa.replace(/\D/g, '');
      const fab = item.fabricante ?? '';
      lookupByExact.set(item.codigo.toUpperCase().trim(), { anvisa, fabricante: fab });
      lookupByNorm.set(normalizeToken(item.codigo), { anvisa, fabricante: fab });
    }

    // Fetch all received invoices to find matching products
    const invoiceMetadata = await prisma.invoice.findMany({
      where: { companyId: company.id, type: 'NFE', direction: 'received' },
      orderBy: [{ issueDate: 'desc' }, { createdAt: 'desc' }],
      take: MAX_INVOICES,
      select: { id: true, senderName: true },
    });

    // Collect product matches
    const matched = new Map<string, {
      productKey: string;
      code: string;
      description: string;
      ncm: string | null;
      unit: string;
      ean: string | null;
      anvisa: string;
      fabricante: string;
    }>();

    for (let i = 0; i < invoiceMetadata.length; i += XML_BATCH_SIZE) {
      const batch = invoiceMetadata.slice(i, i + XML_BATCH_SIZE);
      const batchIds = batch.map((inv) => inv.id);
      const batchWithXml = await prisma.invoice.findMany({
        where: { id: { in: batchIds } },
        select: { id: true, xmlContent: true },
      });

      for (const inv of batchWithXml) {
        if (!inv.xmlContent) continue;
        try {
          const parsed = await parseXmlSafe(inv.xmlContent);
          const dets = parsed?.nfeProc?.NFe?.infNFe?.det ?? parsed?.NFe?.infNFe?.det ?? [];
          const detArr = Array.isArray(dets) ? dets : [dets];

          for (const det of detArr) {
            const prod = det?.prod;
            if (!prod) continue;

            const code = String(prod.cProd ?? '').trim();
            const ean = String(prod.cEAN ?? '').trim();
            const description = String(prod.xProd ?? '').trim();
            const ncm = String(prod.NCM ?? '').trim() || null;
            const unit = String(prod.uCom ?? '').trim();

            const codeNorm = normalizeToken(code);
            const codeUpper = code.toUpperCase();

            const hit = lookupByExact.get(codeUpper) ?? lookupByNorm.get(codeNorm);
            if (!hit) continue;

            const productKey = buildProductKey(code, unit, ean === 'SEM GTIN' ? null : ean);
            if (matched.has(productKey)) continue;

            matched.set(productKey, {
              productKey,
              code,
              description,
              ncm,
              unit,
              ean: ean && ean !== 'SEM GTIN' ? ean : null,
              anvisa: hit.anvisa,
              fabricante: hit.fabricante,
            });
          }
        } catch {
          // skip malformed XML
        }
      }
    }

    if (matched.size === 0) {
      return NextResponse.json({
        ok: true,
        updated: 0,
        skipped: 0,
        message: 'Nenhum produto das NF-e correspondeu aos códigos informados.',
      });
    }

    // Check existing registry to skip already-set manual entries
    const keys = Array.from(matched.keys());
    const existingRows = await getProductRegistryByKeys(company.id, keys);
    const existingRegistry = new Map(existingRows.map((r) => [r.productKey, r]));

    let updated = 0;
    let skipped = 0;

    const matchedEntries = Array.from(matched.entries());
    for (const [productKey, product] of matchedEntries) {
      const existing = existingRegistry.get(productKey);
      // Skip if already has a manual or xml entry with same ANVISA
      if (existing?.anvisaSource === 'manual' && existing.anvisaCode === product.anvisa) {
        skipped++;
        continue;
      }
      // Skip if already set via xml and matches
      if (existing?.anvisaSource === 'xml' && existing.anvisaCode === product.anvisa) {
        skipped++;
        continue;
      }

      await upsertProductRegistry({
        companyId: company.id,
        productKey,
        code: product.code,
        description: product.description,
        ncm: product.ncm,
        unit: product.unit,
        ean: product.ean,
        anvisaCode: product.anvisa,
        anvisaSource: 'manual',
        anvisaConfidence: 1,
        anvisaMatchedProductName: product.description,
        anvisaHolder: product.fabricante || null,
        anvisaProcess: null,
        anvisaStatus: 'Importado de planilha',
        anvisaSyncedAt: new Date(),
      });
      updated++;
    }

    return NextResponse.json({
      ok: true,
      updated,
      skipped,
      totalMatched: matched.size,
      totalItems: validItems.length,
    });
  } catch (error) {
    return apiError(error, 'products/anvisa/bulk-import');
  }
}
