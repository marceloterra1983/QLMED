import { Prisma } from '@prisma/client';

export type PdfInvoiceView = {
  type: string;
  number: string;
  series: string | null;
  issueDate: Date;
  senderCnpj: string;
  senderName: string;
  recipientCnpj: string;
  recipientName: string;
  totalValue: number | Prisma.Decimal;
  status: string;
  accessKey: string;
  direction: string;
  company: { razaoSocial: string; cnpj: string };
};

export interface DanfeProduct {
  cProd: string;
  xProd: string;
  NCM: string;
  origCST: string;
  CFOP: string;
  uCom: string;
  qCom: string;
  vUnCom: string;
  vProd: string;
  vDesc: string;
  vBCICMS: string;
  vICMS: string;
  vIPI: string;
  pICMS: string;
  pIPI: string;
  infAdProd: string;
}

export interface DanfeParcela {
  nDup: string;
  dVenc: string;
  vDup: string;
}

export interface DanfeData {
  chNFe: string;
  nNF: string;
  serie: string;
  dhEmi: string;
  dhSaiEnt: string;
  natOp: string;
  tpNF: string;
  nProt: string;
  dhRecbto: string;

  emitNome: string;
  emitCnpj: string;
  emitIE: string;
  emitIEST: string;
  emitEnd: string;
  emitBairro: string;
  emitMun: string;
  emitUF: string;
  emitCEP: string;
  emitFone: string;

  destNome: string;
  destCnpj: string;
  destIE: string;
  destEnd: string;
  destBairro: string;
  destMun: string;
  destUF: string;
  destCEP: string;
  destFone: string;

  vBC: string;
  vICMS: string;
  vBCST: string;
  vST: string;
  vProd: string;
  vFrete: string;
  vSeg: string;
  vDesc: string;
  vOutro: string;
  vIPI: string;
  vNF: string;
  vTotTrib: string;
  pTotTrib: string;

  products: DanfeProduct[];

  modFrete: string;
  transpNome: string;
  transpCnpj: string;
  transpIE: string;
  transpEnd: string;
  transpMun: string;
  transpUF: string;
  veicPlaca: string;
  veicUF: string;
  veicAntt: string;
  volQtd: string;
  volEsp: string;
  volMarca: string;
  volNum: string;
  volPesoB: string;
  volPesoL: string;

  fatNum: string;
  fatVOrig: string;
  fatVDesc: string;
  fatVLiq: string;
  parcelas: DanfeParcela[];

  infCpl: string;
  infAdFisco: string;
}

export interface CtePartyData {
  nome: string;
  doc: string;
  ie: string;
  fone: string;
  endereco: string;
  bairro: string;
  municipio: string;
  uf: string;
  cep: string;
  pais: string;
}

export interface CteDocRef {
  modelo: string;
  serie: string;
  numero: string;
  chave: string;
}

export interface CteComp {
  nome: string;
  valor: string;
}

export interface CteCargaMedida {
  tipo: string;
  quantidade: string;
  unidade: string;
}

export interface CteObsCont {
  campo: string;
  texto: string;
}

export interface CteData {
  chCTe: string;
  nCT: string;
  serie: string;
  modelo: string;
  fl: string;
  dhEmi: string;
  nProt: string;
  dhRecbto: string;
  modal: string;
  tpServico: string;
  tpCte: string;
  tomPapel: string;
  indGlobalizado: string;
  cfop: string;
  natOp: string;
  inicioPrest: string;
  terminoPrest: string;
  emit: CtePartyData;
  rem: CtePartyData;
  dest: CtePartyData;
  exped: CtePartyData;
  receb: CtePartyData;
  tom: CtePartyData;
  prodPred: string;
  vCarga: string;
  vTPrest: string;
  vRec: string;
  componentes: CteComp[];
  medidas: CteCargaMedida[];
  cst: string;
  vBC: string;
  pICMS: string;
  vICMS: string;
  redBc: string;
  icmsSt: string;
  docs: CteDocRef[];
  obs: string;
  obsCont: CteObsCont[];
  rntrc: string;
  versao: string;
}

export type Party = {
  nome: string;
  cnpj: string;
};

export interface NfsePartyData {
  nome: string;
  fantasia: string;
  doc: string;
  im: string;
  email: string;
  fone: string;
  endereco: string;
  bairro: string;
  municipio: string;
  uf: string;
  cep: string;
}

export interface NfseData {
  nNFSe: string;
  serie: string;
  dhEmi: string;
  dCompet: string;
  accessKey: string;
  xLocEmi: string;
  xLocPrestacao: string;
  xTribNac: string;
  xTribMun: string;
  xNBS: string;
  cTribNac: string;
  cTribMun: string;
  xDescServ: string;
  emit: NfsePartyData;
  toma: NfsePartyData;
  vServ: string;
  vLiq: string;
  vCalcDR: string;
  vDR: string;
  vBC: string;
  pAliq: string;
  vISSQN: string;
  vTotalRet: string;
  cStat: string;
  nDFSe: string;
  opSimpNac: string;
  regEspTrib: string;
  tpRetISSQN: string;
}
