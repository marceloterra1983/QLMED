import { gv } from '@/lib/xml-helpers';
import { ensureArray } from '@/lib/utils';
import type { XmlNode } from '@/types/xml-common';
import type { DanfeData, DanfeProduct, DanfeParcela } from './pdf-types';

function extractIcmsFromImposto(imp: XmlNode): { orig: string; cst: string; vBC: string; vICMS: string; pICMS: string } {
  const icms = imp?.ICMS as XmlNode | undefined;
  if (!icms) return { orig: '', cst: '', vBC: '0.00', vICMS: '0.00', pICMS: '0.00' };
  const key = Object.keys(icms).find((k) => k.startsWith('ICMS'));
  const g = key ? icms[key] as XmlNode : null;
  if (!g) return { orig: '', cst: '', vBC: '0.00', vICMS: '0.00', pICMS: '0.00' };
  return {
    orig: gv(g, 'orig'),
    cst: gv(g, 'CST') || gv(g, 'CSOSN'),
    vBC: gv(g, 'vBC') || '0.00',
    vICMS: gv(g, 'vICMS') || '0.00',
    pICMS: gv(g, 'pICMS') || '0.00',
  };
}

function extractIpiFromImposto(imp: XmlNode): { vIPI: string; pIPI: string } {
  const ipi = imp?.IPI as XmlNode | undefined;
  if (!ipi) return { vIPI: '0.00', pIPI: '0.00' };
  const g = (ipi.IPITrib || ipi.IPINT) as XmlNode | undefined;
  if (!g) return { vIPI: '0.00', pIPI: '0.00' };
  return { vIPI: gv(g, 'vIPI') || '0.00', pIPI: gv(g, 'pIPI') || '0.00' };
}

function formatEmitEnd(ender: XmlNode): string {
  const lgr = gv(ender, 'xLgr');
  const nro = gv(ender, 'nro');
  const cpl = gv(ender, 'xCpl');
  const street = [lgr, nro ? `Nº ${nro}` : '', cpl].filter(Boolean).join(', ');
  return street;
}

export function extractDanfeData(parsed: XmlNode): DanfeData {
  const proc = (parsed.nfeProc || parsed.NFe || parsed) as XmlNode;
  const nfe = (proc.NFe || proc) as XmlNode;
  const inf = (nfe.infNFe || nfe) as XmlNode;
  const ide = (inf.ide || {}) as XmlNode;
  const emit = (inf.emit || {}) as XmlNode;
  const dest = (inf.dest || {}) as XmlNode;
  const emitEnd = (emit.enderEmit || {}) as XmlNode;
  const destEnd = (dest.enderDest || {}) as XmlNode;
  const tot = ((inf.total as XmlNode)?.ICMSTot || {}) as XmlNode;
  const transp = (inf.transp || {}) as XmlNode;
  const transporta = (transp.transporta || {}) as XmlNode;
  const veic = (transp.veicTransp || {}) as XmlNode;
  const vol = transp.vol ? (Array.isArray(transp.vol) ? transp.vol[0] : transp.vol) as XmlNode : ({} as XmlNode);
  const cobr = (inf.cobr || {}) as XmlNode;
  const fat = (cobr.fat || {}) as XmlNode;
  const infAdic = (inf.infAdic || {}) as XmlNode;

  let chNFe = '';
  const protNFe = (proc.protNFe as XmlNode);
  const protInfProt = (protNFe?.infProt as XmlNode);
  if (protInfProt?.chNFe) chNFe = String(protInfProt.chNFe);
  else if ((inf.$ as XmlNode)?.Id) chNFe = String((inf.$ as XmlNode).Id).replace('NFe', '');

  let nProt = '';
  let dhRecbto = '';
  if (protInfProt) {
    nProt = gv(protInfProt, 'nProt');
    dhRecbto = gv(protInfProt, 'dhRecbto');
  }

  const dets = ensureArray<XmlNode>(inf.det as XmlNode | XmlNode[]);
  const products: DanfeProduct[] = dets.map((det) => {
    const prod = (det.prod || {}) as XmlNode;
    const imp = (det.imposto || {}) as XmlNode;
    const icms = extractIcmsFromImposto(imp);
    const ipi = extractIpiFromImposto(imp);
    return {
      cProd: gv(prod, 'cProd'),
      xProd: gv(prod, 'xProd'),
      NCM: gv(prod, 'NCM'),
      origCST: `${icms.orig || '0'}${String(icms.cst || '').padStart(2, '0')}`,
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
      vTotTrib: gv(imp, 'vTotTrib') || '0.00',
      infAdProd: gv(det, 'infAdProd'),
    };
  });

  const dups = ensureArray<XmlNode>(cobr.dup as XmlNode | XmlNode[]);
  const parcelas: DanfeParcela[] = dups.map((d) => ({
    nDup: gv(d, 'nDup'),
    dVenc: gv(d, 'dVenc'),
    vDup: gv(d, 'vDup'),
  }));

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
    emitEnd: formatEmitEnd(emitEnd),
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
