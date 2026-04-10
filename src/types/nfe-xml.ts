/**
 * Typed interfaces for NF-e XML documents parsed by fast-xml-parser.
 *
 * All properties are optional since XML elements may be absent.
 * Leaf values are string | undefined (fast-xml-parser returns strings for text content).
 *
 * Derived from actual usage in:
 * - src/lib/parse-invoice-xml.ts
 * - src/app/api/invoices/[id]/pdf/route.ts
 * - src/app/api/invoices/[id]/details/route.ts
 * - src/lib/product-aggregation.ts
 */

import type { XmlNode } from './xml-common';

// ── Address ──

export interface NFeEndereco {
  xLgr?: string;
  nro?: string;
  xCpl?: string;
  xBairro?: string;
  cMun?: string;
  xMun?: string;
  UF?: string;
  CEP?: string;
  cPais?: string;
  xPais?: string;
  fone?: string;
}

// ── Emitter / Recipient ──

export interface NFeEmit {
  CNPJ?: string;
  CPF?: string;
  xNome?: string;
  xFant?: string;
  IE?: string;
  IEST?: string;
  IM?: string;
  CNAE?: string;
  CRT?: string;
  enderEmit?: NFeEndereco;
  email?: string;
}

export interface NFeDest {
  CNPJ?: string;
  CPF?: string;
  xNome?: string;
  xFant?: string;
  IE?: string;
  IEST?: string;
  IM?: string;
  CNAE?: string;
  CRT?: string;
  enderDest?: NFeEndereco;
  email?: string;
  indIEDest?: string;
}

// ── Identification ──

export interface NFeIde {
  cUF?: string;
  cNF?: string;
  natOp?: string;
  mod?: string;
  serie?: string;
  nNF?: string;
  dhEmi?: string;
  dEmi?: string;
  dhSaiEnt?: string;
  tpNF?: string;
  idDest?: string;
  cMunFG?: string;
  tpImp?: string;
  tpEmis?: string;
  cDV?: string;
  tpAmb?: string;
  finNFe?: string;
  indFinal?: string;
  indPres?: string;
  procEmi?: string;
  verProc?: string;
}

// ── Product / Item ──

export interface NFeRastro {
  nLote?: string;
  qLote?: string;
  dFab?: string;
  dVal?: string;
}

export interface NFeMed {
  cProdANVISA?: string;
  nLote?: string;
  nLot?: string;
  dVal?: string;
  xMotivoIsencao?: string;
  vPMC?: string;
}

export interface NFeProd {
  cProd?: string;
  cEAN?: string;
  xProd?: string;
  NCM?: string;
  CEST?: string;
  CFOP?: string;
  uCom?: string;
  qCom?: string;
  vUnCom?: string;
  vProd?: string;
  cEANTrib?: string;
  uTrib?: string;
  qTrib?: string;
  vUnTrib?: string;
  vFrete?: string;
  vSeg?: string;
  vDesc?: string;
  vOutro?: string;
  indTot?: string;
  rastro?: NFeRastro | NFeRastro[];
  med?: NFeMed | NFeMed[];
  cProdANVISA?: string;
}

// ── Tax (Imposto) ──

/** Generic tax group node — ICMS, IPI, PIS, COFINS each have multiple CST sub-nodes */
export interface NFeTaxGroup extends XmlNode {
  orig?: string;
  CST?: string;
  CSOSN?: string;
  vBC?: string;
  pICMS?: string;
  vICMS?: string;
  vBCST?: string;
  pICMSST?: string;
  vICMSST?: string;
  pIPI?: string;
  vIPI?: string;
  pPIS?: string;
  vPIS?: string;
  pCOFINS?: string;
  vCOFINS?: string;
}

