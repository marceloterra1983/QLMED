import { parseXmlSafe } from '@/lib/safe-xml-parser';

function toNum(v: unknown): number | null {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

function str(v: unknown): string | null {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  return s.length > 0 ? s : null;
}

function ensureArray<T>(v: T | T[] | null | undefined): T[] {
  if (v === null || v === undefined) return [];
  return Array.isArray(v) ? v : [v];
}

// ── Tax totals from ICMSTot ──

export interface TaxTotalsFromXml {
  vbc: number | null;
  vicms: number | null;
  vpis: number | null;
  vcofins: number | null;
  vipi: number | null;
  vfrete: number | null;
  vseg: number | null;
  vdesc: number | null;
  voutro: number | null;
  vtottrib: number | null;
  vfcp: number | null;
  vicmsSt: number | null;
}

export async function extractTaxTotals(xmlContent: string): Promise<TaxTotalsFromXml | null> {
  const parsed = await parseXmlSafe(xmlContent);
  const nfeProc = parsed?.nfeProc || parsed;
  const nfe = nfeProc?.NFe || parsed?.NFe;
  const infNFe = nfe?.infNFe;
  if (!infNFe) return null;

  const tot = infNFe?.total?.ICMSTot;
  if (!tot) return null;

  return {
    vbc: toNum(tot.vBC),
    vicms: toNum(tot.vICMS),
    vpis: toNum(tot.vPIS),
    vcofins: toNum(tot.vCOFINS),
    vipi: toNum(tot.vIPI),
    vfrete: toNum(tot.vFrete),
    vseg: toNum(tot.vSeg),
    vdesc: toNum(tot.vDesc),
    voutro: toNum(tot.vOutro),
    vtottrib: toNum(tot.vTotTrib),
    vfcp: toNum(tot.vFCPUFDest ?? tot.vFCP),
    vicmsSt: toNum(tot.vST),
  };
}

// ── Item-level taxes from det/imposto ──

export interface ItemTaxFromXml {
  itemNumber: number | null;
  productCode: string | null;
  productDescription: string | null;
  ncm: string | null;
  cfop: string | null;
  cest: string | null;
  origem: string | null;
  quantity: number | null;
  unitPrice: number | null;
  totalValue: number | null;
  cstIcms: string | null;
  baseIcms: number | null;
  aliqIcms: number | null;
  valorIcms: number | null;
  cstPis: string | null;
  aliqPis: number | null;
  valorPis: number | null;
  cstCofins: string | null;
  aliqCofins: number | null;
  valorCofins: number | null;
  aliqIpi: number | null;
  valorIpi: number | null;
  valorFcp: number | null;
}

export async function extractItemTaxes(xmlContent: string): Promise<ItemTaxFromXml[]> {
  const parsed = await parseXmlSafe(xmlContent);
  const nfeProc = parsed?.nfeProc || parsed;
  const nfe = nfeProc?.NFe || parsed?.NFe;
  const infNFe = nfe?.infNFe;
  if (!infNFe) return [];

  const dets = ensureArray<any>(infNFe.det);
  return dets.map((det, idx) => {
    const prod = det?.prod || {};
    const imposto = det?.imposto || {};

    // ICMS — can be nested under ICMS00, ICMS10, ICMS20, etc.
    const icmsGroup = imposto?.ICMS || {};
    const icms = icmsGroup.ICMS00 || icmsGroup.ICMS10 || icmsGroup.ICMS20
      || icmsGroup.ICMS30 || icmsGroup.ICMS40 || icmsGroup.ICMS51
      || icmsGroup.ICMS60 || icmsGroup.ICMS70 || icmsGroup.ICMS90
      || icmsGroup.ICMSSN101 || icmsGroup.ICMSSN102 || icmsGroup.ICMSSN201
      || icmsGroup.ICMSSN202 || icmsGroup.ICMSSN500 || icmsGroup.ICMSSN900
      || icmsGroup;

    // PIS — PISAliq, PISQtde, PISNT, PISOutr
    const pisGroup = imposto?.PIS || {};
    const pis = pisGroup.PISAliq || pisGroup.PISQtde || pisGroup.PISNT
      || pisGroup.PISOutr || pisGroup;

    // COFINS — same pattern
    const cofinsGroup = imposto?.COFINS || {};
    const cofins = cofinsGroup.COFINSAliq || cofinsGroup.COFINSQtde
      || cofinsGroup.COFINSNT || cofinsGroup.COFINSOutr || cofinsGroup;

    // IPI
    const ipiGroup = imposto?.IPI || {};
    const ipiTrib = ipiGroup.IPITrib || ipiGroup;

    return {
      itemNumber: det?.nItem ? Number(det.nItem) : idx + 1,
      productCode: str(prod.cProd),
      productDescription: str(prod.xProd),
      ncm: str(prod.NCM),
      cfop: str(prod.CFOP),
      cest: str(prod.CEST),
      origem: str(icms?.orig),
      quantity: toNum(prod.qCom),
      unitPrice: toNum(prod.vUnCom),
      totalValue: toNum(prod.vProd),
      cstIcms: str(icms?.CST ?? icms?.CSOSN),
      baseIcms: toNum(icms?.vBC),
      aliqIcms: toNum(icms?.pICMS),
      valorIcms: toNum(icms?.vICMS),
      cstPis: str(pis?.CST),
      aliqPis: toNum(pis?.pPIS),
      valorPis: toNum(pis?.vPIS),
      cstCofins: str(cofins?.CST),
      aliqCofins: toNum(cofins?.pCOFINS),
      valorCofins: toNum(cofins?.vCOFINS),
      aliqIpi: toNum(ipiTrib?.pIPI),
      valorIpi: toNum(ipiTrib?.vIPI),
      valorFcp: toNum(imposto?.ICMSUFDest?.vFCPUFDest ?? icms?.vFCP),
    };
  });
}

// ── Combined extraction for convenience ──

export async function extractAllTaxData(xmlContent: string) {
  const [totals, items] = await Promise.all([
    extractTaxTotals(xmlContent),
    extractItemTaxes(xmlContent),
  ]);
  return { totals, items };
}
