import { gv } from '@/lib/xml-helpers';
import { ensureArray } from '@/lib/utils';
import type { XmlNode } from '@/types/xml-common';
import type { CTeInfCte } from '@/types/cte-xml';
import type { CteData, CteDocRef, CtePartyData, CteCargaMedida, PdfInvoiceView, Party } from './pdf-types';
import { esc, fmtCnpj, fmtCep, fmtFone, fmtNum, fmtKey, fmtDate, fmtDateTime, hasParty, getParty } from './pdf-utils';
import { PDF_CSS } from './pdf-css';

// ==================== CT-e Helpers ====================

function getCteModalLabel(modalCode: string): string {
  const modalMap: Record<string, string> = {
    '01': 'Rodoviario',
    '02': 'Aereo',
    '03': 'Aquaviario',
    '04': 'Ferroviario',
    '05': 'Dutoviario',
    '06': 'Multimodal',
  };
  return modalMap[modalCode] || modalCode || '-';
}

function getCteTpServLabel(tpServCode: string): string {
  const serviceMap: Record<string, string> = {
    '0': 'Normal',
    '1': 'Subcontratacao',
    '2': 'Redespacho',
    '3': 'Redespacho Intermediario',
    '4': 'Servico Vinculado a Multimodal',
  };
  return serviceMap[tpServCode] || tpServCode || '-';
}

function parseCteTomador(infCte: CTeInfCte): { party: Party; papel: string } {
  const rem = getParty(infCte?.rem || {});
  const exped = getParty(infCte?.exped || {});
  const receb = getParty(infCte?.receb || {});
  const dest = getParty(infCte?.dest || {});

  const toma4 = infCte?.ide?.toma4 || infCte?.toma4 || infCte?.infCteNorm?.toma4 || {};
  const explicitTomador = getParty((toma4 as XmlNode)?.toma || toma4 || infCte?.ide?.toma || infCte?.toma || {});
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
    '3': { party: dest, papel: 'Destinatario' },
  };

  if (tpTomRaw in codeMap && hasParty(codeMap[tpTomRaw].party)) {
    return codeMap[tpTomRaw];
  }

  if (tpTomRaw === '4' && hasParty(explicitTomador)) {
    return { party: explicitTomador, papel: 'Outros' };
  }

  if (hasParty(explicitTomador)) return { party: explicitTomador, papel: 'Tomador' };
  if (hasParty(dest)) return { party: dest, papel: 'Destinatario' };
  if (hasParty(rem)) return { party: rem, papel: 'Remetente' };
  if (hasParty(receb)) return { party: receb, papel: 'Recebedor' };
  if (hasParty(exped)) return { party: exped, papel: 'Expedidor' };

  return { party: { nome: '', cnpj: '' }, papel: 'Tomador' };
}

function getCteTypeLabel(tpCteCode: string): string {
  const map: Record<string, string> = {
    '0': 'Normal',
    '1': 'Complementar',
    '2': 'Anulacao',
    '3': 'Substituto',
  };
  return map[tpCteCode] || tpCteCode || '-';
}

function getGlobalizadoLabel(raw: string): string {
  const normalized = String(raw || '').trim();
  if (normalized === '1' || normalized.toLowerCase() === 'sim') return 'Sim';
  if (normalized === '0' || normalized.toLowerCase() === 'nao' || normalized.toLowerCase() === 'nao') return 'Nao';
  return normalized || 'Nao';
}

