import { parseXmlSafe } from '@/lib/safe-xml-parser';
import { normalizeForSearch, cleanString, ensureArray, toNumber } from '@/lib/utils';
import type { NFeDet, NFeMed, NFeProd, NFeRastro } from '@/types/nfe-xml';
import { extractAnvisa } from './anvisa';
import type { ProductBatch, ProductFromXml } from './units';

function extractBatches(det: NFeDet, prod: NFeProd): ProductBatch[] {
  const batches: ProductBatch[] = [];
  const seenLots = new Set<string>();

  // 1. <rastro> blocks (preferred, NF-e 4.0+)
  for (const r of ensureArray<NFeRastro>(prod?.rastro)) {
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
    for (const m of ensureArray<NFeMed>(det?.med).concat(ensureArray<NFeMed>(prod?.med))) {
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

export async function extractProductsFromXml(
  xmlContent: string,
  options: { strict?: boolean } = {},
): Promise<ProductFromXml[]> {
  try {
    const parsed = await parseXmlSafe(xmlContent);
    const nfeProc = parsed?.nfeProc || parsed?.NFe || parsed;
    const nfe = nfeProc?.NFe || parsed?.NFe || nfeProc;
    const infNFe = nfe?.infNFe || nfe;
    const dets = ensureArray<NFeDet>(infNFe?.det);

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
        cfop: cleanString(prod?.CFOP),
        batches: extractBatches(det, prod),
      };
    });
  } catch (error) {
    if (options.strict) throw error;
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