export interface NFeImposto {
  ICMS?: Record<string, NFeTaxGroup>;
  IPI?: {
    IPITrib?: NFeTaxGroup;
    IPINT?: NFeTaxGroup;
    [key: string]: unknown;
  };
  PIS?: Record<string, NFeTaxGroup>;
  COFINS?: Record<string, NFeTaxGroup>;
  vTotTrib?: string;
  [key: string]: unknown;
}

// ── Det (item line) ──

export interface NFeDet {
  nItem?: string;
  prod?: NFeProd;
  imposto?: NFeImposto;
  infAdProd?: string;
  med?: NFeMed | NFeMed[];
  /** Attribute node from fast-xml-parser */
  $?: { nItem?: string };
}

// ── Totals ──

export interface NFeICMSTot {
  vBC?: string;
  vICMS?: string;
  vICMSDeson?: string;
  vFCPUFDest?: string;
  vICMSUFDest?: string;
  vICMSUFRemet?: string;
  vFCP?: string;
  vBCST?: string;
  vST?: string;
  vFCPST?: string;
  vFCPSTRet?: string;
  vProd?: string;
  vFrete?: string;
  vSeg?: string;
  vDesc?: string;
  vII?: string;
  vIPI?: string;
  vIPIDevol?: string;
  vPIS?: string;
  vCOFINS?: string;
  vOutro?: string;
  vNF?: string;
  vTotTrib?: string;
  vICMSSub?: string;
}

export interface NFeTotal {
  ICMSTot?: NFeICMSTot;
}

// ── Transport ──

export interface NFeTransporta {
  CNPJ?: string;
  CPF?: string;
  xNome?: string;
  IE?: string;
  xEnder?: string;
  xMun?: string;
  UF?: string;
}

export interface NFeVol {
  qVol?: string;
  esp?: string;
  marca?: string;
  nVol?: string;
  pesoL?: string;
  pesoB?: string;
}

export interface NFeVeiculo {
  placa?: string;
  UF?: string;
  RNTC?: string;
}

export interface NFeTransp {
  modFrete?: string;
  transporta?: NFeTransporta;
  vol?: NFeVol | NFeVol[];
  veicTransp?: NFeVeiculo;
}

// ── Billing / Payment ──

export interface NFeDup {
  nDup?: string;
  dVenc?: string;
  vDup?: string;
}

export interface NFeFat {
  nFat?: string;
  vOrig?: string;
  vDesc?: string;
  vLiq?: string;
}

export interface NFeCobr {
  fat?: NFeFat;
  dup?: NFeDup | NFeDup[];
}

export interface NFePag {
  detPag?: XmlNode | XmlNode[];
  vTroco?: string;
}

// ── Additional Info ──

export interface NFeInfAdic {
  infAdFisco?: string;
  infCpl?: string;
  obsCont?: XmlNode | XmlNode[];
  obsFisco?: XmlNode | XmlNode[];
}

// ── Main structure ──

export interface NFeInfNFe {
  ide?: NFeIde;
  emit?: NFeEmit;
  dest?: NFeDest;
  det?: NFeDet | NFeDet[];
  total?: NFeTotal;
  transp?: NFeTransp;
  cobr?: NFeCobr;
  pag?: NFePag;
  infAdic?: NFeInfAdic;
  infAdFisco?: string;
  infCpl?: string;
  Id?: string;
  $?: { Id?: string };
}

export interface NFeDoc {
  infNFe?: NFeInfNFe;
}

export interface NFeProtNFe {
  infProt?: {
    chNFe?: string;
    nProt?: string;
    dhRecbto?: string;
    cStat?: string;
    xMotivo?: string;
  };
}

/** Top-level NF-e process wrapper (nfeProc) */
export interface NFeProc {
  NFe?: NFeDoc;
  protNFe?: NFeProtNFe;
}

/**
 * Full parsed NF-e XML result from fast-xml-parser.
 * The top-level object may contain nfeProc or directly NFe.
 */
export interface NFeXml {
  nfeProc?: NFeProc;
  NFe?: NFeDoc;
}