function normalizeCteParty(node: XmlNode, ender: XmlNode): CtePartyData {
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

// ==================== Data Extraction ====================

export function extractCteData(parsed: XmlNode, invoice: PdfInvoiceView): CteData {
  const cteProc = (parsed.cteProc || parsed) as XmlNode;
  const cteNode = (cteProc?.CTe || parsed?.CTe || cteProc) as XmlNode;
  const infCte = (cteNode?.infCte || cteNode || {}) as XmlNode;
  const ide = (infCte?.ide || {}) as XmlNode;
  const emitNode = (infCte?.emit || {}) as XmlNode;
  const remNode = (infCte?.rem || {}) as XmlNode;
  const expedNode = (infCte?.exped || {}) as XmlNode;
  const recebNode = (infCte?.receb || {}) as XmlNode;
  const destNode = (infCte?.dest || {}) as XmlNode;
  const emit = normalizeCteParty(emitNode, (emitNode?.enderEmit || {}) as XmlNode);
  const rem = normalizeCteParty(remNode, (remNode?.enderReme || {}) as XmlNode);
  const exped = normalizeCteParty(expedNode, (expedNode?.enderExped || {}) as XmlNode);
  const receb = normalizeCteParty(recebNode, (recebNode?.enderReceb || {}) as XmlNode);
  const dest = normalizeCteParty(destNode, (destNode?.enderDest || {}) as XmlNode);

  const vPrest = (infCte?.vPrest || {}) as XmlNode;
  const prot = ((cteProc?.protCTe as XmlNode)?.infProt || {}) as XmlNode;
  const compl = (infCte?.compl || {}) as XmlNode;
  const infCteNorm = (infCte?.infCTeNorm || infCte?.infCteNorm || {}) as XmlNode;
  const infCarga = (infCteNorm?.infCarga || {}) as XmlNode;
  const imp = (infCte?.imp || {}) as XmlNode;
  const icms = (imp?.ICMS || {}) as XmlNode;

  const icmsKey = Object.keys(icms).find((key) => key.startsWith('ICMS')) || '';
  const icmsNode = (icmsKey ? icms[icmsKey] : {}) as XmlNode;

  const obsContArray = ensureArray<XmlNode>(compl?.ObsCont as XmlNode | XmlNode[]).map((node) => ({
    campo: gv(node, '$', 'xCampo') || gv(node, 'xCampo'),
    texto: gv(node, 'xTexto') || gv(node, '_'),
  })).filter((item) => item.campo || item.texto);

  const obsText = [gv(compl, 'xObs'), ...obsContArray.map((item) => `${item.campo}: ${item.texto}`)]
    .filter((value) => value && String(value).trim().length > 0)
    .join('\n');

  const idAttr = gv(infCte, '$', 'Id');
  const idKey = idAttr ? idAttr.replace(/^CTe/, '') : '';
  const tomadorBase = parseCteTomador(infCte as unknown as CTeInfCte);
  const toma4 = (ide?.toma4 || infCte?.toma4 || (infCte?.infCteNorm as XmlNode)?.toma4 || {}) as XmlNode;
  const toma3Raw = ide?.toma3 as XmlNode | string | undefined;
  const toma03Raw = ide?.toma03 as XmlNode | string | undefined;
  const toma3Code = typeof toma3Raw === 'object' ? ((toma3Raw as XmlNode)?.toma ?? '') : toma3Raw;
  const toma03Code = typeof toma03Raw === 'object' ? ((toma03Raw as XmlNode)?.toma ?? '') : toma03Raw;
  const tpTomRaw = String(gv(toma4, 'tpTom') || toma03Code || toma3Code || gv(ide, 'tpTom') || '').trim();
  const toma4Node = (toma4?.toma || {}) as XmlNode;

  let tomNode: XmlNode = {};
  let tomEnder: XmlNode = {};
  let tomPapel = tomadorBase.papel || 'Tomador';
  if (tpTomRaw === '0') {
    tomNode = remNode;
    tomEnder = (remNode?.enderReme || {}) as XmlNode;
    tomPapel = 'Remetente';
  } else if (tpTomRaw === '1') {
    tomNode = expedNode;
    tomEnder = (expedNode?.enderExped || {}) as XmlNode;
    tomPapel = 'Expedidor';
  } else if (tpTomRaw === '2') {
    tomNode = recebNode;
    tomEnder = (recebNode?.enderReceb || {}) as XmlNode;
    tomPapel = 'Recebedor';
  } else if (tpTomRaw === '3') {
    tomNode = destNode;
    tomEnder = (destNode?.enderDest || {}) as XmlNode;
    tomPapel = 'Destinatario';
  } else if (tpTomRaw === '4') {
    tomNode = toma4Node;
    tomEnder = (toma4Node?.enderToma || toma4?.enderToma || {}) as XmlNode;
    tomPapel = 'Outros';
  }

  let tom = normalizeCteParty(tomNode, tomEnder);
  if (!tom.nome && tomadorBase.party.nome) tom.nome = tomadorBase.party.nome;
  if (!tom.doc && tomadorBase.party.cnpj) tom.doc = tomadorBase.party.cnpj;
  if (!tom.nome) tom.nome = invoice.recipientName || '-';
  if (!tom.doc) tom.doc = invoice.recipientCnpj || '';

  const compArray = ensureArray<XmlNode>(vPrest?.Comp as XmlNode | XmlNode[]).map((item) => ({
    nome: gv(item, 'xNome'),
    valor: gv(item, 'vComp'),
  })).filter((item) => item.nome || item.valor);

  const medArray = ensureArray<XmlNode>(infCarga?.infQ as XmlNode | XmlNode[]).map((item) => ({
    tipo: gv(item, 'tpMed'),
    quantidade: gv(item, 'qCarga'),
    unidade: gv(item, 'cUnid'),
  })).filter((item) => item.tipo || item.quantidade);

  const docRefs: CteDocRef[] = [];
  const infNFeList = ensureArray<XmlNode>((infCteNorm?.infDoc as XmlNode)?.infNFe as XmlNode | XmlNode[]);
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
  const infCteList = ensureArray<XmlNode>((infCteNorm?.infDoc as XmlNode)?.infCTe as XmlNode | XmlNode[]);
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

export function buildCteDataFromInvoice(invoice: PdfInvoiceView): CteData {
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
    indGlobalizado: 'Nao',
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

// ==================== HTML Builder ====================

export function buildCteHtml(d: CteData, autoPrint: boolean): string {
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
      <div class="dacte-field full"><span class="dacte-lbl">Razao Social / Nome</span><span class="dacte-val">${esc(party.nome || '-')}</span></div>
      <div class="dacte-field"><span class="dacte-lbl">CNPJ/CPF</span><span class="dacte-val">${esc(fmtCnpj(party.doc || ''))}</span></div>
      <div class="dacte-field"><span class="dacte-lbl">Inscricao Estadual</span><span class="dacte-val">${esc(party.ie || '')}</span></div>
      <div class="dacte-field"><span class="dacte-lbl">Fone</span><span class="dacte-val">${esc(fmtFone(party.fone || ''))}</span></div>
      <div class="dacte-field full"><span class="dacte-lbl">Endereco</span><span class="dacte-val">${esc(formatCtePartyAddress(party))}${party.bairro ? ` - ${esc(party.bairro)}` : ''}</span></div>
      <div class="dacte-field"><span class="dacte-lbl">Municipio</span><span class="dacte-val">${esc(party.municipio || '-')}</span></div>
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
    ${PDF_CSS}
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

    <!-- HEADER: EMITENTE + TITULO DACTE -->
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

    <!-- PROTOCOLO DE AUTORIZACAO -->
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

    <!-- INFORMACOES DO CT-e -->
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

    <!-- DESTINATARIO -->
    ${partySection('Destinat&aacute;rio', d.dest)}

    <!-- TOMADOR DO SERVICO -->
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

    <!-- VALORES DA PRESTACAO -->
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

    <!-- INFORMACOES DA CARGA -->
    <div class="dacte-section"><div class="dacte-section-header">Informa&ccedil;&otilde;es da Carga</div><div class="dacte-section-body">
      <div class="dacte-field full"><span class="dacte-lbl">Produto Predominante</span><span class="dacte-val">${esc(d.prodPred || '-')}</span></div>
      <div class="dacte-field"><span class="dacte-lbl">Valor da Carga</span><span class="dacte-val">R$ ${fmtNum(d.vCarga || '0', 2)}</span></div>
      <div class="dacte-field"><span class="dacte-lbl">Valor p/ Averba&ccedil;&atilde;o</span><span class="dacte-val">R$ ${fmtNum(d.vCarga || '0', 2)}</span></div>
      ${medidaRows}
    </div></div>

    <!-- DOCUMENTOS ORIGINARIOS -->
    <div class="dacte-section">
      <div class="dacte-section-header">Documentos Origin&aacute;rios (NF-e / NF)</div>
      <div class="dacte-section-body" style="flex-direction:column; padding:4px 8px;">
        ${docRefRows}
      </div>
    </div>

    <!-- MODAL RODOVIARIO -->
    <div class="dacte-section"><div class="dacte-section-header">Modal Rodovi&aacute;rio</div><div class="dacte-section-body">
      <div class="dacte-field"><span class="dacte-lbl">RNTRC</span><span class="dacte-val">${esc(d.rntrc || '-')}</span></div>
    </div></div>

    <!-- OBSERVACOES -->
    <div class="dacte-obs-box">
      <div class="dacte-lbl">Observa&ccedil;&otilde;es / Dados do Produto</div>
      <div>${esc(obsText || '-')}</div>
    </div>

    <!-- RODAPE -->
    <div class="footer-line">
      <span>DATA E HORA DE IMPRESS&Atilde;O: ${now}</span>
      <span>QLMED - Sistema de Gest&atilde;o Fiscal</span>
    </div>

  </div>
  ${autoPrint ? '<script>window.addEventListener("load", function() { window.print(); });</script>' : ''}
</body>
</html>`;
}
