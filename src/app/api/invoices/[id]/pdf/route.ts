import { requireAuth, unauthorizedResponse } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { getOrCreateSingleCompany } from '@/lib/single-company';
import { parseXmlSafeNoMerge } from '@/lib/safe-xml-parser';
import puppeteer from 'puppeteer';

// ==================== Helpers ====================

function parseXml(xml: string): Promise<any> {
  return parseXmlSafeNoMerge(xml);
}

function esc(text: string | null | undefined): string {
  if (!text) return '';
  return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function gv(obj: any, ...keys: string[]): string {
  let cur = obj;
  for (const k of keys) {
    if (cur == null) return '';
    cur = cur[k];
  }
  if (cur == null) return '';
  if (typeof cur === 'object' && cur._ != null) return String(cur._);
  if (typeof cur === 'object') return '';
  return String(cur);
}

function ensureArray(val: any): any[] {
  if (val == null) return [];
  return Array.isArray(val) ? val : [val];
}

function fmtCnpj(v: string): string {
  const d = (v || '').replace(/\D/g, '');
  if (d.length === 14) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
  if (d.length === 11) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
  return v || '';
}

function fmtCep(v: string): string {
  const d = (v || '').replace(/\D/g, '');
  if (d.length === 8) return `${d.slice(0, 5)}-${d.slice(5)}`;
  return v || '';
}

function fmtFone(v: string): string {
  const d = (v || '').replace(/\D/g, '');
  if (d.length === 10) return `(${d.slice(0, 2)})${d.slice(2, 6)}-${d.slice(6)}`;
  if (d.length === 11) return `(${d.slice(0, 2)})${d.slice(2, 7)}-${d.slice(7)}`;
  return v || '';
}

function fmtNum(v: string | number | null | undefined, dec: number = 2): string {
  const n = typeof v === 'number' ? v : parseFloat(String(v || '0'));
  if (isNaN(n)) return '0,' + '0'.repeat(dec);
  return n.toLocaleString('pt-BR', { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

function fmtCurrency(v: string | number | null | undefined): string {
  return 'R$ ' + fmtNum(v, 2);
}

function fmtKey(k: string): string {
  return (k || '').replace(/\D/g, '').replace(/(.{4})/g, '$1 ').trim();
}

function fmtNfNum(n: string): string {
  const d = (n || '0').replace(/\D/g, '').padStart(9, '0');
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
}

function fmtDate(v: string): string {
  if (!v) return '';
  try { return new Date(v).toLocaleDateString('pt-BR'); } catch { return v; }
}

function fmtTime(v: string): string {
  if (!v) return '';
  try { return new Date(v).toLocaleTimeString('pt-BR'); } catch { return ''; }
}

function fmtDateTime(v: string): string {
  return `${fmtDate(v)} ${fmtTime(v)}`.trim();
}

function modFreteLabel(m: string): string {
  const map: Record<string, string> = {
    '0': 'FRETE POR CONTA DO EMITENTE',
    '1': 'FRETE POR CONTA DO DESTINATARIO',
    '2': 'FRETE POR CONTA DE TERCEIROS',
    '3': 'TRANSPORTE PRÓPRIO REMETENTE',
    '4': 'TRANSPORTE PRÓPRIO DESTINATÁRIO',
    '9': 'SEM FRETE',
  };
  return map[m] || '';
}

function modFreteCode(m: string): string {
  const map: Record<string, string> = {
    '0': '0 - EMIT',
    '1': '1 - DEST/REM',
    '2': '2 - TERCEIROS',
    '3': '3 - REMETENTE',
    '4': '4 - DESTINATÁRIO',
    '9': '9 - SEM FRETE',
  };
  return map[m] || m || '';
}

type PdfInvoiceView = {
  type: string;
  number: string;
  series: string | null;
  issueDate: Date;
  senderCnpj: string;
  senderName: string;
  recipientCnpj: string;
  recipientName: string;
  totalValue: number;
  status: string;
  accessKey: string;
  direction: string;
  company: { razaoSocial: string; cnpj: string };
};

function getPdfFilename(invoice: PdfInvoiceView): string {
  if (invoice.type === 'CTE') {
    return `QLMED/${invoice.accessKey}-cte.pdf`;
  }

  const typeLabel: Record<string, string> = { NFE: 'NFe', CTE: 'CTe', NFSE: 'NFSe' };
  const tl = typeLabel[invoice.type] || invoice.type;
  return `DANFE_${tl}_${invoice.number}_${invoice.accessKey.slice(0, 12)}.pdf`;
}

// ==================== Data Extraction ====================

interface DanfeProduct {
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

interface DanfeParcela {
  nDup: string;
  dVenc: string;
  vDup: string;
}

interface DanfeData {
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

interface CtePartyData {
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

interface CteDocRef {
  modelo: string;
  serie: string;
  numero: string;
  chave: string;
}

interface CteComp {
  nome: string;
  valor: string;
}

interface CteCargaMedida {
  tipo: string;
  quantidade: string;
  unidade: string;
}

interface CteObsCont {
  campo: string;
  texto: string;
}

interface CteData {
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

type Party = {
  nome: string;
  cnpj: string;
};

function hasParty(party: Party): boolean {
  return Boolean((party.nome || '').trim() || (party.cnpj || '').trim());
}

function getParty(node: any): Party {
  return {
    nome: gv(node, 'xNome') || gv(node, 'xFant'),
    cnpj: gv(node, 'CNPJ') || gv(node, 'CPF'),
  };
}

function getCteModalLabel(modalCode: string): string {
  const modalMap: Record<string, string> = {
    '01': 'Rodoviário',
    '02': 'Aéreo',
    '03': 'Aquaviário',
    '04': 'Ferroviário',
    '05': 'Dutoviário',
    '06': 'Multimodal',
  };
  return modalMap[modalCode] || modalCode || '-';
}

function getCteTpServLabel(tpServCode: string): string {
  const serviceMap: Record<string, string> = {
    '0': 'Normal',
    '1': 'Subcontratação',
    '2': 'Redespacho',
    '3': 'Redespacho Intermediário',
    '4': 'Serviço Vinculado a Multimodal',
  };
  return serviceMap[tpServCode] || tpServCode || '-';
}

function parseCteTomador(infCte: any): { party: Party; papel: string } {
  const rem = getParty(infCte?.rem || {});
  const exped = getParty(infCte?.exped || {});
  const receb = getParty(infCte?.receb || {});
  const dest = getParty(infCte?.dest || {});

  const toma4 = infCte?.ide?.toma4 || infCte?.toma4 || infCte?.infCteNorm?.toma4 || {};
  const explicitTomador = getParty(toma4?.toma || toma4 || infCte?.ide?.toma || infCte?.toma || {});
  const ide = infCte?.ide || {};
  const toma3Raw = ide?.toma3;
  const toma03Raw = ide?.toma03;
  const toma3Code = typeof toma3Raw === 'object' ? (toma3Raw?.toma ?? '') : toma3Raw;
  const toma03Code = typeof toma03Raw === 'object' ? (toma03Raw?.toma ?? '') : toma03Raw;
  const tpTomRaw = String(gv(toma4, 'tpTom') || toma03Code || toma3Code || gv(ide, 'tpTom') || '').trim();

  const codeMap: Record<string, { party: Party; papel: string }> = {
    '0': { party: rem, papel: 'Remetente' },
    '1': { party: exped, papel: 'Expedidor' },
    '2': { party: receb, papel: 'Recebedor' },
    '3': { party: dest, papel: 'Destinatário' },
  };

  if (tpTomRaw in codeMap && hasParty(codeMap[tpTomRaw].party)) {
    return codeMap[tpTomRaw];
  }

  if (tpTomRaw === '4' && hasParty(explicitTomador)) {
    return { party: explicitTomador, papel: 'Outros' };
  }

  if (hasParty(explicitTomador)) return { party: explicitTomador, papel: 'Tomador' };
  if (hasParty(dest)) return { party: dest, papel: 'Destinatário' };
  if (hasParty(rem)) return { party: rem, papel: 'Remetente' };
  if (hasParty(receb)) return { party: receb, papel: 'Recebedor' };
  if (hasParty(exped)) return { party: exped, papel: 'Expedidor' };

  return { party: { nome: '', cnpj: '' }, papel: 'Tomador' };
}

function getCteTypeLabel(tpCteCode: string): string {
  const map: Record<string, string> = {
    '0': 'Normal',
    '1': 'Complementar',
    '2': 'Anulação',
    '3': 'Substituto',
  };
  return map[tpCteCode] || tpCteCode || '-';
}

function getGlobalizadoLabel(raw: string): string {
  const normalized = String(raw || '').trim();
  if (normalized === '1' || normalized.toLowerCase() === 'sim') return 'Sim';
  if (normalized === '0' || normalized.toLowerCase() === 'nao' || normalized.toLowerCase() === 'não') return 'Não';
  return normalized || 'Não';
}

function normalizeCteParty(node: any, ender: any): CtePartyData {
  const doc = gv(node, 'CNPJ') || gv(node, 'CPF');
  const xLgr = gv(ender, 'xLgr');
  const nro = gv(ender, 'nro');
  const xCpl = gv(ender, 'xCpl');
  return {
    nome: gv(node, 'xNome') || gv(node, 'xFant'),
    doc,
    ie: gv(node, 'IE'),
    fone: gv(node, 'fone') || gv(ender, 'fone'),
    endereco: [xLgr, nro, xCpl].filter(Boolean).join(', '),
    bairro: gv(ender, 'xBairro'),
    municipio: gv(ender, 'xMun'),
    uf: gv(ender, 'UF'),
    cep: gv(ender, 'CEP'),
    pais: gv(ender, 'xPais') || gv(ender, 'cPais'),
  };
}

function parseNfeKey(chave: string): { modelo: string; serie: string; numero: string } {
  const digits = (chave || '').replace(/\D/g, '');
  if (digits.length !== 44) {
    return { modelo: '-', serie: '-', numero: '-' };
  }
  return {
    modelo: digits.slice(20, 22),
    serie: String(Number(digits.slice(22, 25))).padStart(3, '0'),
    numero: String(Number(digits.slice(25, 34))).padStart(9, '0'),
  };
}

function formatDocRefNumber(numero: string): string {
  const digits = (numero || '').replace(/\D/g, '');
  if (!digits) return '-';
  return String(Number(digits)).padStart(9, '0');
}

function emptyCtePartyData(): CtePartyData {
  return {
    nome: '',
    doc: '',
    ie: '',
    fone: '',
    endereco: '',
    bairro: '',
    municipio: '',
    uf: '',
    cep: '',
    pais: '',
  };
}

function fmtCteNumber(numero: string): string {
  const digits = (numero || '').replace(/\D/g, '').padStart(9, '0');
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
}

function fmtCteSerie(serie: string): string {
  const digits = (serie || '').replace(/\D/g, '');
  if (!digits) return '001';
  return String(Number(digits)).padStart(3, '0');
}

function fmtCteModelo(modelo: string): string {
  const digits = (modelo || '').replace(/\D/g, '');
  if (!digits) return '57';
  return digits.padStart(2, '0');
}

function cteUnidadeLabel(unidade: string): string {
  const map: Record<string, string> = {
    '00': 'M3',
    '01': 'KG',
    '02': 'TON',
    '03': 'UND',
    '04': 'LTS',
    '05': 'MMBTU',
  };
  return map[String(unidade || '').trim()] || unidade || '';
}

function formatCteQtdMedida(medida: CteCargaMedida): string {
  const qtd = fmtNum(medida.quantidade || '0', 4);
  const unid = cteUnidadeLabel(medida.unidade || '');
  return unid ? `${qtd}/${unid}` : qtd;
}

function formatCtePartyAddress(party: CtePartyData): string {
  if (!party.endereco) return '-';
  return party.endereco;
}

function formatCtePartyCity(party: CtePartyData): string {
  const city = [party.municipio, party.uf].filter(Boolean).join(' - ');
  return city || '-';
}

function extractCteData(parsed: any, invoice: PdfInvoiceView): CteData {
  const cteProc = parsed.cteProc || parsed;
  const cteNode = cteProc?.CTe || parsed?.CTe || cteProc;
  const infCte = cteNode?.infCte || cteNode || {};
  const ide = infCte?.ide || {};
  const emitNode = infCte?.emit || {};
  const remNode = infCte?.rem || {};
  const expedNode = infCte?.exped || {};
  const recebNode = infCte?.receb || {};
  const destNode = infCte?.dest || {};
  const emit = normalizeCteParty(emitNode, emitNode?.enderEmit || {});
  const rem = normalizeCteParty(remNode, remNode?.enderReme || {});
  const exped = normalizeCteParty(expedNode, expedNode?.enderExped || {});
  const receb = normalizeCteParty(recebNode, recebNode?.enderReceb || {});
  const dest = normalizeCteParty(destNode, destNode?.enderDest || {});

  const vPrest = infCte?.vPrest || {};
  const prot = cteProc?.protCTe?.infProt || {};
  const compl = infCte?.compl || {};
  const infCteNorm = infCte?.infCTeNorm || {};
  const infCarga = infCteNorm?.infCarga || {};
  const imp = infCte?.imp || {};
  const icms = imp?.ICMS || {};

  const icmsKey = Object.keys(icms).find((key) => key.startsWith('ICMS')) || '';
  const icmsNode = icmsKey ? icms[icmsKey] : {};

  const obsContArray = ensureArray(compl?.ObsCont).map((node: any) => ({
    campo: gv(node, '$', 'xCampo') || gv(node, 'xCampo'),
    texto: gv(node, 'xTexto') || gv(node, '_'),
  })).filter((item) => item.campo || item.texto);

  const obsText = [gv(compl, 'xObs'), ...obsContArray.map((item) => `${item.campo}: ${item.texto}`)]
    .filter((value) => value && String(value).trim().length > 0)
    .join('\n');

  const idAttr = gv(infCte, '$', 'Id');
  const idKey = idAttr ? idAttr.replace(/^CTe/, '') : '';
  const tomadorBase = parseCteTomador(infCte);
  const toma4 = ide?.toma4 || infCte?.toma4 || infCte?.infCteNorm?.toma4 || {};
  const toma3Raw = ide?.toma3;
  const toma03Raw = ide?.toma03;
  const toma3Code = typeof toma3Raw === 'object' ? (toma3Raw?.toma ?? '') : toma3Raw;
  const toma03Code = typeof toma03Raw === 'object' ? (toma03Raw?.toma ?? '') : toma03Raw;
  const tpTomRaw = String(gv(toma4, 'tpTom') || toma03Code || toma3Code || gv(ide, 'tpTom') || '').trim();
  const toma4Node = toma4?.toma || {};

  let tomNode: any = {};
  let tomEnder: any = {};
  let tomPapel = tomadorBase.papel || 'Tomador';
  if (tpTomRaw === '0') {
    tomNode = remNode;
    tomEnder = remNode?.enderReme || {};
    tomPapel = 'Remetente';
  } else if (tpTomRaw === '1') {
    tomNode = expedNode;
    tomEnder = expedNode?.enderExped || {};
    tomPapel = 'Expedidor';
  } else if (tpTomRaw === '2') {
    tomNode = recebNode;
    tomEnder = recebNode?.enderReceb || {};
    tomPapel = 'Recebedor';
  } else if (tpTomRaw === '3') {
    tomNode = destNode;
    tomEnder = destNode?.enderDest || {};
    tomPapel = 'Destinatário';
  } else if (tpTomRaw === '4') {
    tomNode = toma4Node;
    tomEnder = toma4Node?.enderToma || toma4?.enderToma || {};
    tomPapel = 'Outros';
  }

  let tom = normalizeCteParty(tomNode, tomEnder);
  if (!tom.nome && tomadorBase.party.nome) tom.nome = tomadorBase.party.nome;
  if (!tom.doc && tomadorBase.party.cnpj) tom.doc = tomadorBase.party.cnpj;
  if (!tom.nome) tom.nome = invoice.recipientName || '-';
  if (!tom.doc) tom.doc = invoice.recipientCnpj || '';

  const compArray = ensureArray(vPrest?.Comp).map((item: any) => ({
    nome: gv(item, 'xNome'),
    valor: gv(item, 'vComp'),
  })).filter((item) => item.nome || item.valor);

  const medArray = ensureArray(infCarga?.infQ).map((item: any) => ({
    tipo: gv(item, 'tpMed'),
    quantidade: gv(item, 'qCarga'),
    unidade: gv(item, 'cUnid'),
  })).filter((item) => item.tipo || item.quantidade);

  const docRefs: CteDocRef[] = [];
  const infNFeList = ensureArray(infCteNorm?.infDoc?.infNFe);
  for (const item of infNFeList) {
    const key = gv(item, 'chave');
    if (!key) continue;
    const parsedNfe = parseNfeKey(key);
    docRefs.push({
      modelo: parsedNfe.modelo === '55' ? 'NF-e' : parsedNfe.modelo,
      serie: parsedNfe.serie,
      numero: formatDocRefNumber(parsedNfe.numero),
      chave: key,
    });
  }
  const infCteList = ensureArray(infCteNorm?.infDoc?.infCTe);
  for (const item of infCteList) {
    const key = gv(item, 'chCTe');
    if (!key) continue;
    const digits = key.replace(/\D/g, '');
    docRefs.push({
      modelo: 'CT-e',
      serie: digits.length === 44 ? String(Number(digits.slice(22, 25))).padStart(3, '0') : '-',
      numero: digits.length === 44 ? String(Number(digits.slice(25, 34))).padStart(9, '0') : '-',
      chave: key,
    });
  }

  return {
    chCTe: gv(prot, 'chCTe') || idKey || invoice.accessKey,
    nCT: gv(ide, 'nCT') || invoice.number,
    serie: gv(ide, 'serie') || invoice.series || '1',
    modelo: gv(ide, 'mod') || '57',
    fl: '1/1',
    dhEmi: gv(ide, 'dhEmi') || invoice.issueDate.toISOString(),
    nProt: gv(prot, 'nProt'),
    dhRecbto: gv(prot, 'dhRecbto'),
    modal: getCteModalLabel(gv(ide, 'modal')),
    tpServico: getCteTpServLabel(gv(ide, 'tpServ')),
    tpCte: getCteTypeLabel(gv(ide, 'tpCTe')),
    tomPapel,
    indGlobalizado: getGlobalizadoLabel(gv(ide, 'indGlobalizado')),
    cfop: gv(ide, 'CFOP'),
    natOp: gv(ide, 'natOp'),
    inicioPrest: `${gv(ide, 'xMunIni') || '-'} - ${gv(ide, 'UFIni') || '-'}`,
    terminoPrest: `${gv(ide, 'xMunFim') || '-'} - ${gv(ide, 'UFFim') || '-'}`,
    emit: {
      ...emit,
      nome: emit.nome || invoice.senderName,
      doc: emit.doc || invoice.senderCnpj,
    },
    rem,
    dest,
    exped,
    receb,
    tom,
    prodPred: gv(infCarga, 'proPred'),
    vCarga: gv(infCarga, 'vCarga'),
    vTPrest: gv(vPrest, 'vTPrest') || String(invoice.totalValue || 0),
    vRec: gv(vPrest, 'vRec') || gv(vPrest, 'vTPrest') || String(invoice.totalValue || 0),
    componentes: compArray,
    medidas: medArray,
    cst: gv(icmsNode, 'CST'),
    vBC: gv(icmsNode, 'vBC'),
    pICMS: gv(icmsNode, 'pICMS'),
    vICMS: gv(icmsNode, 'vICMS'),
    redBc: gv(icmsNode, 'pRedBC') || '0.00',
    icmsSt: gv(icmsNode, 'vICMSST') || '0.00',
    docs: docRefs,
    obs: obsText,
    obsCont: obsContArray,
    rntrc: gv(infCteNorm, 'infModal', 'rodo', 'RNTRC'),
    versao: gv(infCte, '$', 'versao') || gv(cteProc, '$', 'versao') || '4.00',
  };
}

function buildCteDataFromInvoice(invoice: PdfInvoiceView): CteData {
  const emit = emptyCtePartyData();
  emit.nome = invoice.senderName || '-';
  emit.doc = invoice.senderCnpj || '';

  const tom = emptyCtePartyData();
  tom.nome = invoice.recipientName || '-';
  tom.doc = invoice.recipientCnpj || '';

  return {
    chCTe: invoice.accessKey,
    nCT: invoice.number || '-',
    serie: invoice.series || '1',
    modelo: '57',
    fl: '1/1',
    dhEmi: invoice.issueDate?.toISOString?.() || new Date().toISOString(),
    nProt: '',
    dhRecbto: '',
    modal: '-',
    tpServico: '-',
    tpCte: '-',
    tomPapel: 'Tomador',
    indGlobalizado: 'Não',
    cfop: '',
    vTPrest: String(invoice.totalValue || 0),
    vRec: String(invoice.totalValue || 0),
    natOp: '-',
    inicioPrest: '-',
    terminoPrest: '-',
    emit,
    rem: emptyCtePartyData(),
    dest: emptyCtePartyData(),
    exped: emptyCtePartyData(),
    receb: emptyCtePartyData(),
    tom,
    prodPred: '',
    vCarga: '',
    componentes: [],
    medidas: [],
    cst: '',
    vBC: '',
    pICMS: '',
    vICMS: '',
    redBc: '',
    icmsSt: '',
    docs: [],
    obs: '',
    obsCont: [],
    rntrc: '',
    versao: '4.00',
  };
}

function extractDanfeData(parsed: any): DanfeData {
  const proc = parsed.nfeProc || parsed.NFe || parsed;
  const nfe = proc.NFe || proc;
  const inf = nfe.infNFe || nfe;
  const ide = inf.ide || {};
  const emit = inf.emit || {};
  const dest = inf.dest || {};
  const emitEnd = emit.enderEmit || {};
  const destEnd = dest.enderDest || {};
  const tot = inf.total?.ICMSTot || {};
  const transp = inf.transp || {};
  const transporta = transp.transporta || {};
  const veic = transp.veicTransp || {};
  const vol = transp.vol ? (Array.isArray(transp.vol) ? transp.vol[0] : transp.vol) : {};
  const cobr = inf.cobr || {};
  const fat = cobr.fat || {};
  const infAdic = inf.infAdic || {};

  let chNFe = '';
  if (proc.protNFe?.infProt?.chNFe) chNFe = proc.protNFe.infProt.chNFe;
  else if (inf.$?.Id) chNFe = inf.$.Id.replace('NFe', '');

  let nProt = '';
  let dhRecbto = '';
  if (proc.protNFe?.infProt) {
    nProt = gv(proc.protNFe.infProt, 'nProt');
    dhRecbto = gv(proc.protNFe.infProt, 'dhRecbto');
  }

  // Extract products
  const dets = ensureArray(inf.det);
  const products: DanfeProduct[] = dets.map((det: any) => {
    const prod = det.prod || {};
    const imp = det.imposto || {};
    const icms = extractIcmsFromImposto(imp);
    const ipi = extractIpiFromImposto(imp);
    return {
      cProd: gv(prod, 'cProd'),
      xProd: gv(prod, 'xProd'),
      NCM: gv(prod, 'NCM'),
      origCST: icms.orig + icms.cst,
      CFOP: gv(prod, 'CFOP'),
      uCom: gv(prod, 'uCom'),
      qCom: gv(prod, 'qCom'),
      vUnCom: gv(prod, 'vUnCom'),
      vProd: gv(prod, 'vProd'),
      vDesc: gv(prod, 'vDesc') || '0.00',
      vBCICMS: icms.vBC,
      vICMS: icms.vICMS,
      vIPI: ipi.vIPI,
      pICMS: icms.pICMS,
      pIPI: ipi.pIPI,
      infAdProd: gv(det, 'infAdProd'),
    };
  });

  // Extract parcelas
  const dups = ensureArray(cobr.dup);
  const parcelas: DanfeParcela[] = dups.map((d: any) => ({
    nDup: gv(d, 'nDup'),
    dVenc: gv(d, 'dVenc'),
    vDup: gv(d, 'vDup'),
  }));

  // Calc vTotTrib percentage
  const vNF = parseFloat(gv(tot, 'vNF') || '0');
  const vTotTrib = parseFloat(gv(tot, 'vTotTrib') || '0');
  const pTotTrib = vNF > 0 ? ((vTotTrib / vNF) * 100).toFixed(2) : '0.00';

  return {
    chNFe,
    nNF: gv(ide, 'nNF'),
    serie: gv(ide, 'serie'),
    dhEmi: gv(ide, 'dhEmi') || gv(ide, 'dEmi'),
    dhSaiEnt: gv(ide, 'dhSaiEnt') || gv(ide, 'dSaiEnt') || gv(ide, 'dhEmi') || gv(ide, 'dEmi'),
    natOp: gv(ide, 'natOp'),
    tpNF: gv(ide, 'tpNF'),
    nProt,
    dhRecbto,

    emitNome: gv(emit, 'xNome'),
    emitCnpj: gv(emit, 'CNPJ') || gv(emit, 'CPF'),
    emitIE: gv(emit, 'IE'),
    emitIEST: gv(emit, 'IEST') || '',
    emitEnd: [gv(emitEnd, 'xLgr'), gv(emitEnd, 'nro'), gv(emitEnd, 'xCpl')].filter(Boolean).join(', '),
    emitBairro: gv(emitEnd, 'xBairro'),
    emitMun: gv(emitEnd, 'xMun'),
    emitUF: gv(emitEnd, 'UF'),
    emitCEP: gv(emitEnd, 'CEP'),
    emitFone: gv(emitEnd, 'fone'),

    destNome: gv(dest, 'xNome'),
    destCnpj: gv(dest, 'CNPJ') || gv(dest, 'CPF'),
    destIE: gv(dest, 'IE') || '',
    destEnd: [gv(destEnd, 'xLgr'), gv(destEnd, 'nro'), gv(destEnd, 'xCpl')].filter(Boolean).join(', '),
    destBairro: gv(destEnd, 'xBairro'),
    destMun: gv(destEnd, 'xMun'),
    destUF: gv(destEnd, 'UF'),
    destCEP: gv(destEnd, 'CEP'),
    destFone: gv(destEnd, 'fone'),

    vBC: gv(tot, 'vBC') || '0.00',
    vICMS: gv(tot, 'vICMS') || '0.00',
    vBCST: gv(tot, 'vBCST') || '0.00',
    vST: gv(tot, 'vST') || '0.00',
    vProd: gv(tot, 'vProd') || '0.00',
    vFrete: gv(tot, 'vFrete') || '0.00',
    vSeg: gv(tot, 'vSeg') || '0.00',
    vDesc: gv(tot, 'vDesc') || '0.00',
    vOutro: gv(tot, 'vOutro') || '0.00',
    vIPI: gv(tot, 'vIPI') || '0.00',
    vNF: gv(tot, 'vNF') || '0.00',
    vTotTrib: gv(tot, 'vTotTrib') || '0.00',
    pTotTrib,

    products,

    modFrete: gv(transp, 'modFrete'),
    transpNome: gv(transporta, 'xNome'),
    transpCnpj: gv(transporta, 'CNPJ') || gv(transporta, 'CPF'),
    transpIE: gv(transporta, 'IE'),
    transpEnd: gv(transporta, 'xEnder'),
    transpMun: gv(transporta, 'xMun'),
    transpUF: gv(transporta, 'UF'),
    veicPlaca: gv(veic, 'placa'),
    veicUF: gv(veic, 'UF'),
    veicAntt: gv(veic, 'RNTC'),
    volQtd: gv(vol, 'qVol'),
    volEsp: gv(vol, 'esp'),
    volMarca: gv(vol, 'marca'),
    volNum: gv(vol, 'nVol'),
    volPesoB: gv(vol, 'pesoB'),
    volPesoL: gv(vol, 'pesoL'),

    fatNum: gv(fat, 'nFat'),
    fatVOrig: gv(fat, 'vOrig') || '0.00',
    fatVDesc: gv(fat, 'vDesc') || '0.00',
    fatVLiq: gv(fat, 'vLiq') || '0.00',
    parcelas,

    infCpl: gv(infAdic, 'infCpl'),
    infAdFisco: gv(infAdic, 'infAdFisco'),
  };
}

function extractIcmsFromImposto(imp: any): { orig: string; cst: string; vBC: string; vICMS: string; pICMS: string } {
  const icms = imp?.ICMS;
  if (!icms) return { orig: '', cst: '', vBC: '0.00', vICMS: '0.00', pICMS: '0.00' };
  const key = Object.keys(icms).find(k => k.startsWith('ICMS'));
  const g = key ? icms[key] : null;
  if (!g) return { orig: '', cst: '', vBC: '0.00', vICMS: '0.00', pICMS: '0.00' };
  return {
    orig: gv(g, 'orig'),
    cst: gv(g, 'CST') || gv(g, 'CSOSN'),
    vBC: gv(g, 'vBC') || '0.00',
    vICMS: gv(g, 'vICMS') || '0.00',
    pICMS: gv(g, 'pICMS') || '0.00',
  };
}

function extractIpiFromImposto(imp: any): { vIPI: string; pIPI: string } {
  const ipi = imp?.IPI;
  if (!ipi) return { vIPI: '0.00', pIPI: '0.00' };
  const g = ipi.IPITrib || ipi.IPINT;
  if (!g) return { vIPI: '0.00', pIPI: '0.00' };
  return { vIPI: gv(g, 'vIPI') || '0.00', pIPI: gv(g, 'pIPI') || '0.00' };
}

// ==================== CSS ====================

const CSS = `
* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: Arial, Helvetica, sans-serif; color: #000; background: #e9e9e9; }
.page { width: 210mm; margin: 10mm auto; background: #fff; padding: 5mm; }
@media print {
  body { background: #fff; }
  .page { width: 100%; margin: 0; padding: 5mm; box-shadow: none; }
  @page { size: A4 portrait; margin: 5mm; }
}

table.danfe { width: 100%; border-collapse: collapse; margin-top: -1px; }
table.danfe td, table.danfe th { border: 1px solid #000; padding: 1px 3px; vertical-align: top; font-size: 8px; }
table.danfe .lbl { display: block; font-size: 6px; font-weight: bold; text-transform: uppercase; color: #333; line-height: 1.2; margin-bottom: 0px; }
table.danfe .val { display: block; font-size: 9px; font-weight: 600; line-height: 1.3; }
table.danfe .val-lg { display: block; font-size: 11px; font-weight: 700; line-height: 1.3; }
table.danfe .val-mono { display: block; font-size: 8px; font-family: 'Courier New', monospace; line-height: 1.4; }
table.danfe .center { text-align: center; }
table.danfe .right { text-align: right; }
table.danfe .no-border-t { border-top: none; }
table.danfe .no-border-b { border-bottom: none; }
table.danfe .no-border-l { border-left: none; }
table.danfe .no-border-r { border-right: none; }
table.danfe .section-title { background: #f5f5f5; font-size: 7px; font-weight: bold; text-transform: uppercase; padding: 2px 4px; }

.canhoto-wrapper { margin-bottom: 2mm; }
.canhoto-line { border-bottom: 1px dashed #000; margin: 2mm 0; }

.danfe-box { text-align: center; padding: 2px 4px; }
.danfe-box .danfe-title { font-size: 12px; font-weight: bold; letter-spacing: 1px; }
.danfe-box .danfe-sub { font-size: 7px; line-height: 1.3; }
.danfe-box .entry-exit { display: flex; justify-content: center; align-items: center; gap: 4px; margin: 3px 0; font-size: 7px; }
.danfe-box .entry-exit .box { width: 14px; height: 14px; border: 1px solid #000; display: flex; align-items: center; justify-content: center; font-size: 10px; font-weight: bold; }
.danfe-box .nf-num { font-size: 11px; font-weight: bold; margin: 2px 0; }
.danfe-box .nf-serie { font-size: 8px; }
.danfe-box .nf-page { font-size: 8px; }

.key-area { font-size: 7px; }
.key-area .key-value { font-family: 'Courier New', monospace; font-size: 9px; font-weight: bold; letter-spacing: 0.5px; word-break: break-all; margin-top: 2px; }
.key-area .consulta { font-size: 6.5px; color: #333; margin-top: 4px; line-height: 1.3; }

.nfe-badge { font-size: 14px; font-weight: bold; text-align: center; }

table.prods { width: 100%; border-collapse: collapse; margin-top: -1px; }
table.prods td, table.prods th { border: 1px solid #000; padding: 1px 2px; font-size: 7px; vertical-align: top; }
table.prods th { font-size: 6px; font-weight: bold; text-transform: uppercase; text-align: center; background: #f5f5f5; padding: 2px; }
table.prods td.right { text-align: right; }
table.prods td.center { text-align: center; }
table.prods .prod-desc { font-size: 7px; font-weight: 600; }
table.prods .prod-info { font-size: 6.5px; color: #444; }

.footer-line { font-size: 7px; display: flex; justify-content: space-between; padding: 3px 0; margin-top: 2mm; color: #555; }

.parcelas-grid { display: flex; flex-wrap: wrap; gap: 0; }
.parcela-item { border: 1px solid #000; border-left: none; padding: 1px 4px; font-size: 7px; min-width: 100px; }
.parcela-item:first-child { border-left: 1px solid #000; }
.parcela-item .lbl { font-size: 5.5px; font-weight: bold; text-transform: uppercase; }
.parcela-item .val { font-size: 7.5px; font-weight: 600; }
`;

// ==================== HTML Sections ====================

function buildCanhoto(d: DanfeData): string {
  return `
<div class="canhoto-wrapper">
  <table class="danfe">
    <tr>
      <td colspan="3" rowspan="2" style="width:80%; font-size:7px; padding:3px 4px;">
        <span style="font-size:7px;">RECEBEMOS DE ${esc(d.emitNome)} OS PRODUTOS CONSTANTES NA NOTA FISCAL INDICADA AO LADO.</span><br>
        <span style="font-size:6.5px; color:#555;">Emiss&atilde;o:${fmtDate(d.dhEmi)} Dest/Reme: ${esc(d.destNome)} Valor Total: ${fmtCurrency(d.vNF)}</span>
      </td>
      <td rowspan="4" style="width:20%; text-align:center; vertical-align:middle;">
        <div class="nfe-badge">NF-e</div>
        <div style="font-size:9px; font-weight:bold;">N&ordm; ${fmtNfNum(d.nNF)}</div>
        <div style="font-size:8px;">S&Eacute;RIE: ${esc(d.serie).padStart(3, '0')}</div>
      </td>
    </tr>
    <tr></tr>
    <tr>
      <td style="width:25%; font-size:6px; padding:2px 4px;">
        <span class="lbl">DATA DE RECEBIMENTO</span>
      </td>
      <td colspan="2" style="font-size:6px; padding:2px 4px;">
        <span class="lbl">IDENTIFICA&Ccedil;&Atilde;O E ASSINATURA DO RECEBEDOR</span>
      </td>
    </tr>
  </table>
  <div class="canhoto-line"></div>
</div>`;
}

function buildHeader(d: DanfeData): string {
  const protText = d.nProt ? `${esc(d.nProt)} em: ${fmtDateTime(d.dhRecbto)}` : '';
  return `
<table class="danfe">
  <tr>
    <td rowspan="4" style="width:38%; padding:4px 6px;">
      <div style="font-size:12px; font-weight:bold; margin-bottom:2px;">${esc(d.emitNome)}</div>
      <div style="font-size:8px; line-height:1.4;">${esc(d.emitEnd)}<br>${esc(d.emitBairro)} - ${esc(d.emitMun)} - ${esc(d.emitUF)}<br>CEP: ${fmtCep(d.emitCEP)}<br>FONE: ${fmtFone(d.emitFone)}</div>
    </td>
    <td rowspan="4" style="width:22%;" class="danfe-box">
      <div class="danfe-title">DANFE</div>
      <div class="danfe-sub">DOCUMENTO<br>AUXILIAR DE NOTA<br>FISCAL ELETR&Ocirc;NICA</div>
      <div class="entry-exit">
        <span style="font-size:7px;">0 - ENTRADA</span>
        <div class="box">${esc(d.tpNF)}</div>
      </div>
      <div class="entry-exit" style="margin-top:0;">
        <span style="font-size:7px;">1 - SA&Iacute;DA</span>
        <div class="box" style="border:none;"></div>
      </div>
      <div class="nf-num">N&ordm; ${fmtNfNum(d.nNF)}</div>
      <div class="nf-serie">S&Eacute;RIE: ${esc(d.serie).padStart(3, '0')}</div>
      <div class="nf-page">P&Aacute;GINA 1 /1</div>
    </td>
    <td style="width:40%; padding:3px 5px;" class="key-area">
      <span class="lbl">CHAVE DE ACESSO</span>
      <div class="key-value">${fmtKey(d.chNFe)}</div>
    </td>
  </tr>
  <tr>
    <td style="padding:3px 5px;" class="key-area">
      <div class="consulta">Consulta de autenticidade no portal nacional da NF-e<br><b>www.nfe.fazenda.gov.br/portal</b> ou no site da Sefaz Autorizadora.</div>
    </td>
  </tr>
  <tr>
    <td style="padding:2px 4px;">
      <span class="lbl">NATUREZA DA OPERA&Ccedil;&Atilde;O</span>
      <span class="val">${esc(d.natOp)}</span>
    </td>
  </tr>
  <tr>
    <td style="padding:2px 4px;">
      <span class="lbl">PROTOCOLO DE AUTORIZA&Ccedil;&Atilde;O DE USO</span>
      <span class="val">${esc(protText)}</span>
    </td>
  </tr>
  <tr>
    <td style="padding:2px 4px;">
      <span class="lbl">INSCRI&Ccedil;&Atilde;O ESTADUAL</span>
      <span class="val">${esc(d.emitIE)}</span>
    </td>
    <td style="padding:2px 4px;">
      <span class="lbl">INSCRI&Ccedil;&Atilde;O ESTADUAL DE SUBST.</span>
      <span class="val">${esc(d.emitIEST)}</span>
    </td>
    <td style="padding:2px 4px;">
      <span class="lbl">CNPJ / CPF</span>
      <span class="val">${fmtCnpj(d.emitCnpj)}</span>
    </td>
  </tr>
</table>`;
}

function buildDest(d: DanfeData): string {
  return `
<table class="danfe">
  <tr>
    <td colspan="5" class="section-title">DESTINAT&Aacute;RIO / REMETENTE</td>
  </tr>
  <tr>
    <td colspan="3" style="width:55%; padding:2px 4px;">
      <span class="lbl">NOME / RAZ&Atilde;O SOCIAL</span>
      <span class="val">${esc(d.destNome)}</span>
    </td>
    <td style="width:25%; padding:2px 4px;">
      <span class="lbl">CNPJ / CPF</span>
      <span class="val">${fmtCnpj(d.destCnpj)}</span>
    </td>
    <td style="width:20%; padding:2px 4px;">
      <span class="lbl">DATA EMISS&Atilde;O</span>
      <span class="val">${fmtDate(d.dhEmi)}</span>
    </td>
  </tr>
  <tr>
    <td colspan="2" style="width:40%; padding:2px 4px;">
      <span class="lbl">ENDERE&Ccedil;O</span>
      <span class="val">${esc(d.destEnd)}</span>
    </td>
    <td style="padding:2px 4px;">
      <span class="lbl">BAIRRO / DISTRITO</span>
      <span class="val">${esc(d.destBairro)}</span>
    </td>
    <td style="padding:2px 4px;">
      <span class="lbl">CEP</span>
      <span class="val">${fmtCep(d.destCEP)}</span>
    </td>
    <td style="padding:2px 4px;">
      <span class="lbl">DATA SA&Iacute;DA</span>
      <span class="val">${fmtDate(d.dhSaiEnt)}</span>
    </td>
  </tr>
  <tr>
    <td style="width:30%; padding:2px 4px;">
      <span class="lbl">MUNIC&Iacute;PIO</span>
      <span class="val">${esc(d.destMun)}</span>
    </td>
    <td style="width:10%; padding:2px 4px;">
      <span class="lbl">UF</span>
      <span class="val">${esc(d.destUF)}</span>
    </td>
    <td style="padding:2px 4px;">
      <span class="lbl">TELEFONE / FAX</span>
      <span class="val">${fmtFone(d.destFone)}</span>
    </td>
    <td style="padding:2px 4px;">
      <span class="lbl">INSCRI&Ccedil;&Atilde;O ESTADUAL</span>
      <span class="val">${esc(d.destIE)}</span>
    </td>
    <td style="padding:2px 4px;">
      <span class="lbl">HORA SA&Iacute;DA</span>
      <span class="val">${fmtTime(d.dhSaiEnt)}</span>
    </td>
  </tr>
</table>`;
}

function buildFatura(d: DanfeData): string {
  if (!d.fatNum && d.parcelas.length === 0) return '';

  let parcelasHtml = '';
  if (d.parcelas.length > 0) {
    const rows: string[] = [];
    for (let i = 0; i < d.parcelas.length; i += 3) {
      const chunk = d.parcelas.slice(i, i + 3);
      const cols = chunk.map(p => `
        <td style="padding:1px 4px;">
          <span class="lbl">N&Uacute;MERO</span><span class="val" style="font-size:7.5px;">${esc(p.nDup)}</span>
        </td>
        <td style="padding:1px 4px;">
          <span class="lbl">VENCIMENTO</span><span class="val" style="font-size:7.5px;">${fmtDate(p.dVenc)}</span>
        </td>
        <td style="padding:1px 4px;">
          <span class="lbl">VALOR</span><span class="val" style="font-size:7.5px;">${fmtCurrency(p.vDup)}</span>
        </td>
      `).join('');
      // Pad remaining columns if less than 3 parcelas in this row
      const remaining = 3 - chunk.length;
      const padCols = '<td style="padding:1px 4px;"></td><td style="padding:1px 4px;"></td><td style="padding:1px 4px;"></td>'.repeat(remaining);
      rows.push(`<tr>${cols}${padCols}</tr>`);
    }
    parcelasHtml = `
    <tr><td colspan="9" class="section-title" style="font-size:6px;">PARCELAS</td></tr>
    ${rows.join('')}`;
  }

  return `
<table class="danfe">
  <tr>
    <td colspan="9" class="section-title">FATURA</td>
  </tr>
  <tr>
    <td colspan="9" style="padding:2px 4px; font-size:8px;">
      <b>DADOS DA FATURA</b>&nbsp;&nbsp;
      N&uacute;mero: ${esc(d.fatNum)}&nbsp;&nbsp;&nbsp;
      Valor Original: ${fmtCurrency(d.fatVOrig)}&nbsp;&nbsp;&nbsp;
      Valor Desconto: ${fmtCurrency(d.fatVDesc)}&nbsp;&nbsp;&nbsp;
      Valor L&iacute;quido: ${fmtCurrency(d.fatVLiq)}
    </td>
  </tr>
  ${parcelasHtml}
</table>`;
}

function buildImpostos(d: DanfeData): string {
  return `
<table class="danfe">
  <tr>
    <td colspan="7" class="section-title">C&Aacute;LCULO DO IMPOSTO</td>
  </tr>
  <tr>
    <td style="padding:2px 4px;">
      <span class="lbl">BASE DE C&Aacute;LCULO DO ICMS</span>
      <span class="val right">${fmtCurrency(d.vBC)}</span>
    </td>
    <td style="padding:2px 4px;">
      <span class="lbl">VALOR DO ICMS</span>
      <span class="val right">${fmtCurrency(d.vICMS)}</span>
    </td>
    <td style="padding:2px 4px;">
      <span class="lbl">BASE DE C&Aacute;LCULO DO ICMS SUBST.</span>
      <span class="val right">${fmtCurrency(d.vBCST)}</span>
    </td>
    <td style="padding:2px 4px;">
      <span class="lbl">VALOR DO ICMS SUBST.</span>
      <span class="val right">${fmtCurrency(d.vST)}</span>
    </td>
    <td style="padding:2px 4px;">
      <span class="lbl">VALOR TOTAL DOS PRODUTOS</span>
      <span class="val right">${fmtCurrency(d.vProd)}</span>
    </td>
  </tr>
  <tr>
    <td style="padding:2px 4px;">
      <span class="lbl">VALOR APROX. TRIBUTOS</span>
      <span class="val right">${fmtCurrency(d.vTotTrib)} (${fmtNum(d.pTotTrib)}%)</span>
    </td>
    <td style="padding:2px 4px;">
      <span class="lbl">VALOR DO FRETE</span>
      <span class="val right">${fmtCurrency(d.vFrete)}</span>
    </td>
    <td style="padding:2px 4px;">
      <span class="lbl">VALOR DO SEGURO</span>
      <span class="val right">${fmtCurrency(d.vSeg)}</span>
    </td>
    <td style="padding:2px 4px;">
      <span class="lbl">DESCONTO</span>
      <span class="val right">${fmtCurrency(d.vDesc)}</span>
    </td>
    <td style="padding:2px 4px;">
      <span class="lbl">OUTRAS DESPESAS ACESS&Oacute;RIAS</span>
      <span class="val right">${fmtCurrency(d.vOutro)}</span>
    </td>
  </tr>
  <tr>
    <td colspan="3"></td>
    <td style="padding:2px 4px;">
      <span class="lbl">VALOR TOTAL DO IPI</span>
      <span class="val right">${fmtCurrency(d.vIPI)}</span>
    </td>
    <td style="padding:2px 4px;">
      <span class="lbl">VALOR TOTAL DA NOTA</span>
      <span class="val-lg right">${fmtCurrency(d.vNF)}</span>
    </td>
  </tr>
</table>`;
}

function buildTransporte(d: DanfeData): string {
  return `
<table class="danfe">
  <tr>
    <td colspan="6" class="section-title">TRANSPORTADOR / VOLUMES TRANSPORTADOS</td>
  </tr>
  <tr>
    <td style="width:30%; padding:2px 4px;">
      <span class="lbl">NOME / RAZ&Atilde;O SOCIAL</span>
      <span class="val">${esc(d.transpNome) || esc(modFreteLabel(d.modFrete))}</span>
    </td>
    <td style="width:15%; padding:2px 4px;">
      <span class="lbl">FRETE POR CONTA</span>
      <span class="val">${modFreteCode(d.modFrete)}</span>
    </td>
    <td style="width:12%; padding:2px 4px;">
      <span class="lbl">C&Oacute;DIGO ANTT</span>
      <span class="val">${esc(d.veicAntt)}</span>
    </td>
    <td style="width:12%; padding:2px 4px;">
      <span class="lbl">PLACA DO VE&Iacute;CULO</span>
      <span class="val">${esc(d.veicPlaca)}</span>
    </td>
    <td style="width:8%; padding:2px 4px;">
      <span class="lbl">UF</span>
      <span class="val">${esc(d.veicUF)}</span>
    </td>
    <td style="width:23%; padding:2px 4px;">
      <span class="lbl">CNPJ / CPF</span>
      <span class="val">${fmtCnpj(d.transpCnpj)}</span>
    </td>
  </tr>
  <tr>
    <td colspan="2" style="padding:2px 4px;">
      <span class="lbl">ENDERE&Ccedil;O</span>
      <span class="val">${esc(d.transpEnd)}</span>
    </td>
    <td colspan="2" style="padding:2px 4px;">
      <span class="lbl">MUNIC&Iacute;PIO</span>
      <span class="val">${esc(d.transpMun)}</span>
    </td>
    <td style="padding:2px 4px;">
      <span class="lbl">UF</span>
      <span class="val">${esc(d.transpUF)}</span>
    </td>
    <td style="padding:2px 4px;">
      <span class="lbl">INSCRI&Ccedil;&Atilde;O ESTADUAL</span>
      <span class="val">${esc(d.transpIE)}</span>
    </td>
  </tr>
  <tr>
    <td style="padding:2px 4px;">
      <span class="lbl">QUANTIDADE</span>
      <span class="val">${esc(d.volQtd)}</span>
    </td>
    <td style="padding:2px 4px;">
      <span class="lbl">ESP&Eacute;CIE</span>
      <span class="val">${esc(d.volEsp)}</span>
    </td>
    <td style="padding:2px 4px;">
      <span class="lbl">MARCA</span>
      <span class="val">${esc(d.volMarca)}</span>
    </td>
    <td style="padding:2px 4px;">
      <span class="lbl">NUMERA&Ccedil;&Atilde;O</span>
      <span class="val">${esc(d.volNum)}</span>
    </td>
    <td style="padding:2px 4px;">
      <span class="lbl">PESO BRUTO</span>
      <span class="val right">${d.volPesoB ? fmtNum(d.volPesoB, 3) : ''}</span>
    </td>
    <td style="padding:2px 4px;">
      <span class="lbl">PESO L&Iacute;QUIDO</span>
      <span class="val right">${d.volPesoL ? fmtNum(d.volPesoL, 3) : ''}</span>
    </td>
  </tr>
</table>`;
}

function buildProducts(d: DanfeData): string {
  const rows = d.products.map(p => {
    const descLine = esc(p.xProd) + (p.infAdProd ? `<br><span class="prod-info">${esc(p.infAdProd)}</span>` : '');
    return `
    <tr>
      <td>${esc(p.cProd)}</td>
      <td class="prod-desc">${descLine}</td>
      <td class="center">${esc(p.NCM)}</td>
      <td class="center">${esc(p.origCST)}</td>
      <td class="center">${esc(p.CFOP)}</td>
      <td class="center">${esc(p.uCom)}</td>
      <td class="right">${fmtNum(p.qCom, 2)}</td>
      <td class="right">${fmtNum(p.vUnCom, 4)}</td>
      <td class="right">${fmtNum(p.vProd, 2)}</td>
      <td class="right">${fmtNum(p.vDesc, 2)}</td>
      <td class="right">${fmtNum(p.vBCICMS, 2)}</td>
      <td class="right">${fmtNum(p.vICMS, 2)}</td>
      <td class="right">${fmtNum(p.vIPI, 2)}</td>
      <td class="right">${fmtNum(p.pICMS, 2)}</td>
      <td class="right">${fmtNum(p.pIPI, 2)}</td>
    </tr>`;
  }).join('');

  return `
<table class="prods">
  <thead>
    <tr>
      <th colspan="15" style="text-align:left; padding:2px 4px;">DADOS DOS PRODUTOS / SERVI&Ccedil;OS</th>
    </tr>
    <tr>
      <th style="width:6%;">C&Oacute;DIGO</th>
      <th style="width:20%;">DESCRI&Ccedil;&Atilde;O DOS PRODUTOS / SERVI&Ccedil;OS</th>
      <th style="width:6%;">NCM/SH</th>
      <th style="width:3%;">CST</th>
      <th style="width:4%;">CFOP</th>
      <th style="width:3%;">UNID.</th>
      <th style="width:5%;">QTDE.</th>
      <th style="width:7%;">VALOR<br>UNIT&Aacute;RIO</th>
      <th style="width:7%;">VALOR<br>TOTAL</th>
      <th style="width:5%;">VALOR<br>DESCONTO</th>
      <th style="width:7%;">Base de C&aacute;lc.<br>ICMS</th>
      <th style="width:5%;">VALOR<br>ICMS</th>
      <th style="width:5%;">VALOR<br>IPI</th>
      <th style="width:5%;">AL&Iacute;QUOTA<br>ICMS %</th>
      <th style="width:4%;">IPI %</th>
    </tr>
  </thead>
  <tbody>
    ${rows || '<tr><td colspan="15" style="text-align:center; padding:8px; color:#888;">Nenhum item encontrado</td></tr>'}
  </tbody>
</table>`;
}

function buildAdditional(d: DanfeData): string {
  return `
<table class="danfe">
  <tr>
    <td colspan="2" class="section-title">DADOS ADICIONAIS</td>
  </tr>
  <tr>
    <td style="width:65%; padding:2px 4px; min-height:30px; vertical-align:top;">
      <span class="lbl">INFORMA&Ccedil;&Otilde;ES COMPLEMENTARES</span>
      <div style="font-size:7px; line-height:1.4; margin-top:2px; white-space:pre-wrap; word-break:break-word;">${esc(d.infCpl)}</div>
    </td>
    <td style="width:35%; padding:2px 4px; min-height:30px; vertical-align:top;">
      <span class="lbl">RESERVADO AO FISCO</span>
      <div style="font-size:7px; line-height:1.4; margin-top:2px;">${esc(d.infAdFisco)}</div>
    </td>
  </tr>
</table>`;
}

// ==================== Main Builder ====================

function buildDanfeHtml(d: DanfeData, autoPrint: boolean): string {
  const now = new Date().toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>DANFE - NF-e ${fmtNfNum(d.nNF)}</title>
  <style>${CSS}</style>
</head>
<body>
  <div class="page">
    ${buildCanhoto(d)}
    ${buildHeader(d)}
    ${buildDest(d)}
    ${buildFatura(d)}
    ${buildImpostos(d)}
    ${buildTransporte(d)}
    ${buildProducts(d)}
    ${buildAdditional(d)}
    <div class="footer-line">
      <span>DATA E HORA DA IMPRESS&Atilde;O:${now}</span>
      <span>QLMED - Sistema de Gest&atilde;o Fiscal</span>
    </div>
  </div>
  ${autoPrint ? '<script>window.addEventListener("load", function() { window.print(); });</script>' : ''}
</body>
</html>`;
}

function buildCteHtml(d: CteData, autoPrint: boolean): string {
  const now = new Date().toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  const title = `QLMED/${d.chCTe}-cte.pdf`;
  const docs = d.docs.length > 0
    ? d.docs
    : [{ modelo: '-', serie: '-', numero: '-', chave: '-' }];
  const componentes = d.componentes.length > 0
    ? d.componentes
    : [{ nome: '-', valor: '0' }];
  const medidas = d.medidas.length > 0
    ? d.medidas
    : [{ tipo: '-', quantidade: '0', unidade: '' }];

  const partySection = (label: string, party: CtePartyData) => {
    if (!party.nome && !party.doc) return '';
    return `
    <div class="dacte-section"><div class="dacte-section-header">${esc(label)}</div><div class="dacte-section-body">
      <div class="dacte-field full"><span class="dacte-lbl">Razão Social / Nome</span><span class="dacte-val">${esc(party.nome || '-')}</span></div>
      <div class="dacte-field"><span class="dacte-lbl">CNPJ/CPF</span><span class="dacte-val">${esc(fmtCnpj(party.doc || ''))}</span></div>
      <div class="dacte-field"><span class="dacte-lbl">Inscrição Estadual</span><span class="dacte-val">${esc(party.ie || '')}</span></div>
      <div class="dacte-field"><span class="dacte-lbl">Fone</span><span class="dacte-val">${esc(fmtFone(party.fone || ''))}</span></div>
      <div class="dacte-field full"><span class="dacte-lbl">Endereço</span><span class="dacte-val">${esc(formatCtePartyAddress(party))}${party.bairro ? ` - ${esc(party.bairro)}` : ''}</span></div>
      <div class="dacte-field"><span class="dacte-lbl">Município</span><span class="dacte-val">${esc(party.municipio || '-')}</span></div>
      <div class="dacte-field" style="max-width:40px"><span class="dacte-lbl">UF</span><span class="dacte-val">${esc(party.uf || '-')}</span></div>
      <div class="dacte-field"><span class="dacte-lbl">CEP</span><span class="dacte-val">${esc(fmtCep(party.cep || ''))}</span></div>
    </div></div>`;
  };

  const compTableRows = componentes.map((c) => `
    <tr><td class="dacte-comp-nome">${esc(c.nome || '-')}</td><td class="dacte-comp-val right">R$ ${fmtNum(c.valor || '0', 2)}</td></tr>
  `).join('');

  const docRefRows = docs.map((doc) =>
    `<div class="dacte-doc-ref">${esc(fmtKey(doc.chave || '-'))}</div>`
  ).join('');

  const medidaRows = medidas.map((m) => `
    <div class="dacte-field"><span class="dacte-lbl">${esc(m.tipo || 'Peso')}</span><span class="dacte-val">${esc(formatCteQtdMedida(m))}</span></div>
  `).join('');

  // Observations: combine obs + obsCont
  const obsLines: string[] = [];
  if (d.obs) obsLines.push(d.obs);
  for (const item of d.obsCont) {
    obsLines.push(`${item.campo}: ${item.texto}`);
  }
  const obsText = obsLines.join(' | ');

  // Origin / Destination from inicioPrest / terminoPrest
  const [munOrigem, ufOrigem] = (d.inicioPrest || ' - ').split(' - ').map((s) => s.trim());
  const [munDestino, ufDestino] = (d.terminoPrest || ' - ').split(' - ').map((s) => s.trim());

  const DACTE_CSS = `
    .dacte-header { display:grid; grid-template-columns:1fr auto; gap:0; border:1px solid #000; margin-bottom:4px; }
    .dacte-emit-box { padding:6px 8px; border-right:1px solid #000; }
    .dacte-emit-nome { font-size:13px; font-weight:bold; margin-bottom:2px; }
    .dacte-emit-end { font-size:8px; color:#333; line-height:1.4; }
    .dacte-title-box { display:flex; flex-direction:column; align-items:center; justify-content:center; padding:6px 12px; min-width:180px; text-align:center; }
    .dacte-title { font-size:14px; font-weight:900; letter-spacing:2px; }
    .dacte-subtitle { font-size:7px; font-weight:bold; margin-bottom:4px; }
    .dacte-model { font-size:9px; font-weight:bold; }
    .dacte-num { font-size:10px; font-weight:bold; margin-top:4px; }
    .dacte-section { border:1px solid #000; margin-bottom:3px; }
    .dacte-section-header { background:#eee; font-size:7px; font-weight:bold; text-transform:uppercase; padding:1px 4px; border-bottom:1px solid #000; letter-spacing:.5px; }
    .dacte-section-body { display:flex; flex-wrap:wrap; padding:2px; gap:0; }
    .dacte-field { display:flex; flex-direction:column; padding:1px 4px; min-width:80px; flex:1; }
    .dacte-field.full { flex:0 0 100%; width:100%; }
    .dacte-lbl { font-size:6px; color:#555; text-transform:uppercase; font-weight:bold; }
    .dacte-val { font-size:9px; }
    .dacte-percurso { display:flex; align-items:center; justify-content:center; gap:20px; padding:8px; }
    .dacte-percurso-item { text-align:center; }
    .dacte-percurso-mun { font-size:13px; font-weight:bold; }
    .dacte-percurso-uf { font-size:11px; color:#555; }
    .dacte-percurso-label { font-size:7px; color:#888; text-transform:uppercase; }
    .dacte-percurso-arrow { font-size:24px; color:#999; }
    .dacte-comps-table { width:100%; border-collapse:collapse; font-size:8px; }
    .dacte-comps-table th { background:#eee; padding:2px 4px; text-align:left; font-size:7px; font-weight:bold; border-bottom:1px solid #ccc; }
    .dacte-comps-table td { padding:2px 4px; border-bottom:1px solid #f0f0f0; }
    .dacte-comp-val { width:80px; }
    .dacte-comps-total { display:flex; justify-content:space-between; padding:4px 8px; border-top:2px solid #000; font-weight:bold; font-size:9px; }
    .dacte-comps-subtotal { display:flex; justify-content:space-between; padding:4px 8px; border-top:1px solid #ccc; font-weight:normal; font-size:8px; }
    .dacte-key-box { border:1px solid #000; padding:4px 6px; margin-bottom:3px; }
    .dacte-key-box .dacte-lbl { font-size:6.5px; font-weight:bold; text-transform:uppercase; color:#555; margin-bottom:1px; }
    .dacte-key-val { font-family:monospace; font-size:9px; letter-spacing:.3px; font-weight:bold; }
    .dacte-prot-box { display:flex; justify-content:space-between; align-items:center; border:1px solid #000; padding:4px 8px; margin-bottom:3px; background:#f9f9f9; }
    .dacte-prot-label { font-size:7px; color:#555; text-transform:uppercase; }
    .dacte-prot-val { font-size:9px; font-weight:bold; }
    .dacte-doc-ref { font-family:monospace; font-size:8px; letter-spacing:.3px; padding:1px 0; border-bottom:1px solid #eee; }
    .dacte-obs-box { border:1px solid #000; padding:4px 6px; margin-bottom:3px; font-size:8px; min-height:30px; }
    .dacte-obs-box .dacte-lbl { font-size:6.5px; font-weight:bold; text-transform:uppercase; color:#555; margin-bottom:2px; }
    .right { text-align:right; }
  `;

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>
    ${CSS}
    ${DACTE_CSS}
    @media print {
      body { margin:0; }
      .page { margin:0; padding:4mm; box-shadow:none; }
      .no-print { display:none; }
    }
  </style>
</head>
<body>
  <div class="page">

    <!-- CHAVE DE ACESSO -->
    <div class="dacte-key-box">
      <div class="dacte-lbl">CHAVE DE ACESSO</div>
      <div class="dacte-key-val">${fmtKey(d.chCTe)}</div>
    </div>

    <!-- HEADER: EMITENTE + TÍTULO DACTE -->
    <div class="dacte-header">
      <div class="dacte-emit-box">
        <div class="dacte-emit-nome">${esc(d.emit.nome || '-')}</div>
        <div class="dacte-emit-end">
          ${esc(formatCtePartyAddress(d.emit))}${d.emit.bairro ? ` - ${esc(d.emit.bairro)}` : ''}<br>
          ${esc(formatCtePartyCity(d.emit))} &nbsp;&bull;&nbsp; CEP: ${esc(fmtCep(d.emit.cep || ''))} &nbsp;&bull;&nbsp; Fone: ${esc(fmtFone(d.emit.fone || ''))}<br>
          CNPJ: ${esc(fmtCnpj(d.emit.doc || ''))} &nbsp;&bull;&nbsp; IE: ${esc(d.emit.ie || '')}
        </div>
      </div>
      <div class="dacte-title-box">
        <div class="dacte-subtitle">DOCUMENTO AUXILIAR DO</div>
        <div class="dacte-title">DACTE</div>
        <div class="dacte-subtitle">CONHECIMENTO DE TRANSPORTE ELETR&Ocirc;NICO</div>
        <div class="dacte-model">Modelo ${fmtCteModelo(d.modelo)}</div>
        <div class="dacte-num">N&ordm; ${fmtCteNumber(d.nCT)} &nbsp; S&eacute;rie ${fmtCteSerie(d.serie)}</div>
        <div style="font-size:8px; margin-top:2px;">Emiss&atilde;o: ${fmtDate(d.dhEmi)}</div>
      </div>
    </div>

    <!-- PROTOCOLO DE AUTORIZAÇÃO -->
    ${d.nProt ? `
    <div class="dacte-prot-box">
      <div><div class="dacte-prot-label">Protocolo de Autoriza&ccedil;&atilde;o de Uso</div><div class="dacte-prot-val">${esc(d.nProt)}</div></div>
      <div><div class="dacte-prot-label">Data/Hora Recebimento</div><div class="dacte-prot-val">${fmtDateTime(d.dhRecbto)}</div></div>
    </div>` : ''}

    <!-- PERCURSO -->
    <div class="dacte-section"><div class="dacte-section-header">Percurso</div><div class="dacte-section-body"><div class="dacte-percurso">
      <div class="dacte-percurso-item">
        <div class="dacte-percurso-mun">${esc(munOrigem || '-')}</div>
        <div class="dacte-percurso-uf">${esc(ufOrigem || '-')}</div>
        <div class="dacte-percurso-label">Origem</div>
      </div>
      <div class="dacte-percurso-arrow">&#8594;</div>
      <div class="dacte-percurso-item">
        <div class="dacte-percurso-mun">${esc(munDestino || '-')}</div>
        <div class="dacte-percurso-uf">${esc(ufDestino || '-')}</div>
        <div class="dacte-percurso-label">Destino</div>
      </div>
    </div></div></div>

    <!-- INFORMAÇÕES DO CT-e -->
    <div class="dacte-section"><div class="dacte-section-header">Informa&ccedil;&otilde;es do CT-e</div><div class="dacte-section-body">
      <div class="dacte-field full"><span class="dacte-lbl">Natureza da Opera&ccedil;&atilde;o</span><span class="dacte-val">${esc(d.natOp || '-')}</span></div>
      <div class="dacte-field" style="max-width:80px"><span class="dacte-lbl">CFOP</span><span class="dacte-val">${esc(d.cfop || '-')}</span></div>
      <div class="dacte-field"><span class="dacte-lbl">Tipo do CT-e</span><span class="dacte-val">${esc(d.tpCte || '-')}</span></div>
      <div class="dacte-field"><span class="dacte-lbl">Tipo de Servi&ccedil;o</span><span class="dacte-val">${esc(d.tpServico || '-')}</span></div>
      <div class="dacte-field"><span class="dacte-lbl">Modal</span><span class="dacte-val">${esc(d.modal || '-')}</span></div>
      <div class="dacte-field"><span class="dacte-lbl">Tomador do Servi&ccedil;o</span><span class="dacte-val">${esc(d.tomPapel || '-')}</span></div>
    </div></div>

    <!-- EMITENTE -->
    ${partySection('Emitente', d.emit)}

    <!-- REMETENTE -->
    ${partySection('Remetente', d.rem)}

    <!-- EXPEDIDOR -->
    ${partySection('Expedidor', d.exped)}

    <!-- RECEBEDOR -->
    ${partySection('Recebedor', d.receb)}

    <!-- DESTINATÁRIO -->
    ${partySection('Destinat&aacute;rio', d.dest)}

    <!-- TOMADOR DO SERVIÇO -->
    <div class="dacte-section"><div class="dacte-section-header">Tomador do Servi&ccedil;o</div><div class="dacte-section-body">
      <div class="dacte-field full"><span class="dacte-lbl">Raz&atilde;o Social / Nome</span><span class="dacte-val">${esc(d.tom.nome || '-')}</span></div>
      <div class="dacte-field"><span class="dacte-lbl">CNPJ/CPF</span><span class="dacte-val">${esc(fmtCnpj(d.tom.doc || ''))}</span></div>
      <div class="dacte-field"><span class="dacte-lbl">Inscri&ccedil;&atilde;o Estadual</span><span class="dacte-val">${esc(d.tom.ie || '')}</span></div>
      <div class="dacte-field"><span class="dacte-lbl">Fone</span><span class="dacte-val">${esc(fmtFone(d.tom.fone || ''))}</span></div>
      <div class="dacte-field full"><span class="dacte-lbl">Endere&ccedil;o</span><span class="dacte-val">${esc(formatCtePartyAddress(d.tom))}${d.tom.bairro ? ` - ${esc(d.tom.bairro)}` : ''}</span></div>
      <div class="dacte-field"><span class="dacte-lbl">Munic&iacute;pio</span><span class="dacte-val">${esc(formatCtePartyCity(d.tom))}</span></div>
      <div class="dacte-field" style="max-width:40px"><span class="dacte-lbl">UF</span><span class="dacte-val">${esc(d.tom.uf || '-')}</span></div>
      <div class="dacte-field"><span class="dacte-lbl">CEP</span><span class="dacte-val">${esc(fmtCep(d.tom.cep || ''))}</span></div>
    </div></div>

    <!-- VALORES DA PRESTAÇÃO -->
    <div class="dacte-section">
      <div class="dacte-section-header">Valores da Presta&ccedil;&atilde;o do Servi&ccedil;o</div>
      <table class="dacte-comps-table">
        <thead><tr><th>Componente</th><th class="right">Valor</th></tr></thead>
        <tbody>${compTableRows}</tbody>
      </table>
      <div class="dacte-comps-total">
        <span>VALOR TOTAL DA PRESTA&Ccedil;&Atilde;O</span>
        <span>R$ ${fmtNum(d.vTPrest || '0', 2)}</span>
      </div>
      <div class="dacte-comps-subtotal">
        <span>VALOR A RECEBER</span>
        <span>R$ ${fmtNum(d.vRec || d.vTPrest || '0', 2)}</span>
      </div>
    </div>

    <!-- IMPOSTOS -->
    <div class="dacte-section"><div class="dacte-section-header">C&aacute;lculo do Imposto</div><div class="dacte-section-body">
      <div class="dacte-field"><span class="dacte-lbl">CST</span><span class="dacte-val">${esc(d.cst || '-')}</span></div>
      <div class="dacte-field"><span class="dacte-lbl">Base de C&aacute;lculo do ICMS</span><span class="dacte-val">R$ ${fmtNum(d.vBC || '0', 2)}</span></div>
      <div class="dacte-field"><span class="dacte-lbl">Al&iacute;quota do ICMS (%)</span><span class="dacte-val">${fmtNum(d.pICMS || '0', 2)}%</span></div>
      <div class="dacte-field"><span class="dacte-lbl">Valor do ICMS</span><span class="dacte-val">R$ ${fmtNum(d.vICMS || '0', 2)}</span></div>
      <div class="dacte-field"><span class="dacte-lbl">Valor Total dos Tributos</span><span class="dacte-val">R$ ${fmtNum(d.vICMS || '0', 2)}</span></div>
    </div></div>

    <!-- INFORMAÇÕES DA CARGA -->
    <div class="dacte-section"><div class="dacte-section-header">Informa&ccedil;&otilde;es da Carga</div><div class="dacte-section-body">
      <div class="dacte-field full"><span class="dacte-lbl">Produto Predominante</span><span class="dacte-val">${esc(d.prodPred || '-')}</span></div>
      <div class="dacte-field"><span class="dacte-lbl">Valor da Carga</span><span class="dacte-val">R$ ${fmtNum(d.vCarga || '0', 2)}</span></div>
      <div class="dacte-field"><span class="dacte-lbl">Valor p/ Averba&ccedil;&atilde;o</span><span class="dacte-val">R$ ${fmtNum(d.vCarga || '0', 2)}</span></div>
      ${medidaRows}
    </div></div>

    <!-- DOCUMENTOS ORIGINÁRIOS -->
    <div class="dacte-section">
      <div class="dacte-section-header">Documentos Origin&aacute;rios (NF-e / NF)</div>
      <div class="dacte-section-body" style="flex-direction:column; padding:4px 8px;">
        ${docRefRows}
      </div>
    </div>

    <!-- MODAL RODOVIÁRIO -->
    <div class="dacte-section"><div class="dacte-section-header">Modal Rodovi&aacute;rio</div><div class="dacte-section-body">
      <div class="dacte-field"><span class="dacte-lbl">RNTRC</span><span class="dacte-val">${esc(d.rntrc || '-')}</span></div>
    </div></div>

    <!-- OBSERVAÇÕES -->
    <div class="dacte-obs-box">
      <div class="dacte-lbl">Observa&ccedil;&otilde;es / Dados do Produto</div>
      <div>${esc(obsText || '-')}</div>
    </div>

    <!-- RODAPÉ -->
    <div class="footer-line">
      <span>DATA E HORA DE IMPRESS&Atilde;O: ${now}</span>
      <span>QLMED - Sistema de Gest&atilde;o Fiscal</span>
    </div>

  </div>
  ${autoPrint ? '<script>window.addEventListener("load", function() { window.print(); });</script>' : ''}
</body>
</html>`;
}

// ==================== NFS-e ====================

interface NfsePartyData {
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

interface NfseData {
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

function emptyNfseParty(): NfsePartyData {
  return { nome: '', fantasia: '', doc: '', im: '', email: '', fone: '', endereco: '', bairro: '', municipio: '', uf: '', cep: '' };
}

function normalizeNfseParty(node: any, enderNode: any): NfsePartyData {
  return {
    nome: gv(node, 'xNome') || gv(node, 'RazaoSocial') || '',
    fantasia: gv(node, 'xFant') || gv(node, 'NomeFantasia') || '',
    doc: gv(node, 'CNPJ') || gv(node, 'CPF') || gv(node, 'CpfCnpj', 'Cnpj') || gv(node, 'Cnpj') || '',
    im: gv(node, 'IM') || gv(node, 'InscricaoMunicipal') || '',
    email: gv(node, 'email') || gv(node, 'Email') || '',
    fone: gv(enderNode, 'fone') || gv(node, 'Contato', 'Telefone') || '',
    endereco: [gv(enderNode, 'xLgr') || gv(enderNode, 'Endereco'), gv(enderNode, 'nro') || gv(enderNode, 'Numero')].filter(Boolean).join(', '),
    bairro: gv(enderNode, 'xBairro') || gv(enderNode, 'Bairro') || '',
    municipio: gv(enderNode, 'xMun') || '',
    uf: gv(enderNode, 'UF') || '',
    cep: gv(enderNode, 'CEP') || gv(enderNode, 'Cep') || '',
  };
}

// Map IBGE municipality codes to names (most common in MS + capitals)
function ibgeMunName(code: string): string {
  const map: Record<string, string> = {
    '5002704': 'CAMPO GRANDE', '5003702': 'DOURADOS', '5000203': 'AGUA CLARA',
    '5007109': 'TRES LAGOAS', '5003207': 'CORUMBA', '5005707': 'PONTA PORA',
    '3550308': 'SAO PAULO', '3304557': 'RIO DE JANEIRO', '3106200': 'BELO HORIZONTE',
    '5300108': 'BRASILIA', '4106902': 'CURITIBA', '4314902': 'PORTO ALEGRE',
    '2927408': 'SALVADOR', '2611606': 'RECIFE', '2304400': 'FORTALEZA',
    '1302603': 'MANAUS', '1501402': 'BELEM', '5208707': 'GOIANIA',
  };
  return map[code] || code;
}

function extractNfseData(parsed: any, invoice: PdfInvoiceView): NfseData {
  // ADN / Padrão Nacional
  const infNFSe = parsed?.NFSe?.infNFSe || parsed?.infNFSe;
  if (infNFSe) {
    const dps = infNFSe.DPS?.infDPS || {};
    const emitNode = infNFSe.emit || dps.prest || {};
    const tomaNode = dps.toma || {};
    const servNode = dps.serv || {};
    const cServNode = servNode.cServ || {};
    const valoresTop = infNFSe.valores || {};
    const valoresDps = dps.valores || {};
    const tribNode = valoresDps.trib || {};
    const tribMun = tribNode.tribMun || {};
    const vServPrest = valoresDps.vServPrest || {};
    const vDedRed = valoresDps.vDedRed || {};
    const regTrib = emitNode.regTrib || dps.prest?.regTrib || {};

    const emitEnder = emitNode.enderNac || {};
    const tomaEnder = tomaNode.end?.endNac || tomaNode.end || {};
    const tomaEnderFields = tomaNode.end || {};

    const emit = normalizeNfseParty(emitNode, emitEnder);
    if (!emit.municipio && gv(emitEnder, 'cMun')) emit.municipio = ibgeMunName(gv(emitEnder, 'cMun'));

    const toma = normalizeNfseParty(tomaNode, { ...tomaEnder, ...tomaEnderFields });
    if (!toma.municipio && gv(tomaEnder, 'cMun')) toma.municipio = ibgeMunName(gv(tomaEnder, 'cMun'));
    if (!toma.endereco) {
      toma.endereco = [gv(tomaEnderFields, 'xLgr'), gv(tomaEnderFields, 'nro')].filter(Boolean).join(', ');
      toma.bairro = gv(tomaEnderFields, 'xBairro') || toma.bairro;
    }

    return {
      nNFSe: gv(infNFSe, 'nNFSe') || gv(dps, 'nDPS') || invoice.number,
      serie: gv(dps, 'serie') || invoice.series || '',
      dhEmi: gv(dps, 'dhEmi') || gv(infNFSe, 'dhProc') || invoice.issueDate.toISOString(),
      dCompet: gv(dps, 'dCompet') || '',
      accessKey: invoice.accessKey,
      xLocEmi: gv(infNFSe, 'xLocEmi') || '',
      xLocPrestacao: gv(infNFSe, 'xLocPrestacao') || '',
      xTribNac: gv(infNFSe, 'xTribNac') || '',
      xTribMun: gv(infNFSe, 'xTribMun') || '',
      xNBS: gv(infNFSe, 'xNBS') || '',
      cTribNac: gv(cServNode, 'cTribNac') || '',
      cTribMun: gv(cServNode, 'cTribMun') || '',
      xDescServ: gv(cServNode, 'xDescServ') || '',
      emit: { ...emit, nome: emit.nome || invoice.senderName, doc: emit.doc || invoice.senderCnpj },
      toma: { ...toma, nome: toma.nome || invoice.recipientName, doc: toma.doc || invoice.recipientCnpj },
      vServ: gv(vServPrest, 'vServ') || String(invoice.totalValue || 0),
      vLiq: gv(valoresTop, 'vLiq') || gv(vServPrest, 'vLiq') || gv(vServPrest, 'vServ') || String(invoice.totalValue || 0),
      vCalcDR: gv(valoresTop, 'vCalcDR') || '',
      vDR: gv(vDedRed, 'vDR') || '',
      vBC: gv(valoresTop, 'vBC') || '',
      pAliq: gv(valoresTop, 'pAliqAplic') || gv(tribMun, 'pAliq') || '',
      vISSQN: gv(valoresTop, 'vISSQN') || '',
      vTotalRet: gv(valoresTop, 'vTotalRet') || '',
      cStat: gv(infNFSe, 'cStat') || '',
      nDFSe: gv(infNFSe, 'nDFSe') || '',
      opSimpNac: gv(regTrib, 'opSimpNac') || '',
      regEspTrib: gv(regTrib, 'regEspTrib') || '',
      tpRetISSQN: gv(tribMun, 'tpRetISSQN') || '',
    };
  }

  // ABRASF / Municipal
  const compNfse = parsed?.CompNfse || parsed?.ConsultarNfseResposta?.ListaNfse?.CompNfse;
  const nfse = compNfse?.Nfse?.InfNfse || parsed?.Nfse?.InfNfse || parsed?.InfNfse;
  if (nfse) {
    const servico = nfse.Servico || {};
    const valores = servico.Valores || {};
    const prestador = nfse.PrestadorServico || nfse.Prestador || {};
    const tomador = nfse.TomadorServico || nfse.Tomador || {};
    const idPrest = prestador.IdentificacaoPrestador || {};
    const idToma = tomador.IdentificacaoTomador || {};
    const enderPrest = prestador.Endereco || {};
    const enderToma = tomador.Endereco || {};

    const emit: NfsePartyData = {
      nome: gv(prestador, 'RazaoSocial') || gv(prestador, 'NomeFantasia') || invoice.senderName,
      fantasia: gv(prestador, 'NomeFantasia') || '',
      doc: gv(idPrest, 'CpfCnpj', 'Cnpj') || gv(idPrest, 'Cnpj') || invoice.senderCnpj,
      im: gv(idPrest, 'InscricaoMunicipal') || '',
      email: gv(prestador, 'Contato', 'Email') || '',
      fone: gv(prestador, 'Contato', 'Telefone') || '',
      endereco: [gv(enderPrest, 'Endereco'), gv(enderPrest, 'Numero')].filter(Boolean).join(', '),
      bairro: gv(enderPrest, 'Bairro') || '',
      municipio: gv(enderPrest, 'Cidade') || '',
      uf: gv(enderPrest, 'Estado') || gv(enderPrest, 'Uf') || '',
      cep: gv(enderPrest, 'Cep') || '',
    };
    const toma: NfsePartyData = {
      nome: gv(tomador, 'RazaoSocial') || gv(tomador, 'NomeFantasia') || invoice.recipientName,
      fantasia: '',
      doc: gv(idToma, 'CpfCnpj', 'Cnpj') || gv(idToma, 'Cnpj') || invoice.recipientCnpj,
      im: gv(idToma, 'InscricaoMunicipal') || '',
      email: gv(tomador, 'Contato', 'Email') || '',
      fone: gv(tomador, 'Contato', 'Telefone') || '',
      endereco: [gv(enderToma, 'Endereco'), gv(enderToma, 'Numero')].filter(Boolean).join(', '),
      bairro: gv(enderToma, 'Bairro') || '',
      municipio: gv(enderToma, 'Cidade') || '',
      uf: gv(enderToma, 'Estado') || gv(enderToma, 'Uf') || '',
      cep: gv(enderToma, 'Cep') || '',
    };

    return {
      nNFSe: gv(nfse, 'Numero') || invoice.number,
      serie: '',
      dhEmi: gv(nfse, 'DataEmissao') || invoice.issueDate.toISOString(),
      dCompet: gv(nfse, 'Competencia') || '',
      accessKey: invoice.accessKey,
      xLocEmi: '',
      xLocPrestacao: gv(servico, 'MunicipioIncidencia') || '',
      xTribNac: gv(servico, 'Discriminacao') || '',
      xTribMun: '',
      xNBS: '',
      cTribNac: gv(servico, 'ItemListaServico') || gv(servico, 'CodigoTributacaoMunicipio') || '',
      cTribMun: gv(servico, 'CodigoTributacaoMunicipio') || '',
      xDescServ: gv(servico, 'Discriminacao') || '',
      emit,
      toma,
      vServ: gv(valores, 'ValorServicos') || String(invoice.totalValue || 0),
      vLiq: gv(valores, 'ValorLiquidoNfse') || gv(valores, 'ValorServicos') || String(invoice.totalValue || 0),
      vCalcDR: '',
      vDR: gv(valores, 'ValorDeducoes') || '',
      vBC: gv(valores, 'BaseCalculo') || '',
      pAliq: gv(valores, 'Aliquota') || '',
      vISSQN: gv(valores, 'ValorIss') || '',
      vTotalRet: gv(valores, 'ValorIssRetido') || '',
      cStat: '',
      nDFSe: gv(nfse, 'CodigoVerificacao') || '',
      opSimpNac: '',
      regEspTrib: '',
      tpRetISSQN: '',
    };
  }

  // Fallback from invoice metadata only
  const emit = emptyNfseParty();
  emit.nome = invoice.senderName;
  emit.doc = invoice.senderCnpj;
  const toma = emptyNfseParty();
  toma.nome = invoice.recipientName;
  toma.doc = invoice.recipientCnpj;
  return {
    nNFSe: invoice.number, serie: invoice.series || '', dhEmi: invoice.issueDate.toISOString(),
    dCompet: '', accessKey: invoice.accessKey, xLocEmi: '', xLocPrestacao: '',
    xTribNac: '', xTribMun: '', xNBS: '', cTribNac: '', cTribMun: '', xDescServ: '',
    emit, toma, vServ: String(invoice.totalValue || 0), vLiq: String(invoice.totalValue || 0),
    vCalcDR: '', vDR: '', vBC: '', pAliq: '', vISSQN: '', vTotalRet: '',
    cStat: '', nDFSe: '', opSimpNac: '', regEspTrib: '', tpRetISSQN: '',
  };
}

function buildNfseHtml(d: NfseData, autoPrint: boolean): string {
  const now = new Date().toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  const title = `NFS-e ${d.nNFSe}`;

  const retLabel: Record<string, string> = {
    '1': 'ISS Retido pelo Tomador',
    '2': 'ISS Retido pelo Intermediário',
    '0': 'Sem retenção',
  };
  const simpNacLabel: Record<string, string> = {
    '1': 'Não optante',
    '2': 'Optante - Microempresa',
    '3': 'Optante - Empresa de Pequeno Porte',
  };

  const partySection = (label: string, party: NfsePartyData) => `
    <div class="nfse-section"><div class="nfse-section-header">${esc(label)}</div><div class="nfse-section-body">
      <div class="nfse-field full"><span class="nfse-lbl">Razão Social</span><span class="nfse-val">${esc(party.nome || '-')}</span></div>
      ${party.fantasia ? `<div class="nfse-field full"><span class="nfse-lbl">Nome Fantasia</span><span class="nfse-val">${esc(party.fantasia)}</span></div>` : ''}
      <div class="nfse-field"><span class="nfse-lbl">CNPJ/CPF</span><span class="nfse-val">${esc(fmtCnpj(party.doc || ''))}</span></div>
      ${party.im ? `<div class="nfse-field"><span class="nfse-lbl">Inscrição Municipal</span><span class="nfse-val">${esc(party.im)}</span></div>` : ''}
      ${party.email ? `<div class="nfse-field"><span class="nfse-lbl">E-mail</span><span class="nfse-val">${esc(party.email)}</span></div>` : ''}
      ${party.fone ? `<div class="nfse-field"><span class="nfse-lbl">Telefone</span><span class="nfse-val">${esc(fmtFone(party.fone))}</span></div>` : ''}
      ${party.endereco ? `<div class="nfse-field full"><span class="nfse-lbl">Endereço</span><span class="nfse-val">${esc(party.endereco)}${party.bairro ? ` - ${esc(party.bairro)}` : ''}</span></div>` : ''}
      ${party.municipio || party.uf ? `
      <div class="nfse-field"><span class="nfse-lbl">Município</span><span class="nfse-val">${esc(party.municipio || '-')}</span></div>
      <div class="nfse-field" style="max-width:40px"><span class="nfse-lbl">UF</span><span class="nfse-val">${esc(party.uf || '-')}</span></div>
      ${party.cep ? `<div class="nfse-field"><span class="nfse-lbl">CEP</span><span class="nfse-val">${esc(fmtCep(party.cep))}</span></div>` : ''}` : ''}
    </div></div>`;

  const NFSE_CSS = `
    .nfse-header { display:grid; grid-template-columns:1fr auto; gap:0; border:1px solid #000; margin-bottom:4px; }
    .nfse-emit-box { padding:6px 8px; border-right:1px solid #000; }
    .nfse-emit-nome { font-size:13px; font-weight:bold; margin-bottom:2px; }
    .nfse-emit-end { font-size:8px; color:#333; line-height:1.4; }
    .nfse-title-box { display:flex; flex-direction:column; align-items:center; justify-content:center; padding:6px 14px; min-width:170px; text-align:center; }
    .nfse-title { font-size:14px; font-weight:900; letter-spacing:2px; }
    .nfse-subtitle { font-size:7px; font-weight:bold; margin-bottom:4px; }
    .nfse-num { font-size:12px; font-weight:bold; margin-top:4px; }
    .nfse-section { border:1px solid #000; margin-bottom:3px; }
    .nfse-section-header { background:#eee; font-size:7px; font-weight:bold; text-transform:uppercase; padding:1px 4px; border-bottom:1px solid #000; letter-spacing:.5px; }
    .nfse-section-body { display:flex; flex-wrap:wrap; padding:2px; gap:0; }
    .nfse-field { display:flex; flex-direction:column; padding:1px 4px; min-width:80px; flex:1; }
    .nfse-field.full { flex:0 0 100%; width:100%; }
    .nfse-lbl { font-size:6px; color:#555; text-transform:uppercase; font-weight:bold; }
    .nfse-val { font-size:9px; }
    .nfse-key-box { border:1px solid #000; padding:4px 6px; margin-bottom:3px; }
    .nfse-key-box .nfse-lbl { font-size:6.5px; font-weight:bold; text-transform:uppercase; color:#555; margin-bottom:1px; }
    .nfse-key-val { font-family:monospace; font-size:9px; letter-spacing:.3px; font-weight:bold; }
    .nfse-status-box { display:flex; justify-content:space-between; align-items:center; border:1px solid #000; padding:4px 8px; margin-bottom:3px; background:#f9f9f9; }
    .nfse-status-label { font-size:7px; color:#555; text-transform:uppercase; }
    .nfse-status-val { font-size:9px; font-weight:bold; }
    .nfse-desc-box { border:1px solid #000; padding:4px 6px; margin-bottom:3px; font-size:8px; line-height:1.4; }
    .nfse-desc-box .nfse-lbl { font-size:6.5px; font-weight:bold; text-transform:uppercase; color:#555; margin-bottom:2px; }
    .nfse-valor-destaque { display:flex; justify-content:space-between; padding:4px 8px; border-top:2px solid #000; font-weight:bold; font-size:10px; }
    .nfse-valor-sub { display:flex; justify-content:space-between; padding:3px 8px; border-top:1px solid #ccc; font-size:8px; }
    .right { text-align:right; }
  `;

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${esc(title)}</title>
  <style>
    ${CSS}
    ${NFSE_CSS}
    @media print {
      body { margin:0; }
      .page { margin:0; padding:4mm; box-shadow:none; }
    }
  </style>
</head>
<body>
  <div class="page">

    <!-- CHAVE DE ACESSO / IDENTIFICAÇÃO -->
    <div class="nfse-key-box">
      <div class="nfse-lbl">Identificação da NFS-e</div>
      <div class="nfse-key-val">${esc(d.accessKey)}</div>
    </div>

    <!-- HEADER: PRESTADOR + TÍTULO -->
    <div class="nfse-header">
      <div class="nfse-emit-box">
        <div class="nfse-emit-nome">${esc(d.emit.nome || '-')}</div>
        <div class="nfse-emit-end">
          ${d.emit.endereco ? `${esc(d.emit.endereco)}${d.emit.bairro ? ` - ${esc(d.emit.bairro)}` : ''}<br>` : ''}
          ${d.emit.municipio || d.emit.uf ? `${esc(d.emit.municipio)}/${esc(d.emit.uf)}` : ''}${d.emit.cep ? ` &nbsp;&bull;&nbsp; CEP: ${esc(fmtCep(d.emit.cep))}` : ''}<br>
          CNPJ: ${esc(fmtCnpj(d.emit.doc || ''))}${d.emit.im ? ` &nbsp;&bull;&nbsp; IM: ${esc(d.emit.im)}` : ''}
          ${d.emit.email ? `<br>E-mail: ${esc(d.emit.email)}` : ''}
        </div>
      </div>
      <div class="nfse-title-box">
        <div class="nfse-subtitle">NOTA FISCAL DE</div>
        <div class="nfse-title">SERVIÇO</div>
        <div class="nfse-subtitle">ELETR&Ocirc;NICA - NFS-e</div>
        <div class="nfse-num">N&ordm; ${esc(d.nNFSe)}</div>
        ${d.serie ? `<div style="font-size:8px;">S&eacute;rie ${esc(d.serie)}</div>` : ''}
        <div style="font-size:8px; margin-top:2px;">Emiss&atilde;o: ${fmtDate(d.dhEmi)}</div>
      </div>
    </div>

    <!-- STATUS / COMPETÊNCIA -->
    <div class="nfse-status-box">
      ${d.dCompet ? `<div><div class="nfse-status-label">Compet&ecirc;ncia</div><div class="nfse-status-val">${fmtDate(d.dCompet)}</div></div>` : ''}
      ${d.xLocPrestacao ? `<div><div class="nfse-status-label">Local da Presta&ccedil;&atilde;o</div><div class="nfse-status-val">${esc(d.xLocPrestacao)}</div></div>` : ''}
      ${d.nDFSe ? `<div><div class="nfse-status-label">N&ordm; DFS-e</div><div class="nfse-status-val">${esc(d.nDFSe)}</div></div>` : ''}
    </div>

    <!-- PRESTADOR -->
    ${partySection('Prestador de Servi&ccedil;os', d.emit)}

    <!-- TOMADOR -->
    ${partySection('Tomador de Servi&ccedil;os', d.toma)}

    <!-- CLASSIFICAÇÃO DO SERVIÇO -->
    <div class="nfse-section"><div class="nfse-section-header">Servi&ccedil;o</div><div class="nfse-section-body">
      ${d.cTribNac ? `<div class="nfse-field"><span class="nfse-lbl">C&oacute;digo Tributa&ccedil;&atilde;o Nacional</span><span class="nfse-val">${esc(d.cTribNac)}</span></div>` : ''}
      ${d.cTribMun ? `<div class="nfse-field"><span class="nfse-lbl">C&oacute;digo Tributa&ccedil;&atilde;o Municipal</span><span class="nfse-val">${esc(d.cTribMun)}</span></div>` : ''}
      ${d.xNBS ? `<div class="nfse-field"><span class="nfse-lbl">NBS</span><span class="nfse-val">${esc(d.xNBS)}</span></div>` : ''}
      ${d.xTribNac ? `<div class="nfse-field full"><span class="nfse-lbl">Descri&ccedil;&atilde;o Nacional</span><span class="nfse-val">${esc(d.xTribNac)}</span></div>` : ''}
      ${d.xTribMun ? `<div class="nfse-field full"><span class="nfse-lbl">Descri&ccedil;&atilde;o Municipal</span><span class="nfse-val">${esc(d.xTribMun)}</span></div>` : ''}
    </div></div>

    <!-- DESCRIÇÃO DO SERVIÇO -->
    ${d.xDescServ ? `
    <div class="nfse-desc-box">
      <div class="nfse-lbl">Discrimina&ccedil;&atilde;o do Servi&ccedil;o</div>
      <div style="white-space:pre-wrap;">${esc(d.xDescServ)}</div>
    </div>` : ''}

    <!-- VALORES -->
    <div class="nfse-section">
      <div class="nfse-section-header">Valores</div>
      <div class="nfse-valor-destaque">
        <span>VALOR L&Iacute;QUIDO DA NFS-e</span>
        <span>R$ ${fmtNum(d.vLiq || '0', 2)}</span>
      </div>
      <div class="nfse-valor-sub">
        <span>Valor Bruto dos Servi&ccedil;os</span>
        <span>R$ ${fmtNum(d.vServ || '0', 2)}</span>
      </div>
      ${d.vDR ? `<div class="nfse-valor-sub"><span>Dedu&ccedil;&otilde;es / Redu&ccedil;&otilde;es</span><span>R$ ${fmtNum(d.vDR, 2)}</span></div>` : ''}
      ${d.vCalcDR ? `<div class="nfse-valor-sub"><span>Base Dedu&ccedil;&atilde;o/Redu&ccedil;&atilde;o</span><span>R$ ${fmtNum(d.vCalcDR, 2)}</span></div>` : ''}
    </div>

    <!-- TRIBUTOS -->
    <div class="nfse-section"><div class="nfse-section-header">Tributos</div><div class="nfse-section-body">
      ${d.vBC ? `<div class="nfse-field"><span class="nfse-lbl">Base de C&aacute;lculo</span><span class="nfse-val">R$ ${fmtNum(d.vBC, 2)}</span></div>` : ''}
      ${d.pAliq ? `<div class="nfse-field"><span class="nfse-lbl">Al&iacute;quota ISS</span><span class="nfse-val">${fmtNum(d.pAliq, 2)}%</span></div>` : ''}
      ${d.vISSQN ? `<div class="nfse-field"><span class="nfse-lbl">Valor ISSQN</span><span class="nfse-val">R$ ${fmtNum(d.vISSQN, 2)}</span></div>` : ''}
      ${d.vTotalRet ? `<div class="nfse-field"><span class="nfse-lbl">Valor Retido</span><span class="nfse-val">R$ ${fmtNum(d.vTotalRet, 2)}</span></div>` : ''}
      ${d.tpRetISSQN ? `<div class="nfse-field full"><span class="nfse-lbl">Tipo de Reten&ccedil;&atilde;o</span><span class="nfse-val">${esc(retLabel[d.tpRetISSQN] || d.tpRetISSQN)}</span></div>` : ''}
      ${d.opSimpNac ? `<div class="nfse-field full"><span class="nfse-lbl">Simples Nacional</span><span class="nfse-val">${esc(simpNacLabel[d.opSimpNac] || d.opSimpNac)}</span></div>` : ''}
    </div></div>

    <!-- RODAPÉ -->
    <div class="footer-line">
      <span>DATA E HORA DE IMPRESS&Atilde;O: ${now}</span>
      <span>QLMED - Sistema de Gest&atilde;o Fiscal</span>
    </div>

  </div>
  ${autoPrint ? '<script>window.addEventListener("load", function() { window.print(); });</script>' : ''}
</body>
</html>`;
}

// ==================== Fallback for non-NFe ====================

function buildFallbackHtml(invoice: PdfInvoiceView, autoPrint: boolean): string {
  const typeLabel: Record<string, string> = { NFE: 'NF-e', CTE: 'CT-e', NFSE: 'NFS-e' };
  const tl = typeLabel[invoice.type] || invoice.type;
  const now = new Date().toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const title = invoice.type === 'CTE' ? getPdfFilename(invoice) : `${tl} ${invoice.number}`;

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <title>${title}</title>
  <style>
    ${CSS}
    .simple-header { background: #333; color: #fff; padding: 15px 20px; }
    .simple-header h1 { font-size: 16px; margin-bottom: 4px; }
    .simple-header p { font-size: 10px; opacity: .8; }
    .simple-body { padding: 15px 20px; }
    .simple-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom: 15px; }
    .simple-card { border: 1px solid #ccc; border-radius: 4px; padding: 10px; }
    .simple-card h3 { font-size: 8px; text-transform: uppercase; color: #666; margin-bottom: 6px; font-weight: bold; }
    .simple-card .name { font-size: 12px; font-weight: bold; }
    .simple-card .cnpj { font-size: 10px; color: #555; font-family: monospace; }
    .simple-total { text-align: center; background: #f5f5f5; border: 1px solid #ccc; border-radius: 4px; padding: 12px; margin-bottom: 15px; }
    .simple-total .label { font-size: 9px; text-transform: uppercase; color: #666; }
    .simple-total .value { font-size: 24px; font-weight: bold; }
    .simple-key { border: 1px solid #ccc; border-radius: 4px; padding: 10px; margin-bottom: 15px; }
    .simple-key h3 { font-size: 8px; text-transform: uppercase; color: #666; margin-bottom: 4px; font-weight: bold; }
    .simple-key .val { font-family: monospace; font-size: 10px; word-break: break-all; letter-spacing: .5px; }
  </style>
</head>
<body>
  <div class="page">
    <div class="simple-header">
      <h1>${esc(invoice.company.razaoSocial)}</h1>
      <p>CNPJ: ${fmtCnpj(invoice.company.cnpj)} &mdash; ${tl} N&ordm; ${esc(invoice.number)} / S&eacute;rie ${esc(invoice.series || '1')}</p>
    </div>
    <div class="simple-body">
      <div class="simple-grid">
        <div class="simple-card">
          <h3>Emitente</h3>
          <div class="name">${esc(invoice.senderName)}</div>
          <div class="cnpj">CNPJ: ${fmtCnpj(invoice.senderCnpj)}</div>
        </div>
        <div class="simple-card">
          <h3>Destinat&aacute;rio</h3>
          <div class="name">${esc(invoice.recipientName)}</div>
          <div class="cnpj">CNPJ: ${fmtCnpj(invoice.recipientCnpj)}</div>
        </div>
      </div>
      <div class="simple-total">
        <div class="label">Valor Total</div>
        <div class="value">${fmtCurrency(invoice.totalValue)}</div>
      </div>
      <div class="simple-key">
        <h3>Chave de Acesso</h3>
        <div class="val">${fmtKey(invoice.accessKey)}</div>
      </div>
      <div style="text-align:center; font-size:10px; color:#888; margin-top:20px;">
        Emiss&atilde;o: ${fmtDate(invoice.issueDate.toISOString())}
      </div>
    </div>
    <div class="footer-line" style="padding: 10px 20px;">
      <span>DATA E HORA DA IMPRESS&Atilde;O:${now}</span>
      <span>QLMED - Sistema de Gest&atilde;o Fiscal</span>
    </div>
  </div>
  ${autoPrint ? '<script>window.addEventListener("load", function() { window.print(); });</script>' : ''}
</body>
</html>`;
}

// ==================== Route Handler ====================

export async function GET(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    let userId: string;
    try {
      userId = await requireAuth();
    } catch {
      return unauthorizedResponse();
    }
    const company = await getOrCreateSingleCompany(userId);

    const invoice = await prisma.invoice.findFirst({
      where: { id: params.id, companyId: company.id },
      include: { company: { select: { razaoSocial: true, cnpj: true } } },
    });

    if (!invoice) {
      return new Response('Nota fiscal n\u00e3o encontrada.', { status: 404 });
    }

    const url = new URL(req.url);
    const autoPrint = url.searchParams.get('print') === 'true';
    const download = url.searchParams.get('download') === 'true';

    let html: string;

    try {
      if (invoice.xmlContent && invoice.type === 'NFE') {
        const parsed = await parseXml(invoice.xmlContent);
        const data = extractDanfeData(parsed);
        html = buildDanfeHtml(data, autoPrint);
      } else if (invoice.xmlContent && invoice.type === 'CTE') {
        const parsed = await parseXml(invoice.xmlContent);
        const data = extractCteData(parsed, invoice as PdfInvoiceView);
        html = buildCteHtml(data, autoPrint);
      } else if (invoice.type === 'CTE') {
        const data = buildCteDataFromInvoice(invoice as PdfInvoiceView);
        html = buildCteHtml(data, autoPrint);
      } else if (invoice.xmlContent && invoice.type === 'NFSE') {
        const parsed = await parseXml(invoice.xmlContent);
        const data = extractNfseData(parsed, invoice as PdfInvoiceView);
        html = buildNfseHtml(data, autoPrint);
      } else if (invoice.type === 'NFSE') {
        const data = extractNfseData({}, invoice as PdfInvoiceView);
        html = buildNfseHtml(data, autoPrint);
      } else {
        html = buildFallbackHtml(invoice as PdfInvoiceView, autoPrint);
      }
    } catch (parseErr) {
      console.error('[PDF] XML parse error, using fallback:', parseErr);
      if (invoice.type === 'CTE') {
        const data = buildCteDataFromInvoice(invoice as PdfInvoiceView);
        html = buildCteHtml(data, autoPrint);
      } else if (invoice.type === 'NFSE') {
        const data = extractNfseData({}, invoice as PdfInvoiceView);
        html = buildNfseHtml(data, autoPrint);
      } else {
        html = buildFallbackHtml(invoice as PdfInvoiceView, autoPrint);
      }
    }

    if (download) {
      const filename = getPdfFilename(invoice as PdfInvoiceView);
      const fallbackFilename = filename.replace(/[\\/]/g, '_');
      const encodedFilename = encodeURIComponent(filename);

      const browser = await puppeteer.launch({
        headless: true,
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu', '--disable-dev-shm-usage'],
      });
      try {
        const page = await browser.newPage();
        await page.setContent(html, { waitUntil: 'load' });
        const pdfBuffer = await page.pdf({
          format: 'A4',
          printBackground: true,
          margin: { top: '5mm', right: '5mm', bottom: '5mm', left: '5mm' },
        });

        return new Response(Buffer.from(pdfBuffer), {
          headers: {
            'Content-Type': 'application/pdf',
            'Content-Disposition': `attachment; filename="${fallbackFilename}"; filename*=UTF-8''${encodedFilename}`,
            'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
            Pragma: 'no-cache',
            Expires: '0',
          },
        });
      } finally {
        await browser.close();
      }
    }

    return new Response(html, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
        Pragma: 'no-cache',
        Expires: '0',
      },
    });
  } catch (error) {
    console.error('[PDF] Internal error:', error);
    return new Response('Erro interno ao gerar documento.', { status: 500 });
  }
}
