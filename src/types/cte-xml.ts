/**
 * Typed interfaces for CT-e XML documents parsed by fast-xml-parser.
 *
 * All properties are optional since XML elements may be absent.
 * Leaf values are string | undefined (fast-xml-parser returns strings for text content).
 *
 * Derived from actual usage in:
 * - src/lib/parse-invoice-xml.ts
 * - src/app/api/invoices/[id]/pdf/route.ts
 */

import type { XmlNode } from './xml-common';

// ── Address ──

export interface CTeEndereco {
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

// ── Parties ──

export interface CTeEmit {
  CNPJ?: string;
  CPF?: string;
  xNome?: string;
  xFant?: string;
  IE?: string;
  enderEmit?: CTeEndereco;
  fone?: string;
}

export interface CTeRem {
  CNPJ?: string;
  CPF?: string;
  xNome?: string;
  xFant?: string;
  IE?: string;
  enderReme?: CTeEndereco;
  fone?: string;
}

export interface CTeDest {
  CNPJ?: string;
  CPF?: string;
  xNome?: string;
  xFant?: string;
  IE?: string;
  enderDest?: CTeEndereco;
  fone?: string;
}

export interface CTeExped {
  CNPJ?: string;
  CPF?: string;
  xNome?: string;
  xFant?: string;
  IE?: string;
  enderExped?: CTeEndereco;
  fone?: string;
}

export interface CTeReceb {
  CNPJ?: string;
  CPF?: string;
  xNome?: string;
  xFant?: string;
  IE?: string;
  enderReceb?: CTeEndereco;
  fone?: string;
}

// ── Tomador ──

export interface CTeToma {
  CNPJ?: string;
  CPF?: string;
  xNome?: string;
  xFant?: string;
  IE?: string;
  enderToma?: CTeEndereco;
  fone?: string;
}

export interface CTeToma3 {
  toma?: string;
}

export interface CTeToma4 {
  tpTom?: string;
  toma?: CTeToma;
  CNPJ?: string;
  CPF?: string;
  xNome?: string;
  xFant?: string;
  IE?: string;
  enderToma?: CTeEndereco;
}

// ── Identification ──

export interface CTeIde {
  cUF?: string;
  cCT?: string;
  CFOP?: string;
  natOp?: string;
  mod?: string;
  serie?: string;
  nCT?: string;
  dhEmi?: string;
  tpImp?: string;
  tpEmis?: string;
  tpCTe?: string;
  tpServ?: string;
  cMunEnv?: string;
  xMunEnv?: string;
  UFEnv?: string;
  modal?: string;
  tpTom?: string;
  cMunIni?: string;
  xMunIni?: string;
  UFIni?: string;
  cMunFim?: string;
  xMunFim?: string;
  UFFim?: string;
  toma3?: CTeToma3 | string;
  toma03?: CTeToma3 | string;
  toma4?: CTeToma4;
  indGlobalizado?: string;
}

// ── Value / Payment ──

export interface CTeComp {
  xNome?: string;
  vComp?: string;
}

export interface CTeVPrest {
  vTPrest?: string;
  vRec?: string;
  Comp?: CTeComp | CTeComp[];
}

// ── Cargo ──

export interface CTeInfQ {
  cUnid?: string;
  tpMed?: string;
  qCarga?: string;
}

export interface CTeInfCarga {
  vCarga?: string;
  proPred?: string;
  xOutCat?: string;
  infQ?: CTeInfQ | CTeInfQ[];
}

// ── Documents ──

export interface CTeInfNFe {
  chave?: string;
  [key: string]: unknown;
}

export interface CTeInfDoc {
  infNFe?: CTeInfNFe | CTeInfNFe[];
  infNF?: XmlNode | XmlNode[];
  infOutros?: XmlNode | XmlNode[];
}

// ── Modal ──

export interface CTeInfModal {
  rodo?: {
    RNTRC?: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

// ── Complement ──

export interface CTeObsCont {
  xCampo?: string;
  xTexto?: string;
  _?: string;
  $?: { xCampo?: string };
}

export interface CTeCompl {
  xObs?: string;
  ObsCont?: CTeObsCont | CTeObsCont[];
  ObsFisco?: XmlNode | XmlNode[];
}

// ── Tax ──

export interface CTeICMS extends XmlNode {
  CST?: string;
  vBC?: string;
  pICMS?: string;
  vICMS?: string;
  pRedBC?: string;
  vICMSST?: string;
}

export interface CTeImp {
  ICMS?: Record<string, CTeICMS>;
  vTotTrib?: string;
  [key: string]: unknown;
}

// ── Normal CT-e ──

export interface CTeInfCTeNorm {
  infCarga?: CTeInfCarga;
  infDoc?: CTeInfDoc;
  infModal?: CTeInfModal;
  toma4?: CTeToma4;
}

// ── Main structure ──

export interface CTeInfCte {
  ide?: CTeIde;
  compl?: CTeCompl;
  emit?: CTeEmit;
  rem?: CTeRem;
  dest?: CTeDest;
  exped?: CTeExped;
  receb?: CTeReceb;
  toma?: CTeToma;
  toma4?: CTeToma4;
  vPrest?: CTeVPrest;
  imp?: CTeImp;
  infCTeNorm?: CTeInfCTeNorm;
  Id?: string;
  $?: { Id?: string };
  versao?: string;
}

export interface CTeDoc {
  infCte?: CTeInfCte;
}

export interface CTeProtCTe {
  infProt?: {
    chCTe?: string;
    nProt?: string;
    dhRecbto?: string;
    cStat?: string;
    xMotivo?: string;
  };
}

/** Top-level CT-e process wrapper (cteProc) */
export interface CTeProc {
  CTe?: CTeDoc;
  protCTe?: CTeProtCTe;
}

/**
 * Full parsed CT-e XML result from fast-xml-parser.
 * The top-level object may contain cteProc or directly CTe.
 */
export interface CTeXml {
  cteProc?: CTeProc;
  CTe?: CTeDoc;
}
